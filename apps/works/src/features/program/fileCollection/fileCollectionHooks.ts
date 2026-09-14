import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FILE_COLLECTION_NODE_ATTACHMENT_TYPE } from '@ynarcher/master-data'
import type {
  FileCollectionAssignmentDto,
  FileCollectionCommentDto,
  FileCollectionDto,
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
} from '@ynarcher/master-data'
import type {
  StructureDeleteItem,
  StructurePayloadItem,
} from '@/features/program/fileCollection/structureDraft'
import { ATTACHMENT_COUNT_KEY } from '@/features/networks/materialHooks'
import { supabase } from '@/lib/supabase'

/**
 * 파일받기(WORKS) 데이터 계층.
 *
 * **읽기는 RLS를 통한 SELECT, 쓰기는 전부 RPC다.** 상태·회차·행위자·파일 경로는 서버가
 * 소유하므로 여기에는 테이블 직접 DML이 한 줄도 없다(DB 계약:
 * supabase/migrations/20260913210500_file_collection_schema.sql).
 *
 * 캐시 키는 `['file-collection', moduleId, ...]`로 모듈에 매달아 둔다 — 사업 상세에서 모듈을
 * 갈아타면 앞 모듈의 트리·명단·응답이 새 모듈 화면에 남아 있을 수 없다.
 */

const KEY = 'file-collection'

/** 한 번에 받아 오는 행 수와 순회 상한. 상한에 닿으면 **조용히 자르지 않고** 알린다. */
const PAGE_SIZE = 1000
const MAX_PAGES = 20

export interface PagedRows<T> {
  rows: T[]
  /** 상한(PAGE_SIZE × MAX_PAGES)에 걸려 더 못 읽은 상태. 화면이 경고를 세운다. */
  truncated: boolean
}

/**
 * 범위 순회 조회. `limit(1000)` 한 줄로 끝내면 응답 칸이 문항×대상이라 곧 1000을 넘고,
 * 그때부터 관제 화면이 **조용히 틀린 숫자**를 답한다. 넘치면 그 사실을 값으로 돌려준다.
 *
 * 호출하는 조회는 **같은 값이 없는 순서**를 세워야 한다 — `sort_order`나 `created_at`처럼
 * 같은 값이 여럿일 수 있는 열만으로 정렬하면 페이지 경계에서 같은 행이 두 번 오거나
 * 한 행이 아예 빠진다. 그래서 모든 조회가 마지막 정렬 키로 `id`를 붙인다.
 */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<PagedRows<T>> {
  const rows: T[] = []
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const from = i * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { rows, truncated: false }
  }
  return { rows, truncated: true }
}

const COLLECTION_COLS =
  'id, program_module_id, title, guide, level_names, published_at, created_at, updated_at'
const NODE_COLS =
  'id, collection_id, parent_id, node_type, title, guide, is_required, sort_order, updated_at'
const RESPONSE_COLS =
  'id, assignment_id, node_id, status, round, submitted_at, reviewed_at'

/**
 * 모듈의 머리 행. **없는 것과 못 읽는 것을 가른다** — `maybeSingle()`로 0건은 `null`로 받고
 * 조회 실패는 던진다. 삼키면 권한이 없는 화면이 "아직 시작하지 않았습니다"로 읽힌다.
 */
export function useFileCollection(moduleId: string | undefined) {
  return useQuery({
    queryKey: [KEY, moduleId, 'collection'],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<FileCollectionDto | null> => {
      const { data, error } = await supabase
        .from('file_collections')
        .select(COLLECTION_COLS)
        .eq('program_module_id', moduleId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as FileCollectionDto | null
    },
  })
}

/** 트리 전체(문항·폴더). 깊이 제한이 없으므로 부모 관계는 화면의 순수 계산부가 편다. */
export function useCollectionNodes(moduleId: string | undefined, collectionId: string | undefined) {
  return useQuery({
    queryKey: [KEY, moduleId, 'nodes', collectionId],
    enabled: Boolean(collectionId),
    queryFn: async (): Promise<PagedRows<FileCollectionNodeDto>> =>
      fetchAllPages<FileCollectionNodeDto>((from, to) =>
        supabase
          .from('file_collection_nodes')
          .select(NODE_COLS)
          .eq('collection_id', collectionId)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: FileCollectionNodeDto[] | null
          error: { message: string } | null
        }>,
      ),
  })
}

/**
 * 문항별 **담당자 자료** 건수(문항 id → 건수).
 *
 * 이 조회만 `attachments`를 본다 — 게스트 제출물이 아니라 담당자가 문항에 붙여 건네는
 * 양식·견본이고, 그쪽 원장이 공용 첨부이기 때문이다(20260914150000).
 *
 * 문항 id 묶음으로 묻지 않고 **모듈 하나로** 묻는다. 문항은 수백 개가 될 수 있어 id를 다
 * 실으면 조회 주소가 그만큼 길어지는데, 이 종류의 첨부는 행마다 `program_module_id`를 들고
 * 있어 모듈 한 칸으로 같은 답을 얻는다.
 *
 * 키 앞자리를 `ATTACHMENT_COUNT_KEY`로 두는 것은 약속이다 — 자료를 올리거나 내리는
 * 뮤테이션이 그 접두사를 무효화하므로, 창에서 파일을 붙이면 표의 클립도 함께 갱신된다.
 */
export function useNodeFileCounts(moduleId: string | undefined) {
  return useQuery({
    queryKey: [ATTACHMENT_COUNT_KEY, FILE_COLLECTION_NODE_ATTACHMENT_TYPE, 'module', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('target_id')
        .eq('target_type', FILE_COLLECTION_NODE_ATTACHMENT_TYPE)
        .eq('program_module_id', moduleId)
        .is('deleted_at', null)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as { target_id: string }[]) {
        counts[row.target_id] = (counts[row.target_id] ?? 0) + 1
      }
      return counts
    },
  })
}

/**
 * 배정 명단. **회수된 배정도 함께 읽는다** — 낸 자료는 남아 있고, 목록에서 감추면 이미 받은
 * 제출물이 화면에서 사라진다. 회수 여부는 행이 스스로 말하고 화면이 구분해 세운다.
 *
 * 이름은 계정을 임베드해 읽는다. 명부에서 users로 가는 길이 둘이라(배정 대상·배정한 사람)
 * FK 힌트가 없으면 PostgREST가 조회 전체를 거절한다(PGRST201).
 *
 * 명단도 **순회해서 읽는다.** 한 번의 SELECT는 1000행에서 잘리고, 그 절단은 조용하다 —
 * 대상 1200명인 파일받기에서 뒤쪽 200명이 목록에도, 진행률 분모에도 없는 채로
 * 화면이 정상처럼 보인다.
 */
export function useCollectionAssignments(
  moduleId: string | undefined,
  collectionId: string | undefined,
) {
  return useQuery({
    queryKey: [KEY, moduleId, 'assignments', collectionId],
    enabled: Boolean(collectionId),
    queryFn: async (): Promise<PagedRows<FileCollectionAssignmentDto>> => {
      type Raw = Omit<FileCollectionAssignmentDto, 'guest_name'> & {
        guest_user: { name: string | null } | null
      }
      const paged = await fetchAllPages<Raw>((from, to) =>
        supabase
          .from('file_collection_assignments')
          .select(
            'id, collection_id, participant_id, guest_user_id, assigned_at, revoked_at, ' +
              'guest_user:users!file_collection_assignments_guest_user_id_fkey(name)',
          )
          .eq('collection_id', collectionId)
          .is('deleted_at', null)
          .order('assigned_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: Raw[] | null
          error: { message: string } | null
        }>,
      )
      return {
        truncated: paged.truncated,
        rows: paged.rows.map((row) => ({
          id: row.id,
          collection_id: row.collection_id,
          participant_id: row.participant_id,
          guest_user_id: row.guest_user_id,
          assigned_at: row.assigned_at,
          revoked_at: row.revoked_at,
          guest_name: row.guest_user?.name ?? null,
        })),
      }
    },
  })
}

/** 응답 칸 전부(문항 × 대상). 관제의 모든 숫자가 이 목록에서 파생된다. */
export function useCollectionResponses(moduleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, moduleId, 'responses'],
    enabled: Boolean(moduleId) && enabled,
    queryFn: async (): Promise<PagedRows<FileCollectionResponseDto>> =>
      fetchAllPages<FileCollectionResponseDto>((from, to) =>
        supabase
          .from('file_collection_responses')
          .select(RESPONSE_COLS)
          .eq('program_module_id', moduleId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{
          data: FileCollectionResponseDto[] | null
          error: { message: string } | null
        }>,
      ),
  })
}

export interface ResponseDetail {
  files: FileCollectionFileDto[]
  comments: FileCollectionCommentDto[]
  /** 파일·코멘트 중 하나라도 상한에 걸렸는가. 창이 경고를 세운다. */
  truncated: boolean
}

/**
 * 응답 칸 하나의 파일·코멘트. 지난 회차까지 전부 읽는다 — 보완 요청 뒤에도 처음 낸 것이
 * 남아야 검토 근거가 성립한다. 올린 사람·쓴 사람의 이름은 **WORKS에서만** 읽는다.
 *
 * 두 목록 모두 회차가 쌓이면 늘어나므로 순회해서 읽고, 정렬은 `created_at` 뒤에 `id`를
 * 붙여 페이지 경계에서 같은 시각의 행이 겹치거나 빠지지 않게 한다.
 */
export function useResponseDetail(responseId: string | null | undefined) {
  return useQuery({
    queryKey: [KEY, 'response', responseId],
    enabled: Boolean(responseId),
    queryFn: async (): Promise<ResponseDetail> => {
      type RawFile = FileCollectionFileDto & { uploader: { name: string | null } | null }
      type RawComment = FileCollectionCommentDto & { author: { name: string | null } | null }
      const [filesPaged, commentsPaged] = await Promise.all([
        fetchAllPages<RawFile>((from, to) =>
          supabase
            .from('file_collection_files')
            .select(
              'id, response_id, round, original_name, content_type, byte_size, status, ' +
                'uploaded_by, created_at, uploader:users!file_collection_files_uploaded_by_fkey(name)',
            )
            .eq('response_id', responseId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: RawFile[] | null
            error: { message: string } | null
          }>,
        ),
        fetchAllPages<RawComment>((from, to) =>
          supabase
            .from('file_collection_comments')
            .select(
              'id, response_id, round, author_side, body, created_at, ' +
                'author:users!file_collection_comments_author_user_id_fkey(name)',
            )
            .eq('response_id', responseId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: RawComment[] | null
            error: { message: string } | null
          }>,
        ),
      ])
      return {
        truncated: filesPaged.truncated || commentsPaged.truncated,
        files: filesPaged.rows.map((f) => ({ ...f, uploader_name: f.uploader?.name ?? null })),
        comments: commentsPaged.rows.map((c) => ({ ...c, author_name: c.author?.name ?? null })),
      }
    },
  })
}

/**
 * 쓰기 뒤의 새로고침 폭.
 *
 * 모듈 아래 전부를 상하게 한다 — 구조 하나를 고치면 응답 칸·진행률·요약이 함께 달라지고,
 * 고른 것만 새로 읽으면 같은 화면 안에서 트리와 관제 숫자가 어긋난 채 남는다.
 * 응답 상세는 모듈 키 밖에 있으므로 함께 부른다.
 */
function useRefreshModule(moduleId: string) {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: [KEY, moduleId] })
    void qc.invalidateQueries({ queryKey: [KEY, 'response'] })
  }
}

/** 머리 행 생성·수정(초안). 모듈이 '준비'여도 초안은 짤 수 있다. */
export function useUpsertCollection(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (input: { title?: string; guide?: string | null }): Promise<string> => {
      const { data, error } = await supabase.rpc('file_collection_upsert', {
        p_program_module_id: moduleId,
        p_title: input.title ?? '',
        p_guide: input.guide ?? null,
      })
      if (error) throw error
      return data as string
    },
    // 응답이 끊겨도 서버에서는 반영됐을 수 있다 — 어느 결말이든 정본을 다시 읽는다.
    onSettled: refresh,
  })
}

export interface SaveNodeInput {
  collectionId: string
  nodeId?: string | null
  parentId?: string | null
  nodeType: 'FOLDER' | 'QUESTION'
  title: string
  guide?: string | null
  isRequired: boolean
  sortOrder: number
  /** 낙관적 잠금 기준값(수정일 때만). 다른 사람이 먼저 저장하면 서버가 40001로 거절한다. */
  expectedUpdatedAt?: string | null
}

/** 노드 저장(생성·수정). 공개 후에는 서버가 거절한다. */
export function useSaveNode(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (input: SaveNodeInput): Promise<string> => {
      const { data, error } = await supabase.rpc('file_collection_save_node', {
        p_collection_id: input.collectionId,
        p_node_id: input.nodeId ?? null,
        p_parent_id: input.parentId ?? null,
        p_node_type: input.nodeType,
        p_title: input.title,
        p_guide: input.guide ?? null,
        p_is_required: input.isRequired,
        p_sort_order: input.sortOrder,
        p_expected_updated_at: input.expectedUpdatedAt ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSettled: refresh,
  })
}

/**
 * 형제 순서 한 칸 이동. **쓰기 한 번이고 그 한 번이 원자적이다** —
 * `file_collection_reorder_node`가 지금 원장의 형제 순서에서 인접한 둘을 맞바꾸고 1..n을
 * 같은 트랜잭션에서 다시 매긴다. 종전처럼 마디마다 RPC를 부르면 중간에서 끊길 때 앞쪽만
 * 반영된, 누른 뜻과 다른 순서가 남았다.
 *
 * 돌려주는 값은 실제로 바뀌었는가다 — 양 끝에서 누르면 서버가 오류 없이 `false`를 답한다
 * (화면은 그 자리의 버튼을 이미 끄고 있으므로 평소에는 오지 않는 값이다).
 */
export function useReorderNode(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (input: {
      nodeId: string
      direction: 'up' | 'down'
    }): Promise<boolean> => {
      const { data, error } = await supabase.rpc('file_collection_reorder_node', {
        p_node_id: input.nodeId,
        p_direction: input.direction,
      })
      if (error) throw error
      return Boolean(data)
    },
    onSettled: refresh,
  })
}

export interface SaveStructureInput {
  collectionId: string
  /** 트리 전체. 부모가 언제나 자기보다 앞에 서야 한다(서버가 검사한다). */
  nodes: StructurePayloadItem[]
  /** 초안에서 사라진 마디들. 서버는 여기 적힌 것만 지운다. */
  deletes: StructureDeleteItem[]
  /** 단계(열) 이름. null이면 서버가 종전 값을 지킨다. */
  levelNames: string[] | null
  /** 머리 행의 낙관적 잠금 기준값. */
  expectedUpdatedAt?: string | null
}

export interface SaveStructureResult {
  collection_id: string
  created: number
  changed: number
  deleted: number
  /** 화면 키 → 새로 발급된 마디 id. */
  keys: Record<string, string>
  updated_at: string
  level_names: string[] | null
  /**
   * 저장 직후 **살아 있는 트리 전부**(새 id와 기준 시각 포함). 화면은 이것으로 곧장 기준을
   * 다시 세운다 — 조회가 돌아오길 기다려 기준을 세우면 그 사이 응답이 저장 전 값일 수 있고,
   * 그때 새로 만든 줄이 id 없이 남아 다음 저장에서 한 번 더 생긴다.
   */
  nodes: FileCollectionNodeDto[]
}

/**
 * 구성 전체를 **한 번에** 저장한다(`file_collection_save_structure`).
 *
 * 마디마다 부르지 않는 이유는 하나다 — 가로 격자는 한 화면에서 여러 줄을 함께 고치므로,
 * 나눠 보내면 중간에서 끊길 때 반쯤 저장된 트리가 남는다. 서버는 인가·공개 잠금·전수 버전
 * 대조를 모두 통과한 뒤 한 트랜잭션에서 적용하고, 하나라도 어긋나면 아무것도 바꾸지 않는다.
 * 그래서 실패 뒤 **같은 초안으로 다시 눌러도** 가지가 두 번 생기지 않는다.
 */
export function useSaveStructure(moduleId: string) {
  const qc = useQueryClient()
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (input: SaveStructureInput): Promise<SaveStructureResult> => {
      const { data, error } = await supabase.rpc('file_collection_save_structure', {
        p_collection_id: input.collectionId,
        p_nodes: input.nodes,
        p_deletes: input.deletes,
        p_level_names: input.levelNames,
        p_expected_updated_at: input.expectedUpdatedAt ?? null,
      })
      if (error) throw error
      return data as SaveStructureResult
    },
    /**
     * 저장이 답한 트리를 **두 캐시에 함께** 적어 넣는다.
     *
     * 머리 행과 마디는 서로 다른 조회다. 저장 전에 떠난 조회가 저장 뒤에 도착하면 화면이
     * 한쪽만 새 값인 뒤섞인 구성을 보게 되고, 그 상태로 다시 저장하면 방금 만든 가지가
     * 한 번 더 생긴다. 그래서 **떠 있는 조회를 먼저 취소하고**(cancelQueries) 정본을 적은 뒤
     * 무효화한다 — 취소하지 않으면 늦게 온 응답이 방금 적은 정본을 덮는다.
     */
    onSuccess: async (result, input) => {
      await qc.cancelQueries({ queryKey: [KEY, moduleId] })
      qc.setQueryData<PagedRows<FileCollectionNodeDto>>(
        [KEY, moduleId, 'nodes', input.collectionId],
        { rows: result.nodes, truncated: false },
      )
      qc.setQueryData<FileCollectionDto | null>([KEY, moduleId, 'collection'], (old) =>
        old
          ? {
              ...old,
              level_names: result.level_names ?? old.level_names,
              updated_at: result.updated_at,
            }
          : old,
      )
    },
    onSettled: refresh,
  })
}

/** 노드 삭제(초안만, 자손까지 소프트 삭제). 돌려주는 수는 실제로 지운 줄 수다. */
export function useDeleteNode(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (nodeId: string): Promise<number> => {
      const { data, error } = await supabase.rpc('file_collection_delete_node', {
        p_node_id: nodeId,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSettled: refresh,
  })
}

/*
 * 배정 훅은 두지 않는다(2026-09-14). 대상은 사업 명부에서 로그인이 열린 게스트 전원이며
 * 서버가 자동으로 세운다 — 명부가 바뀌면 트리거가, 원장을 처음 세우면 file_collection_upsert가
 * `app.fc_sync_targets`를 부른다. 화면에서 사람을 고르거나 회수하는 경로는 없다.
 * (RPC `file_collection_assign`·`file_collection_revoke_assignment`는 DB에 남아 있지만
 *  어느 화면도 부르지 않는다.)
 */

/** 공개. 이 시점부터 트리가 잠기고 응답 칸이 선다(되돌리지 못한다). */
export function usePublishCollection(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (collectionId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('file_collection_publish', {
        p_collection_id: collectionId,
      })
      if (error) throw error
      return data as string
    },
    onSettled: refresh,
  })
}

/** 검토(완료·보완요청). 보완요청은 회차를 올리고 이전 회차 파일을 그대로 둔다. */
export function useReviewResponse(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (input: {
      responseId: string
      decision: 'APPROVED' | 'REWORK_REQUESTED'
      comment?: string | null
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('file_collection_review', {
        p_response_id: input.responseId,
        p_decision: input.decision,
        p_comment: input.comment?.trim() ? input.comment.trim() : null,
      })
      if (error) throw error
      return data as string
    },
    onSettled: refresh,
  })
}

/** 코멘트. 작성자와 쪽(WORKS/GUEST)은 서버가 적는다. */
export function useAddResponseComment(moduleId: string) {
  const refresh = useRefreshModule(moduleId)
  return useMutation({
    mutationFn: async (input: { responseId: string; body: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('file_collection_add_comment', {
        p_response_id: input.responseId,
        p_body: input.body,
      })
      if (error) throw error
      return data as string
    },
    onSettled: refresh,
  })
}

/**
 * 제출 파일 다운로드. 전용 Edge가 접근 기록을 남긴 뒤에만 단기 서명 URL을 발급한다 —
 * 화면에서 Storage를 직접 서명하지 않는다(자료 관리의 `material-download`와 같은 축).
 */
export async function downloadFileCollectionFile(
  fileId: string,
  fileName: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ url: string; fileName: string }>(
    'file-collection-file',
    { body: { action: 'download', fileId } },
  )
  if (error || !data?.url) throw error ?? new Error('download_failed')
  const a = document.createElement('a')
  a.href = data.url
  a.download = data.fileName || fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}
