/**
 * 사업 상세의 게시판형 목록(공지사항·QNA)이 공유하는 검색·페이징 규칙.
 *
 * 서버 검색이 아니라 **화면 안 걸러내기**다: 두 목록은 사업 하나에 매인 소량(조회 상한 200)
 * 이라 왕복을 늘리는 대신 받은 목록에서 거른다. 건수가 상한에 닿는 사업이 나오면 그때
 * 서버 검색으로 옮긴다 — 그 판단의 근거는 이 주석이 아니라 실제 데이터다.
 */

/** 한 쪽에 보일 건수. 카드 안 목록이라 미니 페이저와 함께 짧게 끊는다. */
export const LIST_PAGE_SIZE = 10

/** 검색어 정규화(공백 제거 + 소문자). 빈 문자열이면 거르지 않는다는 뜻이다. */
function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * 제목·본문에 검색어가 든 행만. 대소문자를 가리지 않는다.
 * `extra`는 화면이 함께 검색 대상으로 삼을 값(예: QNA의 답변 본문·질문자 이름)이다.
 */
export function matchesKeyword(
  keyword: string,
  row: { title: string; body?: string | null },
  extra?: string | null,
): boolean {
  const q = normalize(keyword)
  if (!q) return true
  return (
    normalize(row.title).includes(q) ||
    normalize(row.body).includes(q) ||
    normalize(extra).includes(q)
  )
}

/**
 * 현재 페이지의 행과 안전한 페이지 번호. 검색으로 목록이 줄어 현재 페이지가 범위를
 * 벗어나면 마지막 페이지로 접는다 — 걸러낸 뒤 빈 화면이 뜨는 것을 막는다(usePaged와 같은 처리).
 */
export function pageSlice<T>(
  rows: T[],
  page: number,
  size = LIST_PAGE_SIZE,
): { pageRows: T[]; safePage: number } {
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const safePage = Math.min(page, pageCount - 1)
  return { pageRows: rows.slice(safePage * size, (safePage + 1) * size), safePage }
}
