/**
 * WORKS 파일받기 조회·저장 훅의 **검증용 대역**.
 *
 * 실제 모듈(`apps/works/src/features/program/fileCollection/fileCollectionHooks.ts`)과 같은
 * 이름을 같은 모양으로 내놓되, 통신은 하지 않는다 — Vite 별칭이 이 파일을 대신 물린다.
 * 화면 부품·토큰·글꼴은 전부 실물이고 **데이터만** 표본이다.
 *
 * 구성 저장만은 **정말로 값을 바꾼다.** 가로 격자의 위험은 한 번의 편집이 아니라
 * *저장 → 다시 편집 → 다시 저장*의 이어짐에 있다(새로 만든 가지가 id를 받았는가, 두 번째
 * 저장이 같은 가지를 또 만들지 않는가). 대역이 값을 바꾸지 않으면 그 줄을 영영 재지 못한다.
 */
import { useSyncExternalStore } from 'react'
import type {
  FileCollectionAssignmentDto,
  FileCollectionCommentDto,
  FileCollectionDto,
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
} from '@ynarcher/master-data'
import {
  assignments,
  collection,
  comments,
  files,
  nodes,
  publishedCollection,
  shallowCollection,
  shallowNodes,
  responses,
} from '../../appFixtures'
import { mutation, query, scenario } from '../scenario'

export interface PagedRows<T> {
  rows: T[]
  truncated: boolean
}

export interface ResponseDetail {
  files: FileCollectionFileDto[]
  comments: FileCollectionCommentDto[]
  truncated: boolean
}

/**
 * 실물의 `SaveNodeInput`과 **글자 그대로 같은 모양**이어야 한다(RPC 인자 이름이 아니라 화면이
 * 만들어 넘기는 객체의 모양이다). 여기서 칸 이름이 어긋나면 대역은 통과하는데 실제 화면은
 * 저장되지 않는 상태를 이 검증이 못 잡는다.
 */
export interface SaveNodeInput {
  collectionId: string
  nodeId?: string | null
  parentId?: string | null
  nodeType: 'FOLDER' | 'QUESTION'
  title: string
  guide?: string | null
  isRequired: boolean
  sortOrder: number
  expectedUpdatedAt?: string | null
}

export interface StructurePayloadItem {
  key: string
  parent_key: string | null
  node_id: string | null
  node_type: 'FOLDER' | 'QUESTION'
  title: string
  guide: string | null
  is_required: boolean
  expected_updated_at: string | null
}

export interface SaveStructureInput {
  collectionId: string
  nodes: StructurePayloadItem[]
  deletes: { node_id: string; expected_updated_at: string | null }[]
  levelNames: string[] | null
  expectedUpdatedAt?: string | null
}

export interface SaveStructureResult {
  collection_id: string
  created: number
  changed: number
  deleted: number
  keys: Record<string, string>
  updated_at: string
  level_names: string[] | null
  nodes: FileCollectionNodeDto[]
}

// ---------------------------------------------------------------------
// 값이 실제로 바뀌는 아주 작은 저장소. 구독은 React 18의 외부 저장소 규약을 그대로 쓴다.
// ---------------------------------------------------------------------

const base: FileCollectionDto | null = scenario.empty
  ? null
  : scenario.published
    ? publishedCollection
    : scenario.shallow
      ? shallowCollection
      : collection

let liveCollection = base
let liveNodes: FileCollectionNodeDto[] = scenario.shallow ? shallowNodes : nodes
/** 조회가 늦게 오는 화면을 실제로 만든다(`&slow=1`) — 로딩 뒤 초기화가 이 검증의 대상이다. */
let loadingNodes = scenario.slowLoad
let seq = 0

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** getSnapshot은 **같은 값이면 같은 참조**를 돌려줘야 한다(아니면 무한 렌더가 된다). */
let collectionSnapshot = query<FileCollectionDto | null>(liveCollection)
let nodesSnapshot = query<PagedRows<FileCollectionNodeDto>>(
  { rows: liveNodes, truncated: false },
  { loading: loadingNodes },
)

function publish() {
  collectionSnapshot = query<FileCollectionDto | null>(liveCollection)
  nodesSnapshot = query<PagedRows<FileCollectionNodeDto>>(
    { rows: liveNodes, truncated: false },
    { loading: loadingNodes },
  )
  for (const listener of listeners) listener()
}

if (scenario.slowLoad) {
  setTimeout(() => {
    loadingNodes = false
    publish()
  }, 700)
}

function applyStructure(input: SaveStructureInput): SaveStructureResult {
  const now = new Date(Date.now() + 1000).toISOString()
  const removed = new Set(input.deletes.map((d) => d.node_id))
  const byId = new Map(liveNodes.map((n) => [n.id, n]))
  const keys: Record<string, string> = {}
  const order = new Map<string, number>()
  const next: FileCollectionNodeDto[] = []
  let created = 0
  let changed = 0

  for (const item of input.nodes) {
    const id = item.node_id ?? `gen-${(seq += 1)}`
    if (!item.node_id) created += 1
    keys[item.key] = id
    const parentId = item.parent_key ? (keys[item.parent_key] ?? null) : null
    const sort = (order.get(parentId ?? '') ?? 0) + 1
    order.set(parentId ?? '', sort)
    const before = byId.get(id)
    const row: FileCollectionNodeDto = {
      id,
      collection_id: input.collectionId,
      parent_id: parentId,
      node_type: item.node_type,
      title: item.title,
      guide: item.guide,
      is_required: item.is_required,
      sort_order: sort,
      updated_at: before && sameRow(before, item, parentId, sort) ? before.updated_at : now,
    }
    if (before && !sameRow(before, item, parentId, sort)) changed += 1
    next.push(row)
  }

  liveNodes = next
  liveCollection = liveCollection
    ? {
        ...liveCollection,
        level_names: input.levelNames ?? liveCollection.level_names,
        updated_at: now,
      }
    : liveCollection
  publish()

  return {
    collection_id: input.collectionId,
    created,
    changed,
    deleted: [...removed].filter((id) => byId.has(id)).length,
    keys,
    updated_at: now,
    level_names: liveCollection?.level_names ?? null,
    nodes: next,
  }
}

function sameRow(
  before: FileCollectionNodeDto,
  item: StructurePayloadItem,
  parentId: string | null,
  sort: number,
): boolean {
  return (
    before.parent_id === parentId &&
    before.node_type === item.node_type &&
    before.title === item.title &&
    (before.guide ?? null) === item.guide &&
    before.is_required === item.is_required &&
    before.sort_order === sort
  )
}

export function useFileCollection(_moduleId: string | undefined) {
  return useSyncExternalStore(subscribe, () => collectionSnapshot)
}

export function useCollectionNodes(_moduleId?: string, _collectionId?: string) {
  return useSyncExternalStore(subscribe, () => nodesSnapshot)
}

export function useCollectionAssignments(_moduleId?: string, _collectionId?: string) {
  return query<PagedRows<FileCollectionAssignmentDto>>({ rows: assignments, truncated: false })
}

export function useCollectionResponses(_moduleId: string | undefined, enabled: boolean) {
  return query<PagedRows<FileCollectionResponseDto>>({
    rows: enabled ? responses : [],
    truncated: false,
  })
}

/** 상세 조회는 응답 칸 하나를 두고 나간다 — 전부 돌려주면 남의 회차가 이 창에 선다. */
export function useResponseDetail(responseId: string | null | undefined) {
  return query<ResponseDetail>({
    files: responseId ? files.filter((f) => f.response_id === responseId) : [],
    comments: responseId ? comments.filter((c) => c.response_id === responseId) : [],
    truncated: false,
  })
}

/*
  아래 변경 훅들은 인자와 **돌려주는 값까지** 실물과 같게 맞춘다 — 실물은 RPC가 준 id·건수를
  돌려주고 화면의 `onSuccess`가 그것을 읽는다. 대역이 `void`를 주면 그 자리가 검증에서 비어 버린다.
*/
export function useUpsertCollection(_moduleId: string) {
  return mutation<{ title?: string; guide?: string | null }, string>(collection.id)
}

export function useSaveNode(_moduleId: string) {
  return mutation<SaveNodeInput, string>(nodes[0]?.id ?? 'n-q0')
}

export function useReorderNode(_moduleId: string) {
  return mutation<{ nodeId: string; direction: 'up' | 'down' }, boolean>(true)
}

export function useDeleteNode(_moduleId: string) {
  return mutation<string, number>(1)
}

/**
 * 구성 저장 대역 — 값을 진짜로 바꾼다.
 * `&saveError=1`이면 실패만 흉내 낸다(그때 초안이 남아 있는지가 검증 대상이다).
 */
export function useSaveStructure(_moduleId: string) {
  return {
    mutate: (
      input: SaveStructureInput,
      opts?: {
        onSuccess?: (r: SaveStructureResult) => void
        onError?: (e: unknown) => void
      },
    ) => {
      if (scenario.saveError) {
        opts?.onError?.(new Error('표본: 다른 사용자가 먼저 저장했습니다.'))
        return
      }
      opts?.onSuccess?.(applyStructure(input))
    },
    mutateAsync: (input: SaveStructureInput) => Promise.resolve(applyStructure(input)),
    isPending: false,
    isError: false,
    error: null,
  }
}

export function useAssignTargets(_moduleId: string) {
  return mutation<{ collectionId: string; participantIds: string[] }, number>(1)
}

export function useRevokeAssignment(_moduleId: string) {
  return mutation<string, void>(undefined)
}

export function usePublishCollection(_moduleId: string) {
  return mutation<string, string>(collection.id)
}

export function useReviewResponse(_moduleId: string) {
  return mutation<
    { responseId: string; decision: 'APPROVED' | 'REWORK_REQUESTED'; comment?: string | null },
    string
  >(responses[0]?.id ?? 'res-0')
}

export function useAddResponseComment(_moduleId: string) {
  return mutation<{ responseId: string; body: string }, string>('cmt-0')
}

/** 실물은 Edge Function을 부른다. 대역은 **아무 데도 가지 않고** 성공만 흉내 낸다. */
export async function downloadFileCollectionFile(
  _fileId: string,
  _fileName?: string,
): Promise<void> {
  return Promise.resolve()
}
