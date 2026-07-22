import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/auth/authStore'
import { supabase } from '@/lib/supabase'

/**
 * 현재 로그인 사용자의 입사일(users.profile.hire_date). 미입력이면 null.
 * hr_profiles가 아니라 users를 읽는다 — hr_profiles는 연차 정보 때문에 MANAGEMENT 열람
 * 권한으로 잠겨 있어, 그쪽에서 읽으면 대부분의 임직원에게 근속일(D+n)이 뜨지 않는다.
 */
export function useMyHireDate() {
  const userId = useAuthStore((s) => s.user?.id)
  const isUuid = /^[0-9a-f-]{36}$/i.test(userId ?? '')
  return useQuery({
    queryKey: ['hub', 'hire-date', userId],
    enabled: isUuid,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('users')
        .select('profile')
        .eq('id', userId)
        .maybeSingle()
      const profile = (data?.profile ?? {}) as Record<string, unknown>
      return typeof profile.hire_date === 'string' ? profile.hire_date : null
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
  /** 사용자 일정의 부가정보(종일·메모·동행자)를 담은 JSON 문자열. 시스템 이벤트는 평문/빈값. */
  body: string | null
  /** 등록자(users.id). 본인 일정 삭제 노출 판정에 쓴다. 시스템 이벤트는 null일 수 있다. */
  created_by: string | null
}

/** 사용자 일정 카테고리 — 업무(동행자 지정 가능) / 휴가. event_type 값으로 저장한다. */
export type EventCategory = 'WORK' | 'LEAVE'

export interface EventCompanion {
  id: string
  name: string
}

export interface EventMeta {
  allDay: boolean
  memo: string
  companions: EventCompanion[]
}

/** body(JSON 또는 평문)에서 종일·메모·동행자를 해석한다. 파싱 실패 시 평문을 메모로 본다. */
export function parseEventMeta(body: string | null): EventMeta {
  if (body) {
    try {
      const o = JSON.parse(body) as Record<string, unknown>
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        return {
          allDay: o.all_day === true,
          memo: typeof o.memo === 'string' ? o.memo : '',
          companions: Array.isArray(o.companions) ? (o.companions as EventCompanion[]) : [],
        }
      }
    } catch {
      // 평문 body(시스템 이벤트 등)는 아래에서 메모로 처리한다.
    }
  }
  return { allDay: false, memo: body ?? '', companions: [] }
}

/** 종일·메모·동행자를 body JSON 문자열로 직렬화한다(비어 있으면 null). */
export function encodeEventBody(meta: Partial<EventMeta>): string | null {
  const payload: Record<string, unknown> = {}
  if (meta.allDay) payload.all_day = true
  if (meta.memo) payload.memo = meta.memo
  if (meta.companions && meta.companions.length > 0) payload.companions = meta.companions
  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null
}

/**
 * 캘린더 이벤트 — 사용자가 등록한 업무/휴가 일정만 조회한다. 타 워크스페이스에서 자동 반영되는
 * 시스템 레이어(AC/PROJECT/FUND/COMPANY)는 이 캘린더에 노출하지 않는다(데이터는 보존, 표시만 제외).
 */
export function useSystemEvents() {
  return useQuery({
    queryKey: ['hub', 'events'],
    queryFn: async (): Promise<SystemEvent[]> => {
      const { data } = await supabase
        .from('system_events')
        .select('id, event_type, title, starts_at, ends_at, body, created_by')
        .in('event_type', ['WORK', 'LEAVE'])
        .is('deleted_at', null)
        .order('starts_at', { ascending: true })
        .limit(100)
      return (data ?? []) as SystemEvent[]
    },
  })
}

export interface NewSystemEvent {
  event_type: EventCategory
  title: string
  /** ISO 문자열(날짜 또는 날짜+시간). */
  starts_at: string
  ends_at: string | null
  body: string | null
}

/**
 * 전사 캘린더에 사용자 일정을 등록한다. 소유 워크스페이스는 OFFICE로 고정하며, 쓰기 권한·본인
 * 소유(created_by) 여부는 RLS(system_events_insert)가 강제하므로 created_by만 실어 보낸다.
 */
export function useCreateSystemEvent() {
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  return useMutation({
    mutationFn: async (input: NewSystemEvent): Promise<void> => {
      const { error } = await supabase.from('system_events').insert({
        event_type: input.event_type,
        workspace_key: 'office',
        title: input.title,
        body: input.body,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        created_by: userId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub', 'events'] }),
  })
}

/** 사용자 일정 수정. 소유·워크스페이스는 그대로 두고 내용/시간만 갱신한다. */
export function useUpdateSystemEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewSystemEvent & { id: string }): Promise<void> => {
      const { error } = await supabase
        .from('system_events')
        .update({
          event_type: input.event_type,
          title: input.title,
          body: input.body,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub', 'events'] }),
  })
}

/**
 * 사용자 일정 삭제(soft delete — deleted_at 스탬프). RLS(system_events_update)가 OFFICE 쓰기
 * 권한을 강제하며, UI는 본인이 등록한 일정에만 삭제를 노출한다.
 */
export function useDeleteSystemEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('system_events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hub', 'events'] }),
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
  mna: { operating: number; total: number }
  project: { operating: number; total: number }
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
        // M&A/PROJECT는 AC와 동일한 사업 원장 구조로 재편되어 상태 기준으로 집계한다.
        supabase.from('ma_programs').select('status').is('deleted_at', null),
        supabase.from('project_programs').select('status').is('deleted_at', null),
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
      const dRows = deals.data ?? []
      const prjRows = projects.data ?? []
      const fRows = funds.data ?? []
      const aRows = approvals.data ?? []

      return {
        ac: {
          operating: pRows.filter((p) => p.status === 'OPERATING').length,
          total: pRows.length,
        },
        mna: {
          operating: dRows.filter((d) => d.status === 'OPERATING').length,
          total: dRows.length,
        },
        project: {
          operating: prjRows.filter((p) => p.status === 'OPERATING').length,
          total: prjRows.length,
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
  /** 소속 부서(조직도 users.department_id). 프로그램 담당자 배치의 부서 자동 제안에 사용. */
  department_id: string | null
}

/** 임직원 프로필 디렉토리(내부 사용자). */
export function useEmployees() {
  return useQuery({
    queryKey: ['hub', 'employees'],
    queryFn: async (): Promise<Employee[]> => {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, user_type, department_id')
        .not('user_type', 'in', '(external_startup,external_expert,temporary_guest)')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .limit(200)
      return (data ?? []) as Employee[]
    },
  })
}
