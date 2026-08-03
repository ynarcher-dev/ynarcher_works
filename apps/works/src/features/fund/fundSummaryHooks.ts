import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { sanitizeOrValue } from '@/features/master/ledgerPage'
import type { FundListFilterState } from '@/features/fund/fundListHooks'
import { supabase } from '@/lib/supabase'

/** 목록 요약 카드가 읽는 값 한 벌. 금액은 전부 원(₩) 정수. */
export interface FundListTotals {
  /** 집계에 든 펀드 수. 목록 건수와 같아야 한다(조건 드리프트 감지). */
  fundCount: number
  totalCommitment: number
  /** 실출자금액 합계. 값을 적은 펀드가 하나도 없으면 null — 0원과 구분해야 한다. */
  paidIn: number | null
  drawn: number
  balance: number
}

/** 빈 배열은 '미적용'이라 null로 되돌려 보낸다(RPC도 같은 규약이지만 뜻을 넘기는 쪽에서 정한다). */
function arrayArg(values: string[]): string[] | null {
  return values.length ? values : null
}

/** 백만원 단위 입력 → 원(₩). 숫자가 아니면 미적용(null). 목록 필터와 같은 환산이다. */
function millionArg(input: string): number | null {
  if (input.trim() === '') return null
  const n = Number(input)
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : null
}

/**
 * 펀드 목록 요약 집계. 모수는 아래 목록과 같다(스코프 + 검색어 + 필터 전부) —
 * 필터를 걸었는데 위 카드만 안 따라오면 그 카드는 곧 안 보게 된다.
 *
 * 합계를 화면에서 내지 못하는 이유는 목록이 서버 페이지네이션이기 때문이다(보이는 한 페이지의
 * 합은 답이 아니다). 건수와 달리 합계는 PostgREST로 셀 수 없고(이 프로젝트는 집계 함수 비활성)
 * 그래서 집계 전용 RPC를 경유한다. 근거·보안 게이트: 20260803180000_fund_list_totals_amounts_only.sql
 *
 * 사업 진행 현황 카드는 상태 분포를 답하느라 상태 필터만 집계에서 뺐지만, 이 카드는 금액을
 * 답하므로 자기 조건을 자기 집계에 도로 거는 문제가 없다 — 상태 필터도 그대로 건다.
 */
export function useFundListTotals(
  keyword: string,
  filters: FundListFilterState,
  strategy?: 'AC' | 'VC' | 'PE' | null,
  mineUserId?: string | null,
) {
  return useQuery({
    queryKey: ['fund', 'list', 'totals', keyword, filters, strategy ?? null, mineUserId ?? null],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FundListTotals> => {
      // 검색어는 목록과 같은 값으로 좁혀야 한다 — 한쪽만 제어문자를 털면 결과가 갈린다.
      const kw = sanitizeOrValue(keyword)
      const { data, error } = await supabase
        .rpc('fund_list_totals', {
          p_keyword: kw || null,
          p_statuses: arrayArg(filters.statuses),
          p_sources: arrayArg(filters.sources),
          p_characters: arrayArg(filters.characters),
          // 탭이 이미 같은 축을 스코프로 걸었으면 필터는 무시한다(목록과 같은 판단).
          p_strategies: strategy ? null : arrayArg(filters.strategies),
          p_fund_types: arrayArg(filters.fundTypes),
          p_term_from: filters.termFrom || null,
          p_term_to: filters.termTo || null,
          p_balance_min: millionArg(filters.balanceMinMillion),
          p_balance_max: millionArg(filters.balanceMaxMillion),
          p_strategy: strategy ?? null,
          p_mine_user_id: mineUserId ?? null,
        })
        .single()
      if (error) throw error

      // numeric은 PostgREST가 문자열로 실어 보낸다(정밀도 유실 방지). 숫자로 되돌린다.
      const row = (data ?? {}) as Record<string, string | number | null | undefined>
      const num = (v: string | number | null | undefined) => Number(v ?? 0)
      return {
        fundCount: num(row.fund_count),
        totalCommitment: num(row.total_commitment),
        paidIn: row.paid_in_amount == null ? null : Number(row.paid_in_amount),
        drawn: num(row.drawn_amount),
        balance: num(row.balance),
      }
    },
  })
}
