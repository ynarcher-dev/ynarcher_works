import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/master/entityHooks'
import { readBusiness } from '@/features/startup/StartupBusinessTeamCard'
import { readIndustries } from '@/features/startup/startupGrowth'

/**
 * 임직원 상세 '활동 이력' 조회 훅 모음.
 *
 * 원천은 각 워크스페이스의 **담당자 원장**이다 — 그 사람이 지금 무엇을 맡고 있는지를 묻는
 * 자리이므로 생성자(created_by) 축은 보지 않는다(생성자는 아무 권한도 갖지 않는 별개 축).
 * 담당자 원장이 없는 도메인(NETWORKS 계열, 발굴·보육 기업)은 영구 공동관리라 개인의
 * 활동으로 환원되지 않으므로 애초에 카드가 없다.
 *
 * 각 조회는 담당자 원장에서 시작해 원장 레코드를 임베드로 끌어온다. 원장 RLS가 그대로 걸리므로
 * 보는 사람이 그 워크스페이스 읽기 권한이 없으면 행이 비어 돌아온다(빈 카드로 degrade).
 */

/** 소프트 삭제·병합된 레코드를 걸러내는 공통 판정. */
function isLive(r: { deleted_at?: string | null; merged_into_id?: string | null } | null): boolean {
  return Boolean(r) && !r?.deleted_at && !r?.merged_into_id
}

/** 문자열 내림차순(빈 값은 항상 뒤로). 기간 시작일 기준 최신순 정렬에 쓴다. */
function byDateDesc(a: string | null, b: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return b.localeCompare(a)
}

// ─────────────────────────────────────────────────────────────────────────────
// 관리기업(STARTUP)
// ─────────────────────────────────────────────────────────────────────────────

/** 투자(관리)기업 한 행. 기업을 알아보는 값(단계·분야·한 줄 소개)만 담는다. */
export interface ActivityStartup {
  id: string
  name: string
  stage: string | null
  /** 분야 태그. SSOT는 industries(jsonb 배열)이고 레거시 단일 industry를 흡수한다. */
  industries: string[]
  /** 한 줄 소개(business_profile.oneLiner) — 상세 헤더 부제와 같은 값. */
  oneLiner: string
}

interface StartupManagerJoin {
  startup: {
    id: string
    name: string
    stage: string | null
    industries: unknown
    industry: string | null
    business_profile: unknown
    deleted_at: string | null
    merged_into_id: string | null
  } | null
}

/**
 * 담당자로 지정된 기업 목록. 담당자 원장(startup_managers)은 투자기업에만 채워지므로
 * 사실상 투자기업이 잡힌다 — 발굴·보육은 공동관리라 개인에게 귀속되지 않는다.
 */
export function useEmployeeStartups(userId: string | undefined) {
  return useQuery({
    queryKey: ['management', 'activity', 'startups', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ActivityStartup[]> => {
      const { data, error } = await supabase
        .from('startup_managers')
        .select(
          'startup:startups!startup_managers_startup_id_fkey(id, name, stage, industries, industry, business_profile, deleted_at, merged_into_id)',
        )
        .eq('user_id', userId)
      if (error) throw error
      return ((data ?? []) as unknown as StartupManagerJoin[])
        .filter((r) => isLive(r.startup))
        .map((r) => ({
          id: r.startup!.id,
          name: r.startup!.name,
          stage: r.startup!.stage,
          // 두 컬럼(신형 배열 + 레거시 단일)을 읽는 규칙은 STARTUP이 소유한다.
          industries: readIndustries(r.startup as unknown as EntityRow),
          oneLiner: readBusiness(r.startup as unknown as EntityRow).oneLiner ?? '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 사업(AC 운영사업 · M&A · 프로젝트)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 사업 원장 3종은 스키마가 같아 조회도 하나로 쓴다(features/program 공유 원칙과 같은 이유).
 * 워크스페이스별 차이는 테이블명·임베드 FK명뿐이다.
 */
const PROGRAM_LEDGERS = {
  ac: { managers: 'program_managers', programs: 'programs' },
  mna: { managers: 'ma_program_managers', programs: 'ma_programs' },
  project: { managers: 'project_program_managers', programs: 'project_programs' },
} as const

export type ProgramLedgerKey = keyof typeof PROGRAM_LEDGERS

/** 사업 한 행. 사업을 알아보는 값(기간·태그·설명) + 이 사람이 그 사업에서 가진 자리. */
export interface ActivityProgram {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  /** 분야 태그(industries jsonb). */
  industries: string[]
  description: string | null
  /** 대표(PM) 여부. 한 사람이 여러 구간을 가지므로 하나라도 PM이면 PM으로 접는다. */
  isPm: boolean
  /**
   * 투입률(%). 구간(부서·기간)마다 값이 달라 한 숫자로 접어야 하는데, 상세
   * (ProgramInfoCard)가 이미 사람당 최대치로 접고 있어 같은 규칙을 쓴다 —
   * 두 화면이 같은 사람에게 다른 비율을 적으면 어느 쪽이 맞는지 알 길이 없다.
   */
  rate: number
}

interface ProgramManagerJoin {
  role: string | null
  allocation_rate: number | null
  program: {
    id: string
    title: string
    start_date: string | null
    end_date: string | null
    industries: unknown
    description: string | null
    deleted_at: string | null
  } | null
}

/**
 * 담당자로 배정된 사업 목록. 담당자 원장은 사람당 **복수 구간**(부서·기간별)을 담으므로
 * 사업 id로 먼저 접는다 — 접지 않으면 같은 사업이 구간 수만큼 행으로 늘어난다.
 */
export function useEmployeePrograms(ws: ProgramLedgerKey, userId: string | undefined) {
  const ledger = PROGRAM_LEDGERS[ws]
  return useQuery({
    queryKey: ['management', 'activity', 'programs', ws, userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ActivityProgram[]> => {
      const { data, error } = await supabase
        .from(ledger.managers)
        .select(
          `role, allocation_rate, program:${ledger.programs}!${ledger.managers}_program_id_fkey(id, title, start_date, end_date, industries, description, deleted_at)`,
        )
        .eq('user_id', userId)
      if (error) throw error
      const byId = new Map<string, ActivityProgram>()
      for (const r of (data ?? []) as unknown as ProgramManagerJoin[]) {
        const p = r.program
        if (!isLive(p)) continue
        const prev = byId.get(p!.id)
        byId.set(p!.id, {
          id: p!.id,
          title: p!.title,
          start_date: p!.start_date,
          end_date: p!.end_date,
          industries: Array.isArray(p!.industries)
            ? p!.industries.map((v) => String(v).trim()).filter(Boolean)
            : [],
          description: p!.description,
          isPm: (prev?.isPm ?? false) || r.role === 'PM',
          rate: Math.max(prev?.rate ?? 0, r.allocation_rate ?? 0),
        })
      }
      // 활동 이력은 최근에 한 일이 위로 와야 읽힌다 — 운영 시작일 내림차순.
      return [...byId.values()].sort((a, b) => byDateDesc(a.start_date, b.start_date))
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 펀드(FUND)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 펀드에서 한 사람이 가질 수 있는 자리. 대표펀드매니저는 `funds.manager_id`(단수)이고
 * 운용역·관리인력은 `fund_managers.role`이라 원천이 둘로 갈린다.
 */
export type FundSeat = 'LEAD' | 'OPERATION' | 'ADMIN'

/**
 * 펀드 한 행. 펀드명 + 운용(투자)기간 + 약정총액.
 * 기간은 존속기간(term_*)이 아니라 **운용기간(operation_*)** 이다 — 사람의 활동 이력이 묻는 것은
 * 조합이 언제까지 살아 있는가가 아니라 그가 언제 그 펀드를 굴렸는가다.
 */
export interface ActivityFund {
  id: string
  name: string
  operation_start: string | null
  operation_end: string | null
  total_commitment: number
  /** 이 사람이 이 펀드에서 가진 자리(복수 가능 — 운용·관리를 겸할 수 있다). */
  seats: FundSeat[]
}

/**
 * 참여 펀드 목록(운용·관리 두 축을 한 번에 조회한다 — 화면은 카드 하나에 담고 seats를 역할 열로 편다).
 * 대표펀드매니저(funds.manager_id)는 fund_managers에 행이 없으므로 원장 쪽 조건으로 함께 건다 —
 * 담당자 원장만 보면 대표로만 올라간 펀드가 그 사람의 이력에서 통째로 빠진다.
 */
export function useEmployeeFunds(userId: string | undefined) {
  return useQuery({
    queryKey: ['management', 'activity', 'funds', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ActivityFund[]> => {
      const { data: seatRows, error: seatError } = await supabase
        .from('fund_managers')
        .select('fund_id, role')
        .eq('user_id', userId)
      if (seatError) throw seatError
      const seatsByFund = new Map<string, Set<FundSeat>>()
      for (const r of (seatRows ?? []) as { fund_id: string; role: string | null }[]) {
        const set = seatsByFund.get(r.fund_id) ?? new Set<FundSeat>()
        set.add(r.role === 'ADMIN' ? 'ADMIN' : 'OPERATION')
        seatsByFund.set(r.fund_id, set)
      }

      const parts = [`manager_id.eq.${userId}`]
      const ids = [...seatsByFund.keys()]
      if (ids.length) parts.push(`id.in.(${ids.join(',')})`)

      const { data, error } = await supabase
        .from('funds')
        .select('id, name, operation_start, operation_end, total_commitment, manager_id')
        .is('deleted_at', null)
        .or(parts.join(','))
      if (error) throw error

      return ((data ?? []) as (ActivityFund & { manager_id: string | null })[])
        .map((f) => {
          const seats = new Set(seatsByFund.get(f.id) ?? [])
          // 대표펀드매니저는 운용 축의 최상단이라 별도 자리로 세운다(역할 열에서 맨 앞에 온다).
          if (f.manager_id === userId) seats.add('LEAD')
          return { ...f, total_commitment: Number(f.total_commitment), seats: [...seats] }
        })
        .sort((a, b) => byDateDesc(a.operation_start, b.operation_start))
    },
  })
}
