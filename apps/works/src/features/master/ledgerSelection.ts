/**
 * 생성자 전용 비활성화 원장(사업·딜·거래상대·펀드)의 목록 선택 규칙.
 *
 * 정본은 서버다 — `app.guard_workspace_creator_deactivation` 트리거가 활성→비활성 전이를
 * 생성자와 최고관리자에게 허용하므로(20260912170000), 행 판정은 그 조건을 화면으로 옮긴 것이다.
 * 화면에서 가리는 것은 인가가 아니므로 이 규칙을 넓혀도 서버는 여전히 거절한다.
 *
 * 열을 세우는 조건은 행 판정과 별개로 **쓰기 권한 하나**다. 현재 페이지에 내가 만든 행이
 * 있는지로 열을 껐다 켜면, 페이지를 넘길 때마다 선택 열이 사라졌다 나타나 표의 폭이 흔들리고
 * 무엇보다 "이 목록에는 일괄 처리가 없다"로 읽힌다 — 실제로는 다음 페이지에 내 행이 있다.
 * STARTUP(StartupPoolTab)·NETWORKS(NetworkListTab) 목록이 이미 쓰는 판정과 같다.
 */

/** 선택 판정에 필요한 최소 형태. 원장마다 행 타입은 다르지만 판정이 읽는 칸은 하나다. */
export interface CreatorOwnedRow {
  created_by: string | null
}

export interface LedgerSelectionRule<T> {
  /** 선택(체크박스) 열을 세울지. */
  selectable: boolean
  /** 그 열에서 실제로 고를 수 있는 행인지. */
  selectableRow: (row: T) => boolean
}

/**
 * 쓰기 권한이 있으면 선택 열을 세운다. 일반 사용자는 자신이 만든 행만, 최고관리자는 모든 행을
 * 고를 수 있게 한다.
 * `userId`가 없으면(미로그인·로딩 중) 어떤 행도 고를 수 없다 — `created_by`가 null인 행이
 * 비어 있는 사용자와 같다고 판정되지 않게 한다.
 */
export function creatorDeactivateSelection<T extends CreatorOwnedRow>(
  canWrite: boolean,
  userId: string | null | undefined,
  isAdmin = false,
): LedgerSelectionRule<T> {
  return {
    selectable: canWrite,
    selectableRow: (row) => canWrite && (isAdmin || (!!userId && row.created_by === userId)),
  }
}
