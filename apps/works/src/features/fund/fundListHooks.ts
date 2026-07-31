import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchLedgerPage,
  managedRecordIds,
  sanitizeOrValue,
  userIdsByName,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
import { joinNames, memberSummary } from '@/lib/memberLabel'

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
/** 구분(strategy_type): 투자 전략 축 — 사이드바 탭. */
export const FUND_STRATEGY_LABEL: Record<string, string> = { AC: 'AC', VC: 'VC', PE: 'PE', ETC: '기타' }
/** 펀드유형(fund_type): 조합 구조 축 — 구분과 별개(컬럼·필터). */
export const FUND_TYPE_LABEL: Record<string, string> = { PROJECT: '프로젝트', BLIND: '블라인드' }
export const FUND_SUBSCRIPTION_LABEL: Record<string, string> = {
  LUMP_SUM: '일시납',
  INSTALLMENT: '분할납',
  ON_DEMAND: '수시납',
}

/** 목적 구분(fund_purposes.kind): 의무투자(MANDATORY)/주목적(MAIN)/특수목적(SPECIAL). 근거: 3_5_workspace_fund.md §2.3 */
export const FUND_PURPOSE_KIND_LABEL: Record<string, string> = {
  MANDATORY: '의무투자',
  MAIN: '주목적',
  SPECIAL: '특수목적',
}

/** 조합원유형(fund_lp_type enum) 한글 라벨. 근거: 3_5_workspace_fund.md §2.2 */
export const FUND_LP_TYPE_LABEL: Record<string, string> = {
  GP: '업무집행(GP)',
  LIMITED: '유한책임(LP)',
  SPECIAL: '특별',
}

/** GP는 운용사 자기 출자분이라 눈에 걸리게 두고, 나머지는 배경으로 물러난다. */
export const FUND_LP_TYPE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
  GP: 'info',
  LIMITED: 'neutral',
  SPECIAL: 'warning',
}

/**
 * 캐피탈 콜 상태(capital_call_status enum) 한글 라벨. 근거: 3_5_workspace_fund.md §1.3
 * 상태의 소유자는 LP 행(capital_call_payments.status)이고, 차수 상태는 그 분포에서 파생된다.
 */
export const CAPITAL_CALL_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: '예정',
  NOTIFIED: '통지',
  PARTIALLY_PAID: '일부납입',
  PAID: '납입완료',
  OVERDUE: '연체',
}

/** 차수 상태 배지 톤: 납입완료=활성, 연체=위험, 통지·일부납입=경고, 예정=회색. */
export const CAPITAL_CALL_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
  SCHEDULED: 'neutral',
  NOTIFIED: 'warning',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
}

const toOptions = (m: Record<string, string>) =>
  Object.entries(m).map(([value, label]) => ({ value, label }))
export const CAPITAL_CALL_STATUS_OPTIONS = toOptions(CAPITAL_CALL_STATUS_LABEL)
export const FUND_LP_TYPE_OPTIONS = toOptions(FUND_LP_TYPE_LABEL)

/**
 * LP 한 명에게 붙일 수 있는 상태. 일부납입(PARTIALLY_PAID)은 "여럿 중 일부만 냈다"는 차수 롤업
 * 개념이라 한 사람 행에는 성립하지 않으므로 제외한다(DB BEFORE 트리거도 같은 값을 되돌린다).
 */
export const CAPITAL_CALL_LP_STATUSES = ['SCHEDULED', 'NOTIFIED', 'PAID', 'OVERDUE'] as const
export const CAPITAL_CALL_LP_STATUS_OPTIONS = CAPITAL_CALL_LP_STATUSES.map((value) => ({
  value,
  label: CAPITAL_CALL_STATUS_LABEL[value],
}))
export const FUND_SOURCE_OPTIONS = toOptions(FUND_SOURCE_LABEL)
export const FUND_CHARACTER_OPTIONS = toOptions(FUND_CHARACTER_LABEL)
export const FUND_STRATEGY_OPTIONS = toOptions(FUND_STRATEGY_LABEL)
export const FUND_TYPE_OPTIONS = toOptions(FUND_TYPE_LABEL)
export const FUND_SUBSCRIPTION_OPTIONS = toOptions(FUND_SUBSCRIPTION_LABEL)

/** 원(₩) 정수 → "n억" 표기. 규약 목적 달성률 등 어림 규모를 적는 자리에서 쓴다. */
export function formatEok(won: number): string {
  return `${(won / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}억`
}

/**
 * 원(₩) 정수 → "n백만원" 표기(소수점 없음, 반올림).
 * 펀드 금액 4종(약정총액·실출자금액·집행액·잔액)의 목록 표기 단위다 — 억 단위로는
 * 소액 집행이 `0.01억`처럼 뭉개져 자릿수를 비교할 수 없다.
 */
export function formatMillion(won: number): string {
  return `${Math.round(won / 1_000_000).toLocaleString()}백만원`
}

/** 원(₩) 정수 → 천단위 콤마 + "원" 표기(전액 표기). */
export function formatWon(won: number): string {
  return `${won.toLocaleString()}원`
}

/** ISO 날짜 → YYYY-MM-DD 절삭. */
export function fundDate(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null
}

/** 존속기간 "YYYY-MM-DD ~ YYYY-MM-DD"(한 줄, 상세용). 둘 다 없으면 null. */
export function fundPeriod(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  return `${fundDate(start) ?? '?'} ~ ${fundDate(end) ?? '?'}`
}

/**
 * 존속기간을 시작·종료 두 줄로(목록용). 둘 다 없으면 null.
 * 목록의 열 폭에서는 한 줄 표기가 임의의 지점에서 접혀 날짜가 반토막 나므로,
 * 접히는 자리를 표기 쪽에서 시작/종료 경계로 못박는다.
 */
export function fundPeriodLines(start: string | null, end: string | null): [string, string] | null {
  if (!start && !end) return null
  return [fundDate(start) ?? '?', fundDate(end) ?? '?']
}

/**
 * 인력 목록을 표시명으로. full=true(상세)면 전원 나열, 아니면 목록 공용 규격("대표 1명 외 N").
 * 표기 규칙 자체는 lib/memberLabel이 소유한다 — 표마다 접는 인원 수가 달라지지 않게 한다.
 */
function memberLabel(members: FundListRow['operators'], full: boolean): string | null {
  const names = members.map((m) => m.user?.name)
  return full ? joinNames(names) : memberSummary(names)
}

/**
 * 운용인력 표시명: 참여 운용인력(role=OPERATION, 대표 제외).
 * 대표펀드매니저(is_lead)는 별도(manager)에서 노출하므로 여기선 제외한다.
 * full=true(상세 개요)는 전원 나열, 기본(리스트 컬럼)은 "외 N" 축약.
 */
export function fundOperatorLabel(operators: FundListRow['operators'], full = false): string | null {
  return memberLabel(operators.filter((o) => o.role === 'OPERATION' && !o.is_lead), full)
}

/** 관리인력 표시명: 조합 행정·보고·사후관리 담당(role=ADMIN). 운용인력과 별개 축. full=true면 전원 나열. */
export function fundManagerLabel(operators: FundListRow['operators'], full = false): string | null {
  return memberLabel(operators.filter((o) => o.role === 'ADMIN'), full)
}

/** 펀드 리스트 행. `funds` 표시 컬럼 + 대표펀드매니저·관리자(생성자) 임베드. */
export interface FundListRow {
  id: string
  /** 펀드코드(6자리 영숫자 난수, 워크스페이스 전역 유니크). DB 트리거가 등록 시 부여한다. */
  code: string | null
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
  /** 관리자 컬럼의 원천 = 생성자(created_by → users). 라벨만 '관리자'로 표기(생성자≠담당자 인지). 관리인력과 별개. */
  creator: { id: string; name: string | null } | null
  /** 재원/성격/구분(20260724100000) + 펀드유형(20260724140000). */
  source_type: string | null
  character_type: string | null
  strategy_type: string | null
  fund_type: string | null
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

/** 상태·재원·성격·펀드유형 다중선택 필터. 구분(전략)은 탭이 프리필터로 담당한다. */
export interface FundListFilterState {
  statuses: string[]
  sources: string[]
  characters: string[]
  fundTypes: string[]
}

export const EMPTY_FUND_FILTERS: FundListFilterState = {
  statuses: [],
  sources: [],
  characters: [],
  fundTypes: [],
}

/** 하나라도 활성 필터가 있는지. */
export function hasActiveFundFilters(f: FundListFilterState): boolean {
  return (
    f.statuses.length > 0 ||
    f.sources.length > 0 ||
    f.characters.length > 0 ||
    f.fundTypes.length > 0
  )
}

/** 목록 표시 컬럼 + 담당자·생성자 임베드. */
const FUND_LIST_SELECT =
  'id, code, name, vintage_year, total_commitment, drawn_amount, status, source_type, character_type, strategy_type, fund_type, formed_on, term_start, term_end, paid_in_amount, created_by, manager_id, updated_at, manager:users!manager_id(id, name), creator:users!created_by(id, name), operators:fund_managers(user_id, role, is_lead, user:users!user_id(id, name))'

/** 펀드 목록 페이지. 다른 원장 목록과 동일 규약(rows + 건수 둘). */
export type FundListPage = LedgerPage<FundListRow>

/**
 * '내 펀드' 스코프 조건. FUND의 담당자 축은 대표펀드매니저(funds.manager_id)와
 * 운용·관리 인력(fund_managers) 둘이라 양쪽을 봐야 한다 — 대표만 보면 인력으로 배정된
 * 사람의 목록에 그 펀드가 잡히지 않는다. 생성자(created_by)는 권한 축은 아니지만
 * '내가 만든 것'을 찾는 자리라 다른 원장과 같이 함께 건다.
 */
async function mineScope(userId: string): Promise<LedgerCondition> {
  const ids = await managedRecordIds('fund_managers', 'fund_id', userId)
  const parts = [`created_by.eq.${userId}`, `manager_id.eq.${userId}`]
  if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
  return { kind: 'or', expr: parts.join(',') }
}

/** 검색어 조건: 펀드명·펀드코드·대표펀드매니저 이름. 이름은 users 역조회를 거친다. */
async function searchCondition(keyword: string): Promise<LedgerCondition> {
  const parts = [`name.ilike.%${keyword}%`, `code.ilike.%${keyword}%`]
  const userIds = await userIdsByName(keyword)
  if (userIds.length) parts.push(`manager_id.in.(${userIds.join(',')})`)
  return { kind: 'or', expr: parts.join(',') }
}

/**
 * 펀드 목록(서버 사이드 페이지네이션). 종전에는 funds 전량을 임베드까지 붙여 내려받고
 * 검색·필터·스코프를 브라우저 메모리에서 걸었다 — '전체 펀드'가 열리면서 그 전량 로드가
 * 기본 화면 중 하나가 되어 더는 둘 수 없었다. 조건을 전부 서버로 내려 다른 원장 목록과
 * 같은 절차(fetchLedgerPage)를 쓴다.
 */
export function useFundListPage(
  keyword: string,
  filters: FundListFilterState,
  page: number,
  pageSize: number,
  /** 구분(전략) 프리필터. AC/VC/PE 탭이 건다. */
  strategy?: 'AC' | 'VC' | 'PE' | null,
  /** 지정 시 생성자 또는 담당자가 이 사용자인 펀드만('내 펀드'). */
  mineUserId?: string | null,
) {
  return useQuery({
    queryKey: [
      'fund',
      'list',
      'page',
      keyword,
      filters,
      page,
      pageSize,
      strategy ?? null,
      mineUserId ?? null,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FundListPage> => {
      const kw = sanitizeOrValue(keyword)

      const scope: LedgerCondition[] = []
      // 구분 프리필터 — 미분류(null) 펀드는 AC/VC/PE 탭에서 제외된다.
      if (strategy) scope.push({ kind: 'eq', column: 'strategy_type', value: strategy })
      if (mineUserId) scope.push(await mineScope(mineUserId))

      const narrow: LedgerCondition[] = []
      if (kw) narrow.push(await searchCondition(kw))
      if (filters.statuses.length)
        narrow.push({ kind: 'in', column: 'status', values: filters.statuses })
      if (filters.sources.length)
        narrow.push({ kind: 'in', column: 'source_type', values: filters.sources })
      if (filters.characters.length)
        narrow.push({ kind: 'in', column: 'character_type', values: filters.characters })
      if (filters.fundTypes.length)
        narrow.push({ kind: 'in', column: 'fund_type', values: filters.fundTypes })

      const raw = await fetchLedgerPage<Record<string, unknown>>({
        table: 'funds',
        select: FUND_LIST_SELECT,
        // funds는 병합을 쓰지 않아 soft delete 컬럼 하나다(인덱스 부분 조건과 일치).
        liveColumns: ['deleted_at'],
        order: { column: 'vintage_year', ascending: false, nullsFirst: false },
        page,
        pageSize,
        scope,
        narrow,
      })

      return {
        ...raw,
        rows: raw.rows.map((row) => ({
          id: row.id as string,
          code: (row.code as string) ?? null,
          name: row.name as string,
          vintage_year: (row.vintage_year as number) ?? null,
          total_commitment: Number(row.total_commitment),
          drawn_amount: Number(row.drawn_amount),
          status: row.status as string,
          source_type: (row.source_type as string) ?? null,
          character_type: (row.character_type as string) ?? null,
          strategy_type: (row.strategy_type as string) ?? null,
          fund_type: (row.fund_type as string) ?? null,
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
        })),
      }
    },
  })
}
