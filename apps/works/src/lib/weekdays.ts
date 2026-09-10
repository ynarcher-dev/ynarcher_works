/**
 * 요일 — 값·차례·표기의 단일 원천.
 *
 * 저장값은 `0=일 … 6=토`(Postgres `extract(dow)`와 `dayjs().day()`가 쓰는 값)이고 **보이는
 * 차례만** `WEEK_ORDER`가 정한다. 값과 차례를 함께 옮기면 이미 쌓인 행의 뜻이 바뀐다.
 *
 * 고르는 컨트롤(`components/WeekdayPicker`)이 아니라 여기가 소유하는 이유는 읽는 자리가
 * 컴포넌트 밖에 있기 때문이다 — 근무 요일을 월요일부터 골라 놓고 목록 요약이 '일·월·화…'로
 * 서면 방금 고른 것을 다시 읽지 못한다. 한쪽만 고쳐지는 날이 오지 않게 한 파일에 둔다.
 */

/** 요일 라벨(0=일 … 6=토). 인덱스가 곧 저장값이라 이 배열의 차례는 바꾸지 않는다. */
export const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 요일이 서는 차례 — 월요일이 앞이고 일요일이 끝이다. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/** 요일 배열을 화면 차례로 정렬한다(값은 그대로, 차례만). */
export function sortWeekdays(days: number[]): number[] {
  return [...days].sort(
    (a, b) => WEEK_ORDER.indexOf(a as never) - WEEK_ORDER.indexOf(b as never),
  )
}

/** 요일 배열 → '월·화·수·목·금'. 비어 있으면 '없음'. 고르는 자리와 같은 차례로 선다. */
export function weekdaysText(days: number[]): string {
  if (!days.length) return '없음'
  return sortWeekdays(days).map((d) => KO_WEEKDAYS[d] ?? '?').join('·')
}
