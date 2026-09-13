/**
 * 파일받기 — GUEST 화면이 무엇을 켜고 끌지 정하는 **순수 판정**.
 *
 * 진행률과 상태말은 `@ynarcher/master-data`가 소유하므로 여기서 다시 세지 않는다. 여기 있는
 * 것은 "지금 이 문항에서 무엇을 할 수 있는가"와 "못 한다면 이유가 무엇인가"뿐이다 —
 * 화면이 버튼을 감추는 것은 안내이고, 실제로 막는 것은 언제나 서버(RLS·RPC)다.
 */

import {
  assignmentProgress,
  descendantIdsOf,
  filesByRound,
  fractionText,
  questionNodes,
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
  /** 못 하는 이유 한 줄(할 수 있으면 `null`). 버튼 옆에 그대로 선다. */
  blockedReason: string | null
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

  let blockedReason: string | null = null
  if (!write.writable) blockedReason = write.reason
  else if (!hasResponse) blockedReason = '아직 이 문항의 제출 칸이 열리지 않았습니다.'
  else if (status === 'SUBMITTED') blockedReason = '제출한 문항입니다. 담당자의 검토를 기다리는 중입니다.'
  else if (status === 'APPROVED') blockedReason = '완료된 문항입니다.'

  const canUpload = write.writable && hasResponse && openStatus
  const canSubmit = canUpload && currentFiles.length > 0
  // 코멘트는 제출 뒤에도 남길 수 있다 — 검토 중에 설명을 덧붙이는 것이 이 칸의 쓸모다.
  const canComment = write.writable && hasResponse

  let submitHint: string | null = null
  if (canUpload && currentFiles.length === 0) {
    submitHint =
      pendingFiles.length > 0
        ? '아직 확인되지 않은 파일이 있습니다. 확인이 끝난 파일이 하나도 없으면 제출할 수 없습니다.'
        : '제출할 파일을 먼저 올려 주십시오.'
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
    blockedReason,
    submitHint,
  }
}

/**
 * 이 파일을 내릴 수 있는가. 서버(`file_collection_remove_file`)와 같은 조건이다 —
 * 쓰기 가능 · 미제출 상태 · **현재 회차**. 지난 회차의 제출물은 누구도 지우지 못한다.
 */
export function canRemoveFile(input: {
  file: Pick<FileCollectionFileDto, 'round'>
  response: FileCollectionResponseDto | null | undefined
  write: WriteState
}): boolean {
  const { file, response, write } = input
  if (!write.writable || !response) return false
  if (!OPEN_STATUS.includes(response.status)) return false
  return file.round === response.round
}

/** 폴더 줄에 서는 한 칸 — 그 아래 문항 중 이미 낸 것(검토 대기·완료)의 비율. */
export function folderProgressText(
  nodes: readonly FileCollectionNodeDto[],
  byNode: Map<string, FileCollectionResponseDto>,
  folderId: string,
): string {
  const ids = new Set(descendantIdsOf(nodes, folderId))
  const questions = questionNodes(nodes).filter((n) => ids.has(n.id))
  const done = questions.filter((n) => {
    const status = statusOfNode(byNode, n.id)
    return status === 'SUBMITTED' || status === 'APPROVED'
  }).length
  return fractionText(done, questions.length)
}

export interface GuestProgressSummary {
  /** 문항 수와 그중 이미 낸 것(검토 대기 + 완료). */
  submittedText: string
  /** 필수 문항 완료 비율. 필수가 없으면 `-`. */
  requiredText: string
  /** 보완 요청을 받은 문항 수. */
  rework: number
  /** 아직 손대지 않은 문항 수. */
  notSubmitted: number
  total: number
}

/**
 * 내 진행 상태 한 줄. **내 것만** 센다 — 대상이 몇 명인지, 다른 사람이 어디까지 냈는지는
 * 이 화면이 답하지 않는다(조회 자체가 RLS에서 막힌다).
 */
export function guestProgressSummary(
  nodes: readonly FileCollectionNodeDto[],
  responses: readonly FileCollectionResponseDto[],
  assignmentId: string,
): GuestProgressSummary {
  const progress = assignmentProgress(questionNodes(nodes), responses, assignmentId)
  return {
    submittedText: fractionText(progress.submitted + progress.approved, progress.total),
    requiredText: fractionText(progress.requiredApproved, progress.requiredTotal),
    rework: progress.rework,
    notSubmitted: progress.notSubmitted,
    total: progress.total,
  }
}
