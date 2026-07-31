/**
 * 리스트뷰 인원 표기 규격 단일 원천 — **대표 1명 + "외 N"**.
 *
 * 목록의 셀 폭은 사람 수와 무관하게 일정해야 하므로, 몇 명을 접을지는 표마다 정하지 않는다.
 * 대표가 누구인지(투자기업=리드, 사업=PM, 펀드=대표펀드매니저)는 각 도메인이 정하고,
 * 이 함수는 이미 대표가 맨 앞에 온 목록을 받아 표기만 만든다.
 *
 * 전원 나열은 목록이 아니라 상세 화면의 몫이다(`joinNames`).
 */

/** 이름이 비어 있는 인원의 표기. 사람 수는 유지하고 이름만 대체한다. */
const UNKNOWN = '알 수 없음'

function normalize(names: readonly (string | null | undefined)[]): string[] {
  return names.map((n) => (n ?? '').trim() || UNKNOWN)
}

/**
 * 대표 1명 + "외 N" 요약. 인원이 없으면 null(호출부가 '미지정'·'공동관리' 등 맥락에 맞게 적는다).
 * 첫 원소를 대표로 본다 — 정렬은 호출부 책임이다.
 */
export function memberSummary(names: readonly (string | null | undefined)[]): string | null {
  const list = normalize(names)
  if (list.length === 0) return null
  const [first, ...rest] = list
  return rest.length > 0 ? `${first} 외 ${rest.length}` : first!
}

/** 전원 나열(상세 화면용). 인원이 없으면 null. */
export function joinNames(names: readonly (string | null | undefined)[]): string | null {
  const list = normalize(names)
  return list.length > 0 ? list.join(', ') : null
}
