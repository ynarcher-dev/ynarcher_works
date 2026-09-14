/**
 * NETWORKS 목록 조회의 **검증용 대역**.
 *
 * `LedgerCandidatePickerModal`이 이 파일에서 읽는 것은 `useNetworkListPage` 하나이며, 그
 * 창은 실물 `Tabs`·`ListToolbar`·`DataTable`을 그대로 쓴다. 그래서 대역은 줄만 만들고 표는
 * 손대지 않는다 — 이 창이 두 모달의 **자매 기준선**(같은 3xl 폭, 같은 조판)이라 화면 부품이
 * 실물이어야 비교가 성립한다.
 */
import { query } from '../scenario'

export type NetworkRow = Record<string, unknown> & {
  id: string
  name: string
}

const LONG_AFFILIATION =
  '주식회사 와이앤아처파트너스 글로벌사업본부 해외투자전략실 동남아시아지역담당팀'

const CATEGORIES: { code: string; label: string }[] = [
  { code: 'MENTOR', label: '멘토' },
  { code: 'INVESTOR', label: '투자자' },
  { code: 'ADVISOR', label: '자문' },
]

const ROWS: NetworkRow[] = Array.from({ length: 23 }, (_, i) => {
  const category = CATEGORIES[i % CATEGORIES.length]!
  return {
    id: `nw-${i}`,
    name: i === 0 ? '김와이앤아처대표이사' : `전문가 ${i + 1}`,
    affiliation: i === 0 ? LONG_AFFILIATION : i % 3 === 2 ? null : `표본파트너스 ${i + 1}실`,
    email:
      i === 0
        ? 'very.long.mailbox.name.for.overflow.check@ynarcher-partners-company.co.kr'
        : `nw${i}@example.com`,
    phone: i % 4 === 3 ? null : `010-4${String(i).padStart(3, '0')}-0000`,
    category: category.code,
    category_label: category.label,
    profile: { position: i % 2 === 0 ? '대표이사' : '수석심사역' },
  }
})

const PAGE_SIZE_FALLBACK = 10

export function useNetworkListPage(
  _scope: string,
  keyword: string,
  page: number,
  pageSize: number = PAGE_SIZE_FALLBACK,
  filters?: { categories?: string[] },
) {
  const term = keyword.trim().toLowerCase()
  const wanted = filters?.categories ?? []
  const filtered = ROWS.filter(
    (row) =>
      (wanted.length === 0 || wanted.includes(String(row.category))) &&
      (term === '' ||
        [row.name, row.email, row.affiliation].some((v) =>
          String(v ?? '').toLowerCase().includes(term),
        )),
  )
  const start = page * pageSize
  return query({
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    totalAll: ROWS.length,
  })
}
