/**
 * 파일받기 — GUEST 화면이 무엇을 켜고 끌지 정하는 **순수 판정**.
 *
 * 진행률과 상태말은 `@ynarcher/master-data`가 소유하므로 여기서 다시 세지 않는다. 여기 있는
 * 것은 "지금 이 문항에서 무엇을 할 수 있는가"와 "못 한다면 이유가 무엇인가"뿐이다 —
 * 화면이 버튼을 감추는 것은 안내이고, 실제로 막는 것은 언제나 서버(RLS·RPC)다.
 */

import {
  assignmentProgress,
  fileCollectionStatusLabel,
  filesByRound,
  questionNodes,
  siblingsOf,
  type FileCollectionFileDto,
  type FileCollectionNodeDto,
  type FileCollectionResponseDto,
  type FileCollectionStatus,
} from '@ynarcher/master-data'

/** 아직 낼 수 있는 상태(서버 `file_collection_submit`이 받는 집합과 같다). */
const OPEN_STATUS: FileCollectionStatus[] = ['NOT_SUBMITTED', 'DRAFT', 'REWORK_REQUESTED']

/** 이 화면에서 쓰기가 가능한가 — 가능하지 않다면 그 이유가 곧 화면의 안내 문구다. */
export type WriteState =
  | { writable: true }
  | { writable: false; reason: string }

/**
 * 모듈 상태로 본 쓰기 가능 여부. 준비(DRAFT)·취소(CANCELLED)는 이 화면에 닿기 전에
 * 모듈 페이지가 막으므로(`isModuleLocked`) 여기서는 완료(CLOSED)만 갈린다.
 */
export function writeStateOfModule(moduleStatus: string | null | undefined): WriteState {
  if (moduleStatus === 'OPEN') return { writable: true }
  if (moduleStatus === 'CLOSED') {
    return { writable: false, reason: '마감된 요청입니다. 낸 자료와 피드백은 계속 볼 수 있습니다.' }
  }
  return { writable: false, reason: '아직 열리지 않은 요청입니다.' }
}

/**
 * 참여자에게 보이는 상태말 — **작성 중(`DRAFT`)은 미제출로 읽는다**(2026-09-14 사용자 지정).
 *
 * 파일을 올려 두기만 한 문항도 담당자에게 가지 않았으므로 참여자가 할 일은 미제출과 같다.
 * 진행 요약이 이미 둘을 한 칸에 세고 있어(`guestProgressSummary`), 표의 배지만 다른 말을 하면
 * 같은 화면이 같은 문항을 두 이름으로 부른다.
 *
 * WORKS 관제는 종전대로 다섯 상태를 가른다(`fileCollectionStatusLabel`) — 담당자에게는 '손도
 * 대지 않은 대상'과 '쓰다 만 대상'이 다른 독촉을 보낼 자리다. 그래서 원장의 상태말을 고치지
 * 않고 **이 화면에서만** 접는다.
 */
export function guestStatusLabel(status: string | null | undefined): string {
  if (status === 'DRAFT') return fileCollectionStatusLabel('NOT_SUBMITTED')
  return fileCollectionStatusLabel(status)
}

/** 문항별 응답 칸을 문항 id로 찾기 좋게 묶는다. */
export function responsesByNode(
  responses: readonly FileCollectionResponseDto[],
): Map<string, FileCollectionResponseDto> {
  const map = new Map<string, FileCollectionResponseDto>()
  for (const r of responses) map.set(r.node_id, r)
  return map
}

/** 문항의 현재 상태. 응답 칸이 아직 없으면 미제출이다(분모에서 빠지지 않는다). */
export function statusOfNode(
  byNode: Map<string, FileCollectionResponseDto>,
  nodeId: string,
): FileCollectionStatus {
  return byNode.get(nodeId)?.status ?? 'NOT_SUBMITTED'
}

/**
 * 지난 회차 한 묶음. 확인이 끝난 파일과 **끝나지 않은 파일을 섞지 않는다** — 올라가다 만
 * 줄은 실물이 없을 수 있어 내려받기를 걸면 언제나 실패하고, 그 회차에 낸 자료인 것처럼 나란히
 * 서면 무엇이 실제로 전달되었는지가 흐려진다.
 */
export interface RoundHistory {
  round: number
  /** 그 회차에 실제로 낸 자료(내려받을 수 있다). */
  files: FileCollectionFileDto[]
  /** 그 회차에서 확인되지 않은 채로 남은 줄(읽기만 되고 내려받지 못한다). */
  incomplete: FileCollectionFileDto[]
}

export interface QuestionControls {
  status: FileCollectionStatus
  round: number
  /** 이번 회차에 실제로 낸 것으로 세는 파일(실물 확인 완료). */
  currentFiles: FileCollectionFileDto[]
  /** 올라가다 만 파일 — 제출 계산에 들지 않는다. */
  pendingFiles: FileCollectionFileDto[]
  /** 지난 회차(읽기 전용, 최신 회차부터). */
  history: RoundHistory[]
  canUpload: boolean
  canSubmit: boolean
  canComment: boolean
  /** 제출만 막힌 이유(올릴 수는 있는데 아직 낼 것이 없는 경우). */
  submitHint: string | null
}

/**
 * 지난 회차를 확인 여부로 갈라 묶는다(회차 정렬은 `filesByRound`가 정한 대로 최신부터).
 *
 * 제출한 뒤에도 그 회차의 `PENDING` 줄은 남을 수 있다 — 올리다 끊긴 파일을 지우지 않고 다른
 * 파일로 제출하면 그대로 다음 회차로 넘어간다. 그 줄을 낸 자료 취급하면 참여자는 전달되지
 * 않은 파일을 전달된 것으로 읽는다.
 */
function pastRounds(past: readonly FileCollectionFileDto[]): RoundHistory[] {
  const ready = new Map(filesByRound(past.filter((f) => f.status === 'READY')).map((g) => [g.round, g.files]))
  const other = new Map(filesByRound(past.filter((f) => f.status !== 'READY')).map((g) => [g.round, g.files]))
  const rounds = [...new Set([...ready.keys(), ...other.keys()])].sort((a, b) => b - a)
  return rounds.map((round) => ({
    round,
    files: ready.get(round) ?? [],
    incomplete: other.get(round) ?? [],
  }))
}

/**
 * 문항 한 개에서 무엇을 할 수 있는가.
 *
 * 제출과 업로드는 **다른 일**이다 — 파일을 올린 것만으로는 **제출 처리되지 않으며**, 이
 * 구분이 흐려지면 올려 두고 낸 줄 아는 일이 생긴다. 그래서 `canUpload`와 `canSubmit`을
 * 따로 답하고, 낼 것이 없을 때의 이유(`submitHint`)도 따로 적는다.
 */
export function questionControls(input: {
  response: FileCollectionResponseDto | null | undefined
  files: readonly FileCollectionFileDto[]
  write: WriteState
}): QuestionControls {
  const { response, files, write } = input
  const status = response?.status ?? 'NOT_SUBMITTED'
  const round = response?.round ?? 1
  // 응답 칸이 없으면 그 문항에 붙은 파일도 없다(조회 자체가 응답 id로 나간다).
  const live = response ? files.filter((f) => f.response_id === response.id) : []
  const currentFiles = live.filter((f) => f.round === round && f.status === 'READY')
  const pendingFiles = live.filter((f) => f.round === round && f.status === 'PENDING')
  const history = pastRounds(live.filter((f) => f.round !== round))

  const openStatus = OPEN_STATUS.includes(status)
  const hasResponse = Boolean(response)

  // 상태를 문장으로 다시 적지 않는다(2026-09-14 사용자 지정) — 문항이 어디에 있는지는 상태
  // 배지가, 마감된 요청이라는 사실은 모듈 화면이 각각 한 번씩 말한다. 여기서 한 줄 더 만들면
  // 같은 사실이 세 자리에 살고, 그중 하나만 고쳐지는 날이 온다.

  const canUpload = write.writable && hasResponse && openStatus
  const canSubmit = canUpload && currentFiles.length > 0
  // 코멘트는 제출 뒤에도 남길 수 있다 — 검토 중에 설명을 덧붙이는 것이 이 칸의 쓸모다.
  const canComment = write.writable && hasResponse

  // 낼 것이 없다는 말은 적지 않는다(2026-09-14 사용자 지정) — 받는 상자가 바로 위에 서 있고
  // '제출 파일'이 비어 있다고 이미 말하므로, 한 줄 더 두면 같은 사실이 세 번 선다. 다만
  // **올리다 끊긴 파일**은 다르다: 올려 둔 것이 있는데 제출이 막히는 이유는 화면 어디에도 없다.
  let submitHint: string | null = null
  if (canUpload && currentFiles.length === 0 && pendingFiles.length > 0) {
    submitHint = '아직 확인되지 않은 파일이 있습니다. 확인이 끝난 파일이 하나도 없으면 제출할 수 없습니다.'
  }

  return {
    status,
    round,
    currentFiles,
    pendingFiles,
    history,
    canUpload,
    canSubmit,
    canComment,
    submitHint,
  }
}

/**
 * 이 파일을 내릴 수 있는가. 서버(`file_collection_remove_file`)와 같은 조건이다 —
 * 쓰기 가능 · **문항이 아직 이쪽 손에 있는 상태**(미제출·작성 중·보완 요청).
 *
 * 회차는 보지 않는다(2026-09-14 사용자 지정). 보완 요청은 회차를 올리므로, 회차로 가르면
 * 보완을 받은 사람이 **잘못 낸 자료를 스스로 치우지 못한다** — 화면에 남은 것은 내려받기뿐이고
 * 지울 길이 어디에도 없었다. 검토 중(SUBMITTED)·완료(APPROVED)에서 못 내리는 것은 그대로다.
 */
export function canRemoveFile(input: {
  file: Pick<FileCollectionFileDto, 'round'>
  response: FileCollectionResponseDto | null | undefined
  write: WriteState
}): boolean {
  const { response, write } = input
  if (!write.writable || !response) return false
  return OPEN_STATUS.includes(response.status)
}

export interface GuestProgressSummary {
  /** 문항 수 — 분모는 언제나 문항이며 폴더는 세지 않는다. */
  total: number
  /** 필수 문항 수. */
  requiredTotal: number
  /**
   * 아직 내지 않은 문항 — 손대지 않은 것과 파일만 올려 둔 것을 함께 센다.
   *
   * 둘을 가르지 않는 이유는 참여자가 할 일이 같기 때문이다(2026-09-14 사용자 지정). 올려 두기만
   * 한 문항도 담당자에게 가지 않았으므로 남은 일이며, 두 칸으로 갈라 놓으면 '무엇이 몇 개
   * 남았는가'를 두 수를 더해 읽어야 한다. 무엇이 올라가 있고 무엇이 비어 있는지는 문항 표의
   * 상태 배지가 문항마다 답한다.
   */
  notSubmitted: number
  /** 보완 요청을 받은 문항. */
  rework: number
  /** 내고 담당자의 검토를 기다리는 문항. */
  submitted: number
  /** 담당자의 확인이 끝난 문항. */
  approved: number
}

/**
 * 내 진행 상태 카드보드가 읽는 값. **내 것만** 센다 — 대상이 몇 명인지, 다른 사람이 어디까지
 * 냈는지는 이 화면이 답하지 않는다(조회 자체가 RLS에서 막힌다).
 *
 * 구성(총·필수)과 상태(미제출·검토 대기·보완·완료)를 갈라 내놓는다. 종전에는 `1/3`·`0/2` 같은
 * 분수만 서 있었는데 분모가 칸마다 달라(문항 수인지 필수 수인지) "무엇이 몇 개 남았는가"를
 * 읽으려면 눈으로 두 번 계산해야 했다.
 *
 * `SUBMITTED`는 완료에 흡수시키지 않고 제 칸(`검토 대기`)으로 선다 — 표의 배지가 '검토 대기'라고
 * 말하는 문항을 요약이 완료로 세면 두 자리가 같은 문항을 다르게 읽는다.
 */
export function guestProgressSummary(
  nodes: readonly FileCollectionNodeDto[],
  responses: readonly FileCollectionResponseDto[],
  assignmentId: string,
): GuestProgressSummary {
  const progress = assignmentProgress(questionNodes(nodes), responses, assignmentId)
  return {
    total: progress.total,
    requiredTotal: progress.requiredTotal,
    notSubmitted: progress.notSubmitted + progress.draft,
    rework: progress.rework,
    submitted: progress.submitted,
    approved: progress.approved,
  }
}

// ---------------------------------------------------------------------------
// 목록 다루기 — 검색과 쪽 나눔 (2026-09-14 사용자 지정)
// ---------------------------------------------------------------------------

/** 검색어 정규화 — 앞뒤 공백을 버리고 대소문자를 접는다. */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * 이름·안내 문구로 문항을 좁힌다.
 *
 * **걸린 줄의 조상을 함께 남긴다.** 트리에서 자식만 남기면 그 줄이 어느 묶음에 속했는지가
 * 사라지고, 화면 부품은 부모를 찾지 못한 줄을 '상위 항목 없음'으로 표시한다 — 검색했을 뿐인데
 * 원장이 망가진 것처럼 보인다. 반대로 **묶음이 걸리면 그 아래는 통째로 남긴다**: 폴더 이름으로
 * 찾는 사람은 그 안의 목록을 보려는 것이다.
 */
export function filterCollectionNodes(
  nodes: readonly FileCollectionNodeDto[],
  query: string,
): FileCollectionNodeDto[] {
  const needle = normalize(query)
  if (!needle) return [...nodes]

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const hit = (n: FileCollectionNodeDto) =>
    normalize(n.title).includes(needle) || normalize(n.guide ?? '').includes(needle)

  const keep = new Set<string>()
  const keepAncestors = (node: FileCollectionNodeDto) => {
    let parentId = node.parent_id
    // 순환 참조가 원장에 남아 있어도 멈춘다 — 본 적 있는 마디를 다시 만나면 그만둔다.
    const seen = new Set<string>([node.id])
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) break
      keep.add(parent.id)
      parentId = parent.parent_id
    }
  }

  const matchedFolders: string[] = []
  for (const node of nodes) {
    if (!hit(node)) continue
    keep.add(node.id)
    keepAncestors(node)
    if (node.node_type === 'FOLDER') matchedFolders.push(node.id)
  }

  // 걸린 묶음의 자손을 모두 끌어온다(깊이 제한 없이, 같은 줄을 두 번 밟지 않는다).
  const children = new Map<string, FileCollectionNodeDto[]>()
  for (const node of nodes) {
    const list = children.get(node.parent_id ?? '') ?? []
    list.push(node)
    children.set(node.parent_id ?? '', list)
  }
  const stack = [...matchedFolders]
  while (stack.length > 0) {
    const id = stack.pop()!
    for (const child of children.get(id) ?? []) {
      if (keep.has(child.id)) continue
      keep.add(child.id)
      stack.push(child.id)
    }
  }

  return nodes.filter((n) => keep.has(n.id))
}

/** 한 쪽에 담은 결과. */
export interface CollectionPage {
  nodes: FileCollectionNodeDto[]
  /** 전체 쪽 수(비어 있어도 1). */
  pageCount: number
  /** 실제로 보여 준 쪽(범위를 벗어난 요청은 마지막 쪽으로 당긴다). */
  page: number
}

/**
 * 최상위 묶음 단위로 쪽을 나눈다.
 *
 * **가지 중간을 자르지 않는다** — 줄 수로 자르면 자식만 다음 쪽으로 넘어가 부모 없는 줄이
 * 생기고, 한 묶음을 보려면 쪽을 넘겨 가며 이어 붙여야 한다. 그래서 자르는 단위는 줄이 아니라
 * 최상위 마디이며, 한 묶음은 언제나 한 쪽 안에 통째로 선다.
 */
export function pageCollectionNodes(
  nodes: readonly FileCollectionNodeDto[],
  page: number,
  size: number,
): CollectionPage {
  const roots = siblingsOf(nodes, null)
  const pageCount = Math.max(1, Math.ceil(roots.length / size))
  const safePage = Math.min(Math.max(page, 0), pageCount - 1)
  const visible = new Set(roots.slice(safePage * size, (safePage + 1) * size).map((n) => n.id))

  // 보이는 뿌리의 자손을 따라 내려가며 담는다.
  const children = new Map<string, FileCollectionNodeDto[]>()
  for (const node of nodes) {
    const list = children.get(node.parent_id ?? '') ?? []
    list.push(node)
    children.set(node.parent_id ?? '', list)
  }
  const stack = [...visible]
  while (stack.length > 0) {
    const id = stack.pop()!
    for (const child of children.get(id) ?? []) {
      if (visible.has(child.id)) continue
      visible.add(child.id)
      stack.push(child.id)
    }
  }

  return { nodes: nodes.filter((n) => visible.has(n.id)), pageCount, page: safePage }
}
