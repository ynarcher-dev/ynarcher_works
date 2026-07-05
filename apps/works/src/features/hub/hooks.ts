import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
