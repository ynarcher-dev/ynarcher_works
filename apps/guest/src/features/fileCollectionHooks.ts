/**
 * 파일받기(FILE_COLLECTION) — GUEST 조회·변경 훅.
 *
 * **조건을 화면이 만들지 않는다.** 무엇이 내 것인지는 RLS(`app.file_collection_guest_assignment_ids`)가
 * 정하고, 여기서는 그 결과를 정확한 모듈·정확한 응답 칸으로만 좁혀 부른다. 같은 기업의 다른
 * 게스트가 낸 파일·댓글·진행률은 조회 자체가 돌아오지 않으므로 화면이 거를 것도 없다.
 *
 * 질의 키는 **계정·맥락·모듈**을 모두 담는다. 한 브라우저에서 계정이나 사업이 갈리면 옛
 * 응답이 새 화면의 자리에 들어앉으면 안 되기 때문이다(전환 시 `['guest']` 전체가 초기화되지만,
 * 그 사이 날아온 응답까지 키가 갈라 준다).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  FileCollectionAssignmentDto,
  FileCollectionCommentDto,
  FileCollectionDto,
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
} from '@ynarcher/master-data'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestClient } from '@/lib/useGuestClient'
import {
  FILE_ENDPOINT,
  addComment,
  commitPendingFile,
  downloadFile,
  removeFile,
  submitResponse,
  uploadFiles,
  type FileCollectionGateway,
  type FileEndpointResult,
  type UploadCandidate,
  type UploadOutcome,
} from '@/features/fileCollectionService'

/** 한 번에 읽는 행 수와 상한. 상한에 닿으면 자른 목록을 내놓지 않는다. */
const PAGE_SIZE = 500
const MAX_ROWS = 5000

/**
 * 상한에 닿았다는 사실 자체가 화면에 서야 하는 오류다.
 *
 * 잘린 목록을 그대로 돌려주면 문항 수·진행률·"올린 파일"이 **틀린 값으로 조용히** 선다 —
 * 참여자는 낸 자료가 사라졌다고 읽거나, 아직 낼 것이 남았는데 다 냈다고 읽는다. 부분 목록은
 * 없는 것보다 나쁘므로 여기서 멈추고, 화면이 그 문장을 그대로 보여 준다.
 */
export class FileCollectionTooManyRowsError extends Error {
  constructor(readonly label: string) {
    super(
      '자료가 너무 많아 목록을 전부 불러오지 못했습니다. 일부만 보여 드리지 않으니 담당자에게 알려 주십시오.',
    )
    this.name = 'FileCollectionTooManyRowsError'
  }
}

/** 화면 배너에 세울 문장. 상한 오류는 제 문장을 그대로 쓰고, 그 밖의 실패는 한 문장으로 접는다. */
export function loadErrorMessage(errors: readonly unknown[], fallback: string): string {
  for (const error of errors) {
    if (error instanceof FileCollectionTooManyRowsError) return error.message
  }
  return fallback
}

type PageQuery = (
  from: number,
  to: number,
) => PromiseLike<{ data: unknown[] | null; error: unknown }>

/**
 * 모든 행을 범위로 나눠 읽는다. 정렬은 부르는 쪽이 **안정적으로**(마지막 축이 `id`) 준다 —
 * 같은 값이 여럿인 정렬로 페이지를 나누면 경계에서 행이 빠지거나 겹친다.
 */
async function fetchAllRows<T>(label: string, page: PageQuery): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) return out
  }
  throw new FileCollectionTooManyRowsError(label)
}

// ---------------------------------------------------------------------------
// 조회 범위(계정 · 맥락 · 모듈)
// ---------------------------------------------------------------------------

export interface FileCollectionScope {
  userId: string | null
  contextType: string | null
  contextId: string | null
  moduleId: string | null
  /** 이 화면의 질의 키 접두사. 하위 질의는 이 뒤에 자기 이름과 id를 붙인다. */
  key: (string | null)[]
  /** 화면 상태를 통째로 다시 세워야 하는 단위(계정·맥락·모듈이 바뀌면 달라진다). */
  token: string
}

function scopeToken(s: Omit<FileCollectionScope, 'key' | 'token'>): string {
  return [s.userId, s.contextType, s.contextId, s.moduleId].join('|')
}

export function useFileCollectionScope(moduleId: string | undefined): FileCollectionScope {
  const userId = useGuestStore((s) => s.user?.id ?? null)
  const contextType = useGuestStore((s) => s.program?.entityKey ?? null)
  const contextId = useGuestStore((s) => s.program?.id ?? null)
  return useMemo(() => {
    const base = { userId, contextType, contextId, moduleId: moduleId ?? null }
    return {
      ...base,
      key: ['guest', 'file-collection', userId, contextType, contextId, moduleId ?? null],
      token: scopeToken(base),
    }
  }, [userId, contextType, contextId, moduleId])
}

/** 지금 스토어가 말하는 범위. 진행 중이던 작업이 남의 화면에 착지하지 않게 대조하는 값이다. */
function currentScopeToken(moduleId: string | null): string {
  const state = useGuestStore.getState()
  return scopeToken({
    userId: state.user?.id ?? null,
    contextType: state.program?.entityKey ?? null,
    contextId: state.program?.id ?? null,
    moduleId,
  })
}

/**
 * 진행 중인 작업이 **아직 이 화면의 일인가**.
 *
 * 스토어만 보아서는 부족하다 — 계정·사업이 그대로여도 창이 닫히거나 화면을 떠났으면, 뒤늦게
 * 돌아온 응답의 성공 알림은 이미 다른 일을 하고 있는 사람 앞에 선다. 그래서 두 가지를 함께
 * 본다: **이 화면이 아직 살아 있는가**와 **스토어의 범위가 시작할 때와 같은가**.
 *
 * 이 값은 *보고와 다음 단계*만 가른다. 이미 끝난 일(확정까지 성공한 업로드)을 되돌리지는
 * 않는다 — 서버가 받은 사실은 남고, 올라가다 만 줄은 돌아왔을 때 그 자리에서 다시 확인할 수
 * 있다.
 */
export interface ScopeGuard {
  /** 지금 이 자리로 결과를 돌려보내도 되는가(살아 있고 범위가 같은가). */
  isActive: () => boolean
}

export function useScopeGuard(scope: FileCollectionScope): ScopeGuard {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return useMemo(
    () => ({
      isActive: () => alive.current && currentScopeToken(scope.moduleId) === scope.token,
    }),
    [scope],
  )
}

// ---------------------------------------------------------------------------
// 배선 — 서비스(순수 흐름)에 실제 통신을 꽂는다
// ---------------------------------------------------------------------------

async function readErrorBody(error: unknown): Promise<FileEndpointResult<never>['error']> {
  const context = (error as { context?: unknown } | null)?.context as Response | undefined
  if (context && typeof context.json === 'function') {
    try {
      return (await context.json()) as FileEndpointResult<never>['error']
    } catch {
      /* 본문이 JSON이 아니면 사유를 지어내지 않는다. */
    }
  }
  return { error: 'request_failed' }
}

function createGateway(client: SupabaseClient, guard: ScopeGuard): FileCollectionGateway {
  return {
    async invokeFile<T>(body: Record<string, unknown>): Promise<FileEndpointResult<T>> {
      const { data, error } = await client.functions.invoke<T>(FILE_ENDPOINT, { body })
      if (error) return { ok: false, data: null, error: await readErrorBody(error) }
      return { ok: true, data: (data ?? null) as T | null, error: null }
    },
    async uploadToSignedUrl(input) {
      const { error } = await client.storage
        .from(input.bucket)
        .uploadToSignedUrl(input.path, input.token, input.file as Blob, {
          contentType: input.contentType,
          upsert: false,
        })
      return { error }
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args)
      return { data: (data ?? null) as T | null, error }
    },
    isStale: () => !guard.isActive(),
    deliver: (url, fileName) => {
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
  }
}

function useGateway(scope: FileCollectionScope): FileCollectionGateway | null {
  const client = useGuestClient()
  const guard = useScopeGuard(scope)
  return useMemo(() => (client ? createGateway(client, guard) : null), [client, guard])
}

/** 변경 뒤 이 화면의 질의만 다시 받는다. 맥락이 이미 갈렸으면 아무것도 건드리지 않는다. */
function useScopedRefresh(scope: FileCollectionScope) {
  const qc = useQueryClient()
  return useCallback(
    (extra?: (string | null)[]) => {
      if (currentScopeToken(scope.moduleId) !== scope.token) return
      void qc.invalidateQueries({ queryKey: extra ? [...scope.key, ...extra] : scope.key })
    },
    [qc, scope],
  )
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

const COLLECTION_COLS = 'id, program_module_id, title, guide, published_at'
const NODE_COLS =
  'id, collection_id, parent_id, node_type, title, guide, is_required, sort_order, updated_at'
const ASSIGNMENT_COLS =
  'id, collection_id, participant_id, guest_user_id, assigned_at, revoked_at'
const RESPONSE_COLS = 'id, assignment_id, node_id, status, round, submitted_at, reviewed_at'
const FILE_COLS =
  'id, response_id, round, original_name, content_type, byte_size, status, uploaded_by, created_at'
const COMMENT_COLS = 'id, response_id, round, author_side, body, created_at'

/** 이 모듈의 파일받기 머리 행. 공개 전이거나 내 배정이 없으면 RLS가 아무것도 주지 않는다. */
export function useFileCollection(scope: FileCollectionScope) {
  const client = useGuestClient()
  return useQuery({
    queryKey: [...scope.key, 'collection'],
    enabled: Boolean(client && scope.moduleId),
    queryFn: async (): Promise<FileCollectionDto | null> => {
      const { data, error } = await client!
        .from('file_collections')
        .select(COLLECTION_COLS)
        .eq('program_module_id', scope.moduleId)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as FileCollectionDto | null
    },
  })
}

/** 내 배정 한 줄(계정당 하나). 없으면 이 요청은 나에게 온 것이 아니다. */
export function useMyAssignment(scope: FileCollectionScope, collectionId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: [...scope.key, 'assignment', collectionId ?? null],
    enabled: Boolean(client && collectionId),
    queryFn: async (): Promise<FileCollectionAssignmentDto | null> => {
      const { data, error } = await client!
        .from('file_collection_assignments')
        .select(ASSIGNMENT_COLS)
        .eq('collection_id', collectionId)
        .is('revoked_at', null)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .limit(1)
      if (error) throw error
      const rows = (data ?? []) as unknown as FileCollectionAssignmentDto[]
      return rows[0] ?? null
    },
  })
}

/** 문항 트리(폴더·문항). 공개 뒤에는 바뀌지 않는다. */
export function useCollectionNodes(scope: FileCollectionScope, collectionId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: [...scope.key, 'nodes', collectionId ?? null],
    enabled: Boolean(client && collectionId),
    queryFn: async (): Promise<FileCollectionNodeDto[]> =>
      fetchAllRows<FileCollectionNodeDto>('nodes', (from, to) =>
        client!
          .from('file_collection_nodes')
          .select(NODE_COLS)
          .eq('collection_id', collectionId)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
  })
}

/** 내 응답 칸 전부(문항별 상태·회차). */
export function useMyResponses(scope: FileCollectionScope, assignmentId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: [...scope.key, 'responses', assignmentId ?? null],
    enabled: Boolean(client && assignmentId),
    queryFn: async (): Promise<FileCollectionResponseDto[]> =>
      fetchAllRows<FileCollectionResponseDto>('responses', (from, to) =>
        client!
          .from('file_collection_responses')
          .select(RESPONSE_COLS)
          .eq('assignment_id', assignmentId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to),
      ),
  })
}

/** 응답 칸 하나에 붙은 파일(회차 전체). 내린 파일은 오지 않는다. */
export function useResponseFiles(scope: FileCollectionScope, responseId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: [...scope.key, 'files', responseId ?? null],
    enabled: Boolean(client && responseId),
    queryFn: async (): Promise<FileCollectionFileDto[]> =>
      fetchAllRows<FileCollectionFileDto>('files', (from, to) =>
        client!
          .from('file_collection_files')
          .select(FILE_COLS)
          .eq('response_id', responseId)
          .is('deleted_at', null)
          .order('round', { ascending: true })
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
  })
}

/** 응답 칸 하나의 코멘트(담당자 피드백과 내가 남긴 메모). */
export function useResponseComments(scope: FileCollectionScope, responseId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: [...scope.key, 'comments', responseId ?? null],
    enabled: Boolean(client && responseId),
    queryFn: async (): Promise<FileCollectionCommentDto[]> =>
      fetchAllRows<FileCollectionCommentDto>('comments', (from, to) =>
        client!
          .from('file_collection_comments')
          .select(COMMENT_COLS)
          .eq('response_id', responseId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
  })
}

// ---------------------------------------------------------------------------
// 변경 — 전부 서비스의 흐름을 그대로 탄다
// ---------------------------------------------------------------------------

/**
 * 고른 파일을 순서대로 올린다. 결과는 **파일마다** 돌아오며, 일부가 실패해도 성공한 것은
 * 성공으로 남는다 — 부르는 화면이 그 목록을 그대로 보여 준다.
 */
export function useUploadFiles(scope: FileCollectionScope) {
  const gw = useGateway(scope)
  const refresh = useScopedRefresh(scope)
  return useMutation({
    mutationFn: async (input: {
      responseId: string
      files: readonly UploadCandidate[]
    }): Promise<UploadOutcome[]> => {
      if (!gw) throw new Error('세션이 없습니다.')
      return uploadFiles(gw, input)
    },
    onSuccess: () => refresh(),
  })
}

/** 올라가다 만 파일의 재확인(확정만 다시 보낸다). */
export function useCommitPendingFile(scope: FileCollectionScope) {
  const gw = useGateway(scope)
  const refresh = useScopedRefresh(scope)
  return useMutation({
    mutationFn: async (fileId: string) => {
      if (!gw) throw new Error('세션이 없습니다.')
      return commitPendingFile(gw, fileId)
    },
    onSuccess: () => refresh(),
  })
}

/** 파일 내리기(현재 회차의 미제출 파일만 서버가 받는다). */
export function useRemoveFile(scope: FileCollectionScope) {
  const gw = useGateway(scope)
  const refresh = useScopedRefresh(scope)
  return useMutation({
    mutationFn: async (fileId: string) => {
      if (!gw) throw new Error('세션이 없습니다.')
      await removeFile(gw, fileId)
    },
    onSuccess: () => refresh(),
  })
}

/** 문항 단위 제출. */
export function useSubmitResponse(scope: FileCollectionScope) {
  const gw = useGateway(scope)
  const refresh = useScopedRefresh(scope)
  return useMutation({
    mutationFn: async (responseId: string) => {
      if (!gw) throw new Error('세션이 없습니다.')
      return submitResponse(gw, responseId)
    },
    onSuccess: () => refresh(),
  })
}

/** 코멘트 남기기. */
export function useAddComment(scope: FileCollectionScope) {
  const gw = useGateway(scope)
  const refresh = useScopedRefresh(scope)
  return useMutation({
    mutationFn: async (input: { responseId: string; body: string }) => {
      if (!gw) throw new Error('세션이 없습니다.')
      return addComment(gw, input)
    },
    onSuccess: () => refresh(),
  })
}

/** 내려받기(서명은 Edge가 기록을 남긴 뒤에 발급한다). */
export function useDownloadCollectionFile(scope: FileCollectionScope) {
  const gw = useGateway(scope)
  return useMutation({
    mutationFn: async (fileId: string) => {
      if (!gw) throw new Error('세션이 없습니다.')
      return downloadFile(gw, fileId)
    },
  })
}
