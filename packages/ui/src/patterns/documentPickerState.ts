import type { ReactNode } from 'react'

/**
 * 문서 하나를 고르는 창의 **판정**만 모아 둔다 — 그리는 일은 `DocumentPickerModal`이 한다.
 *
 * 둘을 가르는 이유는 이 판정들이 화면을 보지 않고도 답을 낼 수 있는 것들이고, 그래야 검증이
 * 렌더러 없이 돌기 때문이다(이 저장소의 테스트 러너는 node 환경이다). 목록이 비었을 때 무엇을
 * 적을지, 고른 줄이 페이지 밖으로 나갔을 때 요약에 무엇을 남길지는 화면 조립과 무관한 규칙이다.
 */

/** 고르는 목록의 한 줄 — 문서 한 건. */
export interface DocumentPickerItem {
  id: string
  /** 문서 번호. 부여 전이거나 복원 문서면 없을 수 있다. */
  docNo: string | null
  title: string
  /** 기안자 표시값. 이름을 확정할 수 없으면 화면이 `EmptyValue`를 넘긴다(거짓 이름을 짓지 않는다). */
  drafter?: ReactNode
  /** 문서 종류(또는 구분). */
  kind?: ReactNode
}

/**
 * 표 자리에 무엇을 세울 것인가.
 *
 * 넷을 한 상태로 뭉치지 않는 이유는 **다음에 할 일이 저마다 다르기** 때문이다 — 조회 실패는
 * 다시 시도할 일이고, 검색 결과 없음은 검색어를 바꿀 일이고, 후보 없음은 이 창을 닫고 다른
 * 곳에서 먼저 해야 할 일이 있다는 뜻이다. 셋을 '없음' 하나로 적으면 권한 밖과 정말 없음이
 * 섞인다.
 */
export type DocumentPickerView = 'error' | 'loading' | 'empty-narrowed' | 'empty' | 'list'

export interface DocumentPickerViewInput {
  loading: boolean
  error: boolean
  /** 지금 페이지에 실제로 서 있는 줄 수. */
  itemCount: number
  /** 검색어나 '보기' 필터로 목록을 좁히고 있는가. '검색 결과 없음'과 '후보 없음'을 가른다. */
  narrowed: boolean
}

/**
 * 실패가 가장 앞선다 — 직전 페이지가 남아 있어도 그 값이 지금의 사실은 아니므로, 옛 목록을
 * 그대로 세워 두면 담당자는 실패했다는 것을 모른 채 낡은 후보를 고른다.
 *
 * 반대로 **조회 중에 이미 줄이 서 있으면 목록을 유지한다**. 페이지를 넘길 때마다 표가
 * 스피너로 바뀌면 한 번 넘길 때마다 화면이 통째로 깜빡이고, 그 사이 표의 높이가 접혔다
 * 펴지며 다음 페이지 버튼이 눌린 자리에서 사라진다.
 */
export function documentPickerView({
  loading,
  error,
  itemCount,
  narrowed,
}: DocumentPickerViewInput): DocumentPickerView {
  if (error) return 'error'
  if (itemCount > 0) return 'list'
  if (loading) return 'loading'
  return narrowed ? 'empty-narrowed' : 'empty'
}

/**
 * 지금 고른 줄의 표시 정보.
 *
 * 고른 뒤 검색어를 바꾸거나 페이지를 넘기면 그 줄은 이 페이지에 없다. 그때 요약이 함께
 * 사라지면 담당자는 자기가 무엇을 골라 두었는지 확인할 방법이 없고, 확인 버튼만 켜진 채
 * 남는다 — **고른 사실은 목록이 아니라 창이 들고 있어야 한다.** 그래서 목록에서 찾지 못하면
 * 마지막으로 본 값(고를 때 기억해 둔 줄, 또는 창을 열 때 받은 현재 값)으로 답한다.
 */
export function resolvePickedItem(
  pendingId: string | null,
  items: readonly DocumentPickerItem[],
  remembered: DocumentPickerItem | null,
): DocumentPickerItem | null {
  if (!pendingId) return null
  return (
    items.find((item) => item.id === pendingId) ??
    (remembered && remembered.id === pendingId ? remembered : null)
  )
}
