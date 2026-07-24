import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 펀드 상태(fund_status enum) 한글 라벨. 저장값은 코드 그대로 두고 화면에서만 매핑한다
 * (startup의 managementStatusLabel과 동일 패턴). 근거: docs_planning/3_5_workspace_fund.md §1.1.1
 */
export const FUND_STATUS_LABEL: Record<string, string> = {
  RAISING: '결성 중',
  OPERATING: '운용 중',
  LIQUIDATING: '청산 중',
  CLOSED: '청산 완료',
}

/** 상태 배지 톤: 운용 중=활성(success), 결성·청산 중=경고(warning), 청산 완료=회색(neutral). */
export const FUND_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
  RAISING: 'warning',
  OPERATING: 'success',
  LIQUIDATING: 'warning',
  CLOSED: 'neutral',
}

export function fundStatusLabel(code: string | null | undefined): string {
  return (code ? FUND_STATUS_LABEL[code] : undefined) ?? code ?? '-'
}

/** 상태 필터 옵션(MultiSelectFilter용). enum 고정값이라 태그 원장이 아니라 정적 옵션이다. */
export const FUND_STATUS_OPTIONS = Object.entries(FUND_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}))

/**
 * 재원/성격/유형 구분 라벨. 해당 컬럼은 §2.1 미니 마이그레이션(후속) 예정이며,
 * 라벨 매핑은 미리 정의해 컬럼 도입 즉시 배지로 쓸 수 있게 둔다.
 */
export const FUND_SOURCE_LABEL: Record<string, string> = { MOTAE: '모태', NON_MOTAE: '비모태' }
export const FUND_CHARACTER_LABEL: Record<string, string> = {
  PERSONAL: '개인투자조합',
  VENTURE: '벤처투자조합',
}
export const FUND_STRATEGY_LABEL: Record<string, string> = {
  AC: 'AC',
  VC: 'VC',
  PE: 'PE',
  PROJECT: '프로젝트',
  BLIND: '블라인드',
  ETC: '기타',
}
export const FUND_SUBSCRIPTION_LABEL: Record<string, string> = {
  LUMP_SUM: '일시납',
  INSTALLMENT: '분할납',
  ON_DEMAND: '수시납',
}

const toOptions = (m: Record<string, string>) =>
  Object.entries(m).map(([value, label]) => ({ value, label }))
export const FUND_SOURCE_OPTIONS = toOptions(FUND_SOURCE_LABEL)
export const FUND_CHARACTER_OPTIONS = toOptions(FUND_CHARACTER_LABEL)
export const FUND_STRATEGY_OPTIONS = toOptions(FUND_STRATEGY_LABEL)
export const FUND_SUBSCRIPTION_OPTIONS = toOptions(FUND_SUBSCRIPTION_LABEL)

/** 원(₩) 정수 → "n억" 표기. 기존 FundPage 표기 규칙과 동일. */
export function formatEok(won: number): string {
  return `${(won / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}억`
}

/** ISO 날짜 → YYYY-MM-DD 절삭. */
export function fundDate(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null
}

/** 존속기간 "YYYY-MM-DD ~ YYYY-MM-DD". 둘 다 없으면 null. */
export function fundPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  return `${fundDate(start) ?? '?'} ~ ${fundDate(end) ?? '?'}`
}

/**
 * 운용인력 표시명: 참여 운용인력(role=OPERATION, 대표 제외)을 "이름 외 N"으로 요약.
 * 대표펀드매니저(is_lead)는 별도 컬럼(manager)에서 노출하므로 여기선 제외한다.
 */
export function fundOperatorLabel(operators: FundListRow['operators']): string | null {
  const ops = operators.filter((o) => o.role === 'OPERATION' && !o.is_lead)
  if (ops.length === 0) return null
  const first = ops[0]?.user?.name ?? '-'
  return ops.length > 1 ? `${first} 외 ${ops.length - 1}` : first
}

/** 펀드 리스트 행. `funds` 표시 컬럼 + 대표펀드매니저·담당자(등록자) 임베드. */
export interface FundListRow {
  id: string
  name: string
  vintage_year: number | null
  total_commitment: number
  drawn_amount: number
  status: string
  created_by: string | null
  manager_id: string | null
  updated_at: string | null
  /** 대표펀드매니저(manager_id → users). */
  manager: { id: string; name: string | null } | null
  /** 담당자 컬럼의 원천 = 등록자(created_by → users). 라벨만 '담당자'로 표기(작성자≠담당자 인지). */
  creator: { id: string; name: string | null } | null
  /** 재원/성격/유형 구분(20260724100000 마이그레이션). */
  source_type: string | null
  character_type: string | null
  strategy_type: string | null
  /** 결성일·존속기간·실출자금액(20260724110000 마이그레이션). */
  formed_on: string | null
  term_start: string | null
  term_end: string | null
  paid_in_amount: number | null
  /** 운용/관리 인력(fund_managers). 운용인력 컬럼의 원천. */
  operators: {
    user_id: string
    role: string
    is_lead: boolean
    user: { id: string; name: string | null } | null
  }[]
}

/** 상태·재원·성격 다중선택 필터. 유형(전략)은 탭이 프리필터로 담당한다. */
export interface FundListFilterState {
  statuses: string[]
  sources: string[]
  characters: string[]
}

export const EMPTY_FUND_FILTERS: FundListFilterState = { statuses: [], sources: [], characters: [] }

/**
 * 펀드 목록 조회. 펀드는 건수가 적어 서버 페이지네이션 없이 단건 조회하고,
 * 검색·필터·유형(탭)·내 펀드 스코프는 컨테이너(FundListTab)에서 클라이언트 측으로 적용한다.
 * 건수가 커지면 startupPoolHooks의 서버 페이지네이션 패턴으로 교체한다.
 */
export function useFundList() {
  return useQuery({
    queryKey: ['fund', 'list', 'v2'],
    queryFn: async (): Promise<FundListRow[]> => {
      const { data, error } = await supabase
        .from('funds')
        .select(
          'id, name, vintage_year, total_commitment, drawn_amount, status, source_type, character_type, strategy_type, formed_on, term_start, term_end, paid_in_amount, created_by, manager_id, updated_at, manager:users!manager_id(id, name), creator:users!created_by(id, name), operators:fund_managers(user_id, role, is_lead, user:users!user_id(id, name))',
        )
        .is('deleted_at', null)
        .order('vintage_year', { ascending: false, nullsFirst: false })
      if (error) throw error
      return ((data ?? []) as unknown[]).map((r) => {
        const row = r as Record<string, unknown>
        return {
          id: row.id as string,
          name: row.name as string,
          vintage_year: (row.vintage_year as number) ?? null,
          total_commitment: Number(row.total_commitment),
          drawn_amount: Number(row.drawn_amount),
          status: row.status as string,
          source_type: (row.source_type as string) ?? null,
          character_type: (row.character_type as string) ?? null,
          strategy_type: (row.strategy_type as string) ?? null,
          formed_on: (row.formed_on as string) ?? null,
          term_start: (row.term_start as string) ?? null,
          term_end: (row.term_end as string) ?? null,
          paid_in_amount: row.paid_in_amount == null ? null : Number(row.paid_in_amount),
          created_by: (row.created_by as string) ?? null,
          manager_id: (row.manager_id as string) ?? null,
          updated_at: (row.updated_at as string) ?? null,
          manager: (row.manager as FundListRow['manager']) ?? null,
          creator: (row.creator as FundListRow['creator']) ?? null,
          operators: (row.operators as FundListRow['operators']) ?? [],
        }
      })
    },
  })
}
