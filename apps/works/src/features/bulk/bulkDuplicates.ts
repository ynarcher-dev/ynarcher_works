import { useQuery } from '@tanstack/react-query'
import { findLedgerMatches, probeOf } from '@/features/master/ledgerMatch'
import type { BulkImportSpec, BulkParseResult } from '@/features/bulk/bulkImport'

/**
 * 대용량 업로드의 원장 중복 대조(2026-09-09).
 *
 * 이 화면은 종전에 대조가 아예 없었다 — NETWORKS만 전용 대조 업로드를 가졌고 나머지는 파일에
 * 적힌 대로 그대로 들어갔다. **사람 손으로 한 건 넣을 때는 등록 폼이 막는데 파일로는 수백 건이
 * 그냥 들어오는 비대칭**이었고, 실제로 중복이 가장 많이 쌓일 수 있는 통로가 여기였다.
 *
 * 판정은 등록 폼·명단과 **같은 함수**를 쓴다(`findLedgerMatches`). 화면마다 규칙이 갈리면 같은
 * 회사를 어느 창에서 넣었느냐에 따라 중복이 되기도 안 되기도 한다.
 *
 * **명세가 원장을 준 화면에서만 돈다.** 사업·펀드처럼 사람·회사가 아닌 원장은 이름이 같아도
 * 다른 건일 수 있어(같은 이름의 2기·3기 사업) 여기서 막을 일이 아니다 — 막으면 정상 등록이
 * 이유 없이 거절된다.
 */

/**
 * 걸린 줄의 첨자 → 그 원장 행의 이름.
 *
 * 첨자는 `parsed.rows` 기준이다(파일 줄 번호가 아니다) — 형식 오류로 빠진 줄은 애초에 여기
 * 오지 않으므로 파일 줄과 첨자가 어긋나고, 그 되돌림은 `parsed.lines`가 답한다.
 */
export function useLedgerDuplicates(spec: BulkImportSpec, parsed: BulkParseResult | null) {
  const ledger = spec.matchLedger
  const rows = parsed?.rows ?? []

  const query = useQuery({
    // 파일이 같으면 같은 질문이다 — 대조에 쓰는 세 값만 키로 든다(페이로드 전체를 키로 쓰면
    // 태그 배열 같은 무관한 값이 바뀔 때마다 다시 묻는다).
    queryKey: [
      'bulk-duplicates',
      ledger?.table,
      ledger ? rows.map((r) => probeOf(r, ledger.matchColumns)) : null,
    ],
    enabled: Boolean(ledger && rows.length > 0),
    queryFn: async (): Promise<Map<number, string>> => {
      const found = await findLedgerMatches(
        ledger!,
        rows.map((r) => probeOf(r, ledger!.matchColumns)),
      )
      return new Map([...found].map(([i, m]) => [i, m.name]))
    },
  })

  return {
    // 조회 중에는 빈 지도다 — 업로드 버튼은 아래 `checking`으로 잠그므로, 이 사이에 파일이
    // '문제 없음'으로 보였다가 곧 오류가 붙는 일은 생기지 않는다.
    duplicates: query.data ?? new Map<number, string>(),
    checking: query.isFetching,
    /**
     * 대조에 실패했는가. **실패하면 업로드를 열지 않는다** — 확인하지 못한 것을 '중복 없음'으로
     * 읽으면 그 침묵이 그대로 수백 건의 중복 등록이 된다.
     */
    failed: query.isError,
  }
}
