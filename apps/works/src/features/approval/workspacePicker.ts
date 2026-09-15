/**
 * 워크스페이스 한 곳을 고르는 창의 **판정** — 그리는 일은 `ApprovalWorkspaceField`가 한다.
 *
 * 근거 품의 창과 달리 후보를 서버에서 잘라 오지 않는다. 사업·M&A·조합 원장은 각각 수백 건이
 * 상한이고 이미 한 번에 읽어 두는 풀이라(`useMinuteLinkPool`), 검색어마다 서버를 다시 묻는 것은
 * 같은 답을 비싸게 사는 일이다. 대신 **좁히고 자르는 규칙을 여기 한 곳에** 두어, 창이 보는 것과
 * 페이저가 세는 것이 어긋나지 않게 한다 — 둘이 갈리면 "3페이지인데 결과는 12건"이 된다.
 *
 * 이 모듈은 순수 계층이다(React·DB 의존 없음).
 */
import type { ProgramLinkType } from '@/features/approval/programLinkApi'

/** '보기'에서 종류를 좁히지 않은 상태. */
export const WORKSPACE_PICK_ALL = '__all__'

/** 한 페이지에 세우는 줄 수. 근거 품의 창과 같은 값이라 두 창의 높이가 같다. */
export const WORKSPACE_PICK_PAGE_SIZE = 10

/** 고를 수 있는 워크스페이스 한 곳. */
export interface WorkspaceCandidate {
  targetType: ProgramLinkType
  targetId: string
  label: string
  code: string | null
}

/**
 * 검색어와 '보기'로 좁힌 후보.
 *
 * 이름과 코드를 함께 본다 — 담당자는 사업명을 외우기도 하고 코드를 받아 적어 오기도 한다.
 * 대소문자를 접는 이유는 코드가 영문 접두를 갖기 때문이고(`AC-2026-01`), 공백만 적은 검색어를
 * 좁힘으로 치지 않는 이유는 그 상태에서 '검색 결과 없음'이 뜨면 이유를 짐작할 수 없어서다.
 */
export function filterWorkspaceCandidates(
  rows: WorkspaceCandidate[],
  input: { keyword: string; kind: string },
): WorkspaceCandidate[] {
  const kw = input.keyword.trim().toLowerCase()
  return rows.filter((row) => {
    if (input.kind !== WORKSPACE_PICK_ALL && row.targetType !== input.kind) return false
    if (!kw) return true
    return `${row.label} ${row.code ?? ''}`.toLowerCase().includes(kw)
  })
}

/**
 * 그 페이지의 줄. 페이지가 범위를 벗어나면 **빈 배열**이 나온다 — 마지막 페이지에 선 채로
 * 검색어를 좁히면 생기는 상태이고, 창은 그것을 '검색 결과 없음'이 아니라 페이지를 되돌리는
 * 신호로 읽는다(호출부가 검색어가 바뀔 때 0페이지로 되돌린다).
 */
export function pageOfWorkspaceCandidates(
  rows: WorkspaceCandidate[],
  page: number,
  pageSize = WORKSPACE_PICK_PAGE_SIZE,
): WorkspaceCandidate[] {
  const from = page * pageSize
  return rows.slice(from, from + pageSize)
}
