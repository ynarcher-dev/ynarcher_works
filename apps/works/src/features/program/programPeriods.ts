/**
 * 프로그램 기간(제안 단계 / 운영 단계) 판정 유틸.
 * 제안 기간과 운영 기간은 겹칠 수 없고, 운영 모듈 기간은 둘 중 한 구간 안에서만 설정할 수 있다.
 * 날짜는 `YYYY-MM-DD` 문자열이라 사전식 비교가 시간순 비교와 일치한다.
 */
export interface DateRange {
  start: string | null
  end: string | null
}

/** 시작·종료가 모두 있는 완전 구간만 판정(포함·겹침)의 기준이 된다. */
export interface CompleteRange {
  start: string
  end: string
}

export function isCompleteRange(r: DateRange): r is CompleteRange {
  return Boolean(r.start && r.end)
}

/** 두 완전 구간이 하루라도 겹치는지. 경계가 비면 판정 불가로 겹치지 않음 처리. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  if (!isCompleteRange(a) || !isCompleteRange(b)) return false
  return a.start <= b.end && b.start <= a.end
}

/**
 * 모듈 기간(한쪽만 입력했으면 그 날짜로 양끝을 채운다)이 완전 구간 parent에 완전히 포함되는지.
 * 모듈에 날짜가 하나도 없으면(판정 대상 아님) 호출 전에 걸러야 한다.
 */
export function moduleWithin(parent: CompleteRange, start: string, end: string): boolean {
  const s = start || end
  const e = end || start
  return s >= parent.start && e <= parent.end
}
