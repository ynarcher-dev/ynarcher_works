import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/auth/authStore'
import { supabase } from '@/lib/supabase'

/** 현재 로그인 사용자의 입사일(hr_profiles). 프로필이 없으면 null. */
export function useMyHireDate() {
  const userId = useAuthStore((s) => s.user?.id)
  const isUuid = /^[0-9a-f-]{36}$/i.test(userId ?? '')
  return useQuery({
    queryKey: ['hub', 'hire-date', userId],
    enabled: isUuid,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('hr_profiles')
        .select('hire_date')
        .eq('user_id', userId)
        .maybeSingle()
      return (data?.hire_date as string) ?? null
    },
  })
}

export interface SearchResult {
  id: string
  name: string
  kind: 'startup' | 'expert'
  detail: string | null
}

/** 통합 키워드 검색(스타트업/전문가). RLS가 권한 교차 필터를 강제한다. */
export function useUnifiedSearch(keyword: string) {
  return useQuery({
    queryKey: ['hub', 'search', keyword],
    enabled: keyword.trim().length >= 1,
    queryFn: async (): Promise<SearchResult[]> => {
      const like = `%${keyword.trim()}%`
      const [s, e] = await Promise.all([
        supabase
          .from('startups')
          .select('id, name, industry')
          .ilike('name', like)
          .is('deleted_at', null)
          .limit(20),
        supabase
          .from('experts')
          .select('id, name, affiliation')
          .ilike('name', like)
          .is('deleted_at', null)
          .limit(20),
      ])
      const startups = (s.data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        kind: 'startup' as const,
        detail: (r.industry as string) ?? null,
      }))
      const experts = (e.data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        kind: 'expert' as const,
        detail: (r.affiliation as string) ?? null,
      }))
      return [...startups, ...experts]
    },
  })
}

export interface SystemEvent {
  id: string
  event_type: string
  title: string
  starts_at: string | null
  ends_at: string | null
}

/** 전사 통합 캘린더 이벤트(system_events, 4개 레이어). */
export function useSystemEvents() {
  return useQuery({
    queryKey: ['hub', 'events'],
    queryFn: async (): Promise<SystemEvent[]> => {
      const { data } = await supabase
        .from('system_events')
        .select('id, event_type, title, starts_at, ends_at')
        .is('deleted_at', null)
        .order('starts_at', { ascending: true })
        .limit(100)
      return (data ?? []) as SystemEvent[]
    },
  })
}

export interface ExpertRank {
  expert_id: string
  expert_name: string
  avg_score: number
  session_count: number
}

/** 전문가 만족도 랭킹(mentor_satisfaction_records 평균 내림차순, RPC 집계). */
export function useExpertRanking() {
  return useQuery({
    queryKey: ['hub', 'ranking'],
    queryFn: async (): Promise<ExpertRank[]> => {
      const { data, error } = await supabase.rpc('hub_expert_ranking')
      if (error) throw error
      return (data ?? []) as ExpertRank[]
    },
  })
}

/** HUB 대시보드 좌측 인포 — 각 워크스페이스의 대표 지표 하나씩 집계. */
export interface HubSummary {
  ac: { operating: number; total: number }
  mna: { active: number; totalValue: number }
  project: { active: number; avgProgress: number }
  fund: { aum: number; drawn: number }
  management: { pending: number; total: number }
  networks: {
    managers: number
    startups: number
    /** 투자/전문가 네트워크(전문가+VAN+투자사) 합계. */
    investExperts: number
    /** 협력사 네트워크(기관+기업+대학+기타) 합계. */
    partners: number
  }
}

/**
 * 8대 메뉴 요약 지표를 병렬 조회한다. 각 테이블 RLS가 열람 권한을 강제하므로
 * 접근 불가 도메인은 0으로 집계되어 자연히 축소 노출된다.
 */
export function useHubSummary() {
  return useQuery({
    queryKey: ['hub', 'summary'],
    staleTime: 60_000,
    queryFn: async (): Promise<HubSummary> => {
      const headCount = (table: string) =>
        supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)

      const [
        programs,
        deals,
        projects,
        funds,
        approvals,
        managers,
        startups,
        experts,
        van,
        investors,
        institutions,
        corporates,
        universities,
        others,
      ] = await Promise.all([
        supabase.from('programs').select('status').is('deleted_at', null),
        supabase.from('ma_deals').select('estimated_value, on_hold').is('deleted_at', null),
        supabase.from('projects').select('progress_pct').is('deleted_at', null),
        supabase.from('funds').select('total_commitment, drawn_amount').is('deleted_at', null),
        supabase.from('approval_documents').select('status').is('deleted_at', null),
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .not('user_type', 'in', '(external_startup,external_expert,temporary_guest)'),
        headCount('startups'),
        headCount('experts'),
        headCount('van'),
        headCount('investors'),
        headCount('institutions'),
        headCount('corporates'),
        headCount('universities'),
        headCount('others'),
      ])

      const pRows = programs.data ?? []
      const dRows = (deals.data ?? []).filter((d) => !d.on_hold)
      const prjRows = projects.data ?? []
      const fRows = funds.data ?? []
      const aRows = approvals.data ?? []

      const avg = (arr: number[]) =>
        arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0

      return {
        ac: {
          operating: pRows.filter((p) => p.status === 'OPERATING').length,
          total: pRows.length,
        },
        mna: {
          active: dRows.length,
          totalValue: dRows.reduce((s, d) => s + Number(d.estimated_value ?? 0), 0),
        },
        project: {
          active: prjRows.length,
          avgProgress: avg(prjRows.map((p) => Number(p.progress_pct ?? 0))),
        },
        fund: {
          aum: fRows.reduce((s, f) => s + Number(f.total_commitment ?? 0), 0),
          drawn: fRows.reduce((s, f) => s + Number(f.drawn_amount ?? 0), 0),
        },
        management: {
          pending: aRows.filter((a) => a.status === 'PENDING' || a.status === 'IN_REVIEW').length,
          total: aRows.length,
        },
        networks: {
          managers: managers.count ?? 0,
          startups: startups.count ?? 0,
          investExperts:
            (experts.count ?? 0) + (van.count ?? 0) + (investors.count ?? 0),
          partners:
            (institutions.count ?? 0) +
            (corporates.count ?? 0) +
            (universities.count ?? 0) +
            (others.count ?? 0),
        },
      }
    },
  })
}

export interface Employee {
  id: string
  name: string
  email: string | null
  user_type: string
}

/** 임직원 프로필 디렉토리(내부 사용자). */
export function useEmployees() {
  return useQuery({
    queryKey: ['hub', 'employees'],
    queryFn: async (): Promise<Employee[]> => {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, user_type')
        .not('user_type', 'in', '(external_startup,external_expert,temporary_guest)')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(200)
      return (data ?? []) as Employee[]
    },
  })
}
