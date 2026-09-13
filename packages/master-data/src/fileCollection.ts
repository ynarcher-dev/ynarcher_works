/**
 * 파일받기(FILE_COLLECTION) 공통 어휘 — WORKS(관제)와 GUEST(제출)가 같은 말과 같은 셈을 쓰게 하는 단일 원천.
 *
 * 여기 두는 것은 **원장의 모양(snake_case DTO)·상태 어휘·순수 계산**뿐이다. React도 Supabase도
 * 들이지 않는다 — 다음 세션에서 GUEST 앱이 같은 파일을 읽어 자기 화면을 세우며, 그때 한쪽이
 * 진행률을 다시 구현하면 같은 문항이 두 화면에서 다른 숫자로 읽힌다.
 *
 * DB 계약: supabase/migrations/20260913210500_file_collection_schema.sql
 */

import type { ModuleStatusTone } from './programModule'

/** 마디의 종류. 폴더는 묶기만 하고, 파일을 받는 잎은 문항이다. */
export type FileCollectionNodeType = 'FOLDER' | 'QUESTION'

/** 문항별 응답 칸의 상태(`public.file_collection_status`와 같은 집합). */
export type FileCollectionStatus =
  | 'NOT_SUBMITTED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REWORK_REQUESTED'
  | 'APPROVED'

/** 파일 실물 확인 여부. `PENDING`은 제출 계산에 들지 않는다. */
export type FileCollectionFileStatus = 'PENDING' | 'READY'

/** 코멘트를 남긴 쪽. 서버가 적으므로 화면은 읽기만 한다. */
export type FileCollectionAuthorSide = 'WORKS' | 'GUEST'

// ---------------------------------------------------------------------------
// DTO — 원장 컬럼 그대로. 표시용으로 이름을 바꾸지 않는다(조회문과 한눈에 맞춰 읽는다).
// ---------------------------------------------------------------------------

export interface FileCollectionDto {
  id: string
  program_module_id: string
  title: string
  guide: string | null
  published_at: string | null
  /**
   * 구성표의 단계 이름(왼→오). WORKS 편집 화면만 읽는 값이라 GUEST 조회에는 실리지 않으므로
   * 선택 항목이다. 비어 있으면 화면이 기본 이름을 세운다 — 트리의 실제 깊이는 마디가 답한다.
   */
  level_names?: string[] | null
  created_at?: string | null
  updated_at?: string | null
}

export interface FileCollectionNodeDto {
  id: string
  collection_id: string
  parent_id: string | null
  node_type: FileCollectionNodeType
  title: string
  guide: string | null
  is_required: boolean
  sort_order: number
  updated_at: string
}

export interface FileCollectionAssignmentDto {
  id: string
  collection_id: string
  participant_id: string | null
  guest_user_id: string
  assigned_at: string
  revoked_at: string | null
  /** 배정 대상의 성명. WORKS만 읽는 값이며 게스트 화면에서는 비어 있다. */
  guest_name?: string | null
}

export interface FileCollectionResponseDto {
  id: string
  assignment_id: string
  node_id: string
  status: FileCollectionStatus
  round: number
  submitted_at: string | null
  reviewed_at: string | null
}

export interface FileCollectionFileDto {
  id: string
  response_id: string
  round: number
  original_name: string
  content_type: string | null
  byte_size: number | null
  status: FileCollectionFileStatus
  uploaded_by: string
  created_at: string
  /** 올린 사람의 성명. WORKS 화면만 읽는다(게스트에게는 내려보내지 않는다). */
  uploader_name?: string | null
}

export interface FileCollectionCommentDto {
  id: string
  response_id: string
  round: number
  author_side: FileCollectionAuthorSide
  body: string
  created_at: string
  author_name?: string | null
}

// ---------------------------------------------------------------------------
// 상태 어휘
// ---------------------------------------------------------------------------

/**
 * 상태 라벨. 받는 사람과 보내는 사람이 같은 말을 읽어야 하므로 한 벌만 둔다.
 *
 * `SUBMITTED`를 '제출'이 아니라 '검토 대기'로 적는다 — WORKS 관제에서 이 칸이 답하는 질문은
 * "무엇이 들어왔나"가 아니라 **"내가 무엇을 해야 하나"**이고, GUEST에게도 낸 뒤의 상태는
 * 기다리는 상태다. 두 화면이 같은 사실을 같은 말로 읽는다.
 */
export const FILE_COLLECTION_STATUS_LABEL: Record<FileCollectionStatus, string> = {
  NOT_SUBMITTED: '미제출',
  DRAFT: '작성 중',
  SUBMITTED: '검토 대기',
  REWORK_REQUESTED: '보완 요청',
  APPROVED: '완료',
}

/**
 * 상태 톤. 색이 답하는 것은 '지금 어떤 성격인가'다 —
 * 아직(neutral) · 대기(warning) · 되돌아옴(danger) · 끝(success).
 */
export const FILE_COLLECTION_STATUS_TONE: Record<FileCollectionStatus, ModuleStatusTone> = {
  NOT_SUBMITTED: 'neutral',
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  REWORK_REQUESTED: 'danger',
  APPROVED: 'success',
}

/** 상태 라벨 안전 조회(미지의 값은 원문 그대로 — 지어내는 것보다 낫다). */
export function fileCollectionStatusLabel(status: string | null | undefined): string {
  if (!status) return FILE_COLLECTION_STATUS_LABEL.NOT_SUBMITTED
  return FILE_COLLECTION_STATUS_LABEL[status as FileCollectionStatus] ?? status
}

/** 상태 톤 안전 조회(미지의 값은 중립). */
export function fileCollectionStatusTone(status: string | null | undefined): ModuleStatusTone {
  return FILE_COLLECTION_STATUS_TONE[status as FileCollectionStatus] ?? 'neutral'
}

/** 마디 종류 라벨. */
export const FILE_COLLECTION_NODE_TYPE_LABEL: Record<FileCollectionNodeType, string> = {
  FOLDER: '폴더',
  QUESTION: '문항',
}

/**
 * 검토할 수 있는 상태인가. 서버(`file_collection_review`)가 `SUBMITTED`만 받으므로
 * 화면도 같은 조건으로 버튼을 세운다 — 누를 수 있는데 언제나 실패하는 버튼을 두지 않는다.
 */
export function canReviewResponse(status: FileCollectionStatus | null | undefined): boolean {
  return status === 'SUBMITTED'
}

/**
 * 공개된 파일받기인가. `published_at` 하나가 정본이다.
 *
 * **화면은 더 이상 이 값을 보지 않는다**(2026-09-13). 게스트 노출은 모듈의 공개 상태가
 * 정하고, 구성 편집은 이미 자료를 받은 문항만 서버가 막는다(`fc_node_guard`). 원장 칸을
 * 읽는 자리가 남아 있어 헬퍼만 남겨 둔다.
 */
export function isCollectionPublished(
  collection: Pick<FileCollectionDto, 'published_at'> | null | undefined,
): boolean {
  return Boolean(collection?.published_at)
}

/** 이 회차에서 실제로 낸 것으로 셈하는 파일인가(실물이 확인된 것만). */
export function isCountableFile(
  file: Pick<FileCollectionFileDto, 'status' | 'round'>,
  round: number,
): boolean {
  return file.status === 'READY' && file.round === round
}

// ---------------------------------------------------------------------------
// 트리 — 화면 부품(`CollectionTreeTable`)이 읽는 모양으로 옮긴다
// ---------------------------------------------------------------------------

/**
 * 공용 트리 부품이 받는 마디. `@ynarcher/ui`의 `CollectionTreeNode`와 구조가 같되
 * **타입을 가져오지 않는다** — 어휘 패키지가 UI 부품에 의존하면 순수 TS가 아니게 된다.
 */
export interface FileCollectionTreeNode {
  id: string
  parent_id: string | null
  title: string
  node_kind: FileCollectionNodeType
  sort_order: number
  is_required?: boolean
}

/** 원장 행(`node_type`)을 화면 부품의 어휘(`node_kind`)로 옮긴다. 이 한 줄이 어댑터 전부다. */
export function toCollectionTreeNodes(
  nodes: readonly FileCollectionNodeDto[],
): FileCollectionTreeNode[] {
  return nodes.map((n) => ({
    id: n.id,
    parent_id: n.parent_id,
    title: n.title,
    node_kind: n.node_type,
    sort_order: n.sort_order,
    is_required: n.is_required,
  }))
}

type NodeLike = Pick<FileCollectionNodeDto, 'id' | 'parent_id' | 'node_type' | 'sort_order' | 'title'>

/** 같은 부모 밑의 형제를 순서대로. 순서 규칙은 트리 부품과 같다(sort_order → 제목 → id). */
export function siblingsOf<T extends NodeLike>(
  nodes: readonly T[],
  parentId: string | null,
): T[] {
  return nodes
    .filter((n) => (n.parent_id ?? null) === (parentId ?? null))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      const byTitle = a.title.localeCompare(b.title, 'ko')
      return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id)
    })
}

/** 새 마디를 형제 끝에 붙일 때의 순서값. */
export function nextSortOrder(nodes: readonly NodeLike[], parentId: string | null): number {
  const siblings = siblingsOf(nodes, parentId)
  const last = siblings[siblings.length - 1]
  return last ? last.sort_order + 1 : 1
}

/** 한 마디 아래의 모든 자손 id(자기 자신 제외). 순환이 있어도 멈춘다. */
export function descendantIdsOf(nodes: readonly NodeLike[], rootId: string): string[] {
  const byParent = new Map<string, NodeLike[]>()
  for (const node of nodes) {
    const key = node.parent_id ?? ''
    const bucket = byParent.get(key)
    if (bucket) bucket.push(node)
    else byParent.set(key, [node])
  }
  const out: string[] = []
  const seen = new Set<string>([rootId])
  const stack = [...(byParent.get(rootId) ?? [])]
  while (stack.length > 0) {
    const node = stack.pop() as NodeLike
    if (seen.has(node.id)) continue
    seen.add(node.id)
    out.push(node.id)
    stack.push(...(byParent.get(node.id) ?? []))
  }
  return out
}

/**
 * 부모로 고를 수 있는 폴더 목록(경로 표시용 문자열을 함께 준다).
 *
 * 고르지 못하는 것 셋은 서버 트리거가 막는 것과 같다 — 문항(잎), 자기 자신, 자기 자손.
 * 화면이 먼저 걸러 두면 담당자가 눌러 본 뒤에야 거절을 읽는 일이 없다.
 */
export function parentFolderOptions(
  nodes: readonly FileCollectionNodeDto[],
  movingNodeId?: string | null,
): { id: string; path: string }[] {
  const excluded = new Set<string>()
  if (movingNodeId) {
    excluded.add(movingNodeId)
    for (const id of descendantIdsOf(nodes, movingNodeId)) excluded.add(id)
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pathOf = (node: FileCollectionNodeDto): string => {
    const parts: string[] = []
    const seen = new Set<string>()
    let cursor: FileCollectionNodeDto | undefined = node
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      parts.unshift(cursor.title)
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
    }
    return parts.join(' / ')
  }
  return nodes
    .filter((n) => n.node_type === 'FOLDER' && !excluded.has(n.id))
    .map((n) => ({ id: n.id, path: pathOf(n) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'ko'))
}

/** 한 마디의 뿌리부터의 경로(자기 제목 포함). 상세 화면이 "어디에 속한 문항인가"를 답할 때 쓴다. */
export function nodePath(nodes: readonly FileCollectionNodeDto[], nodeId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parts: string[] = []
  const seen = new Set<string>()
  let cursor = byId.get(nodeId)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    parts.unshift(cursor.title)
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
  }
  return parts
}

/**
 * 위·아래로 한 칸 옮길 때 **실제로 고쳐야 할 순서값**만 돌려준다.
 *
 * 형제 전체를 1..n으로 다시 번호 붙이고 달라진 줄만 고른다 — 원장에 같은 `sort_order`가
 * 여럿이어도(수동 입력·동시 저장의 잔재) 한 번의 이동이 실제로 자리를 바꾸도록 만든다.
 * 옮길 수 없는 자리(맨 위에서 위로)에서는 빈 배열이므로 화면은 버튼을 끈다.
 */
export function reorderSibling(
  nodes: readonly FileCollectionNodeDto[],
  nodeId: string,
  direction: 'up' | 'down',
): { id: string; sort_order: number }[] {
  const target = nodes.find((n) => n.id === nodeId)
  if (!target) return []
  const siblings = siblingsOf(nodes, target.parent_id ?? null)
  const index = siblings.findIndex((n) => n.id === nodeId)
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return []
  const ordered = [...siblings]
  const moved = ordered[swapWith]
  const self = ordered[index]
  if (!moved || !self) return []
  ordered[swapWith] = self
  ordered[index] = moved
  return ordered
    .map((n, i) => ({ id: n.id, sort_order: i + 1 }))
    .filter((next) => {
      const before = siblings.find((n) => n.id === next.id)
      return before?.sort_order !== next.sort_order
    })
}

// ---------------------------------------------------------------------------
// 진행률 — 관제 화면(WORKS)과 제출 화면(GUEST)이 같은 셈을 쓴다
// ---------------------------------------------------------------------------

export interface FileCollectionProgress {
  /** 문항 수(응답 칸이 아직 서지 않은 문항까지 센다). */
  total: number
  notSubmitted: number
  draft: number
  submitted: number
  rework: number
  approved: number
  /** 필수 문항 수와 그중 완료(APPROVED)된 수. */
  requiredTotal: number
  requiredApproved: number
}

const EMPTY_PROGRESS: FileCollectionProgress = {
  total: 0,
  notSubmitted: 0,
  draft: 0,
  submitted: 0,
  rework: 0,
  approved: 0,
  requiredTotal: 0,
  requiredApproved: 0,
}

/** 문항(QUESTION)만 남긴다 — 진행률의 분모는 폴더가 아니다. */
export function questionNodes(
  nodes: readonly FileCollectionNodeDto[],
): FileCollectionNodeDto[] {
  return nodes.filter((n) => n.node_type === 'QUESTION')
}

/**
 * 한 대상(배정)의 진행률.
 *
 * **응답 칸이 없는 문항을 빠뜨리지 않는다.** 공개 전이거나 배정이 공개 뒤에 붙은 직후에는
 * 응답 행이 아직 없는데, 있는 행만 세면 "0/0 완료"처럼 읽혀 낼 것이 없는 대상과 아직
 * 시작하지 않은 대상이 같은 모양이 된다. 분모는 언제나 문항 수다.
 */
export function assignmentProgress(
  questions: readonly FileCollectionNodeDto[],
  responses: readonly FileCollectionResponseDto[],
  assignmentId: string,
): FileCollectionProgress {
  if (questions.length === 0) return EMPTY_PROGRESS
  const byNode = new Map<string, FileCollectionResponseDto>()
  for (const r of responses) {
    if (r.assignment_id === assignmentId) byNode.set(r.node_id, r)
  }
  const out: FileCollectionProgress = { ...EMPTY_PROGRESS, total: questions.length }
  for (const q of questions) {
    const status = byNode.get(q.id)?.status ?? 'NOT_SUBMITTED'
    if (q.is_required) {
      out.requiredTotal += 1
      if (status === 'APPROVED') out.requiredApproved += 1
    }
    switch (status) {
      case 'DRAFT':
        out.draft += 1
        break
      case 'SUBMITTED':
        out.submitted += 1
        break
      case 'REWORK_REQUESTED':
        out.rework += 1
        break
      case 'APPROVED':
        out.approved += 1
        break
      default:
        out.notSubmitted += 1
    }
  }
  return out
}

/** 대상 한 줄(관제 표의 행). */
export interface AssignmentProgressRow {
  assignment: FileCollectionAssignmentDto
  progress: FileCollectionProgress
  /** 아직 아무 문항도 손대지 않은 대상 — 독촉 대상을 한눈에 가른다. */
  untouched: boolean
}

/**
 * 대상별 진행 현황. **회수된 배정도 목록에서 감추지 않는다** — 낸 자료는 남아 있고,
 * 감추면 이미 받은 제출물이 화면에서 사라진다. 회수 여부는 행이 스스로 말한다.
 */
export function assignmentProgressRows(
  nodes: readonly FileCollectionNodeDto[],
  assignments: readonly FileCollectionAssignmentDto[],
  responses: readonly FileCollectionResponseDto[],
): AssignmentProgressRow[] {
  const questions = questionNodes(nodes)
  return assignments.map((assignment) => {
    const progress = assignmentProgress(questions, responses, assignment.id)
    return {
      assignment,
      progress,
      untouched:
        progress.draft === 0 &&
        progress.submitted === 0 &&
        progress.rework === 0 &&
        progress.approved === 0,
    }
  })
}

/** 문항 한 줄(문항별 제출 현황). */
export interface QuestionProgressRow {
  node: FileCollectionNodeDto
  progress: FileCollectionProgress
}

/**
 * 문항별 제출 현황. 분모는 **살아 있는 배정 수**다(회수된 배정은 더 낼 수 없으므로 셈에서 뺀다) —
 * 회수한 대상이 계속 미제출로 남으면 관제의 남은 일 수가 영원히 줄지 않는다.
 */
export function questionProgressRows(
  nodes: readonly FileCollectionNodeDto[],
  assignments: readonly FileCollectionAssignmentDto[],
  responses: readonly FileCollectionResponseDto[],
): QuestionProgressRow[] {
  const live = assignments.filter((a) => !a.revoked_at)
  const liveIds = new Set(live.map((a) => a.id))
  return questionNodes(nodes).map((node) => {
    const out: FileCollectionProgress = {
      ...EMPTY_PROGRESS,
      total: live.length,
      requiredTotal: node.is_required ? live.length : 0,
    }
    const byAssignment = new Map<string, FileCollectionStatus>()
    for (const r of responses) {
      if (r.node_id === node.id && liveIds.has(r.assignment_id)) {
        byAssignment.set(r.assignment_id, r.status)
      }
    }
    for (const a of live) {
      const status = byAssignment.get(a.id) ?? 'NOT_SUBMITTED'
      if (status === 'APPROVED') {
        out.approved += 1
        if (node.is_required) out.requiredApproved += 1
      } else if (status === 'SUBMITTED') out.submitted += 1
      else if (status === 'REWORK_REQUESTED') out.rework += 1
      else if (status === 'DRAFT') out.draft += 1
      else out.notSubmitted += 1
    }
    return { node, progress: out }
  })
}

/** 모듈 전체 요약(요약 카드). 대상 수는 살아 있는 배정만 센다. */
export interface CollectionSummary {
  questions: number
  requiredQuestions: number
  targets: number
  revokedTargets: number
  /** 검토 대기·보완 요청은 '남은 일'이라 따로 센다. */
  pendingReview: number
  rework: number
  approved: number
  /**
   * 아직 아무것도 손대지 않은 칸(`NOT_SUBMITTED`)의 수. **작성 중인 칸은 여기 들지 않는다** —
   * 두 상태를 한 숫자로 합치면 "손도 안 댄 대상"과 "쓰다 만 대상"이 같은 모양이 되어
   * 독촉 문구를 고를 수 없다.
   */
  notSubmitted: number
  /** 작성 중(`DRAFT`)인 칸의 수. 미제출과 더하면 아직 안 들어온 전부다. */
  draft: number
  /** 필수 문항을 전부 완료한 대상 수. 필수 문항이 없으면 0이다. */
  completedTargets: number
}

export function collectionSummary(
  nodes: readonly FileCollectionNodeDto[],
  assignments: readonly FileCollectionAssignmentDto[],
  responses: readonly FileCollectionResponseDto[],
): CollectionSummary {
  const questions = questionNodes(nodes)
  const live = assignments.filter((a) => !a.revoked_at)
  const rows = assignmentProgressRows(nodes, live, responses)
  const sum = (pick: (p: FileCollectionProgress) => number) =>
    rows.reduce((acc, row) => acc + pick(row.progress), 0)
  return {
    questions: questions.length,
    requiredQuestions: questions.filter((q) => q.is_required).length,
    targets: live.length,
    revokedTargets: assignments.length - live.length,
    pendingReview: sum((p) => p.submitted),
    rework: sum((p) => p.rework),
    approved: sum((p) => p.approved),
    notSubmitted: sum((p) => p.notSubmitted),
    draft: sum((p) => p.draft),
    completedTargets: rows.filter(
      (row) => row.progress.requiredTotal > 0 && row.progress.requiredApproved === row.progress.requiredTotal,
    ).length,
  }
}

/** `3/7` 같은 한 칸 표기. 분모가 0이면 `-`로 적는다(0/0은 다 했다는 뜻으로 읽힌다). */
export function fractionText(done: number, total: number): string {
  if (total <= 0) return '-'
  return `${done}/${total}`
}

/** 파일 크기 한 줄. 없으면 빈 문자열이며 화면이 `EmptyValue`로 받는다. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)}${units[unit]}`
}

/** 회차 표기. 1회차도 적는다 — 회차가 있다는 사실 자체가 이 기능의 골격이다. */
export function roundLabel(round: number): string {
  return `${round}회차`
}

/**
 * 회차별로 파일을 묶는다(현재 회차가 맨 앞). 지난 회차는 접힌 이력으로 세우며 지우지 않는다 —
 * 보완 요청 뒤에도 무엇을 처음 냈는지가 남아야 검토 근거가 성립한다.
 */
export function filesByRound(
  files: readonly FileCollectionFileDto[],
): { round: number; files: FileCollectionFileDto[] }[] {
  const byRound = new Map<number, FileCollectionFileDto[]>()
  for (const file of files) {
    const bucket = byRound.get(file.round)
    if (bucket) bucket.push(file)
    else byRound.set(file.round, [file])
  }
  return [...byRound.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([round, list]) => ({
      round,
      files: list.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
}
