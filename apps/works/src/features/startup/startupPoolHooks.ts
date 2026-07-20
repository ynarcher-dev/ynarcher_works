import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/networks/hooks'
import type { ManagementStatus } from '@/features/startup/startupClassification'

/**
 * 발굴기업(startups) 목록 복수 필터. 빈 배열/빈 문자열은 "미적용"이다.
 * 산업만 배열 컬럼(industries)이라 overlaps로, 나머지 스칼라는 in으로, 설립일은 범위로 건다.
 */
export interface StartupPoolFilters {
  /** 산업(industries 배열, 태그명) — 선택 중 하나라도 포함(overlaps). */
  industries: string[]
  /** 단계(stage). */
  stages: string[]
  /** 구분(management_status). */
  categories: string[]
  /** 관리현황(pool_status). */
  statuses: string[]
  /** 최소 업력(년차, 만 나이 기준). '' = 미적용. */
  ageMin: string
  /** 최대 업력(년차, 만 나이 기준). '' = 미적용. */
  ageMax: string
}

/** 필터 초기값(전부 미적용). */
export const EMPTY_STARTUP_FILTERS: StartupPoolFilters = {
  industries: [],
  stages: [],
  categories: [],
  statuses: [],
  ageMin: '',
  ageMax: '',
}

/** 하나라도 활성 필터가 있는지. */
export function hasActiveStartupFilters(f: StartupPoolFilters): boolean {
  return (
    f.industries.length > 0 ||
    f.stages.length > 0 ||
    f.categories.length > 0 ||
    f.statuses.length > 0 ||
    f.ageMin !== '' ||
    f.ageMax !== ''
  )
}

/** 오늘에서 years년 뺀 날짜(YYYY-MM-DD). 업력(년차)을 설립일 경계로 환산할 때 쓴다. */
function foundedCutoff(years: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setFullYear(d.getFullYear() - years)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface StartupPoolPage {
  rows: EntityRow[]
  /** 검색어·필터 반영 건수(페이지 수·No. 넘버링 기준). */
  total: number
  /** 미삭제/미병합 전체 건수(검색·필터 미적용). */
  totalAll: number
}

/**
 * PostgREST `.or()` 값에서 문법 제어문자(콤마·괄호)를 제거해 필터 파싱이 깨지지 않게 한다.
 * 기업 검색어는 사실상 콤마/괄호를 담지 않으므로 유실 영향은 없다.
 */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

/**
 * 발굴기업 풀 전용 서버 사이드 페이지네이션 훅. NETWORKS 공용 useEntityPage와 달리
 * 다중 필드 검색(기업명·대표자·사업자번호·작성자)과 복수 필터(산업·단계·구분·관리현황·설립일)를
 * 스타트업 스키마에 맞춰 처리한다. 작성자(등록자)는 created_by FK를, 담당자(투자 지정)는
 * startup_managers를 각각 임베드해 별개 컬럼으로 노출한다(두 축은 서로 다를 수 있음).
 */
export function useStartupPoolPage(
  keyword: string,
  filters: StartupPoolFilters,
  page: number,
  pageSize: number,
  /** 탭별 구분 고정 필터(코드). 지정 시 해당 구분만 조회한다(4개 메뉴 상호 배타 뷰). */
  category?: ManagementStatus | null,
  /**
   * 지정 시 담당자(startup_managers) 또는 등록자(created_by)가 이 사용자인 기업만 조회한다('내 관리기업').
   * 담당자는 투자기업 전용 개념이므로 등록자 축을 함께 봐야 발굴·보육·기타 기업도 잡힌다.
   */
  mineUserId?: string | null,
) {
  return useQuery({
    queryKey: [
      'startups',
      'pool',
      keyword,
      filters,
      page,
      pageSize,
      category ?? null,
      mineUserId ?? null,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StartupPoolPage> => {
      const from = page * pageSize
      const to = from + pageSize - 1
      const kw = sanitizeOrValue(keyword)

      // '내 관리기업' 스코프: 등록자(created_by=나) OR 담당자(startup_managers.user_id=나).
      // 담당 기업 id를 먼저 조회해 or 조건을 구성한다(AC useProgramsPage와 동일 패턴).
      let mineOr: string | null = null
      if (mineUserId) {
        const { data: mgr } = await supabase
          .from('startup_managers')
          .select('startup_id')
          .eq('user_id', mineUserId)
        const ids = ((mgr ?? []) as { startup_id: string }[]).map((m) => m.startup_id)
        mineOr = ids.length
          ? `created_by.eq.${mineUserId},id.in.(${ids.join(',')})`
          : `created_by.eq.${mineUserId}`
      }

      let q = supabase
        .from('startups')
        .select(
          // creator = 작성자(등록자, created_by). managers = 담당자(투자기업 지정, startup_managers).
          // 두 축은 별개 — 작성자 컬럼은 전 구분 공통, 담당자 컬럼은 투자 전용(비투자는 담당자 없음=공동관리).
          '*, creator:users!created_by(id, name), managers:startup_managers(user_id, is_lead, user:users!startup_managers_user_id_fkey(id, name))',
          { count: 'exact' },
        )
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .range(from, to)

      // 탭 고정 구분(있으면). 사용자 구분 필터는 탭 뷰에서 제거되어 category 로만 좁힌다.
      if (category) q = q.eq('management_status', category)
      if (mineOr) q = q.or(mineOr)

      // 검색: 기업명·대표자·사업자번호 + 작성자(등록자 이름→created_by id 역조회).
      if (kw) {
        const orParts = [
          `name.ilike.%${kw}%`,
          `representative.ilike.%${kw}%`,
          `biz_reg_no.ilike.%${kw}%`,
        ]
        const { data: matchedUsers } = await supabase
          .from('users')
          .select('id')
          .ilike('name', `%${kw}%`)
        const ids = ((matchedUsers ?? []) as { id: string }[]).map((u) => u.id)
        if (ids.length) orParts.push(`created_by.in.(${ids.join(',')})`)
        q = q.or(orParts.join(','))
      }

      // 복수 필터. 단계/구분/현황은 스칼라(in), 설립일은 범위.
      // 산업(industries)은 jsonb 배열이라 overlaps(&&) 불가 — 각 선택값의 포함(@>, cs)을 OR로 묶는다.
      if (filters.industries.length) {
        const industryOr = filters.industries
          .map((name) => `industries.cs.${JSON.stringify([name])}`)
          .join(',')
        q = q.or(industryOr)
      }
      if (filters.stages.length) q = q.in('stage', filters.stages)
      if (filters.categories.length) q = q.in('management_status', filters.categories)
      if (filters.statuses.length) q = q.in('pool_status', filters.statuses)

      // 업력(년차) 범위 → 설립일 경계. 최소 N년차 이상 = N년 전 또는 그 이전에 설립.
      // 최대 N년차 이하 = (N+1)년 전보다 나중에 설립(만 나이 N년 초과분 제외).
      const ageMin = Number.parseInt(filters.ageMin, 10)
      const ageMax = Number.parseInt(filters.ageMax, 10)
      if (Number.isFinite(ageMin) && filters.ageMin !== '')
        q = q.lte('founded_on', foundedCutoff(ageMin))
      if (Number.isFinite(ageMax) && filters.ageMax !== '')
        q = q.gt('founded_on', foundedCutoff(ageMax + 1))

      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      // 검색·필터가 하나도 없으면 반영 건수 == 전체 건수. 있을 때만 전체 건수를 별도 조회한다.
      let totalAll = total
      if (kw || hasActiveStartupFilters(filters)) {
        let allQ = supabase
          .from('startups')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('merged_into_id', null)
        if (category) allQ = allQ.eq('management_status', category)
        if (mineOr) allQ = allQ.or(mineOr)
        const { count: allCount } = await allQ
        totalAll = allCount ?? total
      }

      return { rows: (data ?? []) as EntityRow[], total, totalAll }
    },
  })
}

/** 스타트업 담당자 행(startup_managers + user 임베드). */
export interface StartupManagerRow {
  user_id: string
  is_lead: boolean
  user: { id: string; name: string | null } | null
}

/** 특정 스타트업의 담당자 목록(리드 우선). id 미지정 시 비활성. */
export function useStartupManagers(startupId: string | undefined) {
  return useQuery({
    queryKey: ['startups', 'managers', startupId],
    enabled: Boolean(startupId),
    queryFn: async (): Promise<StartupManagerRow[]> => {
      const { data, error } = await supabase
        .from('startup_managers')
        .select('user_id, is_lead, user:users!startup_managers_user_id_fkey(id, name)')
        .eq('startup_id', startupId)
        .order('is_lead', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StartupManagerRow[]
    },
  })
}

/**
 * 투자 승격 RPC 호출(담당자 지정 + investment 전환 원자 처리).
 * 미투자 → 투자, 또는 이미 투자기업의 담당자 재구성 모두 이 RPC 하나로 처리한다.
 */
export function usePromoteToInvested() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      startupId: string
      leadUserId: string
      supportUserIds: string[]
    }) => {
      const { error } = await supabase.rpc('promote_to_invested', {
        p_startup_id: args.startupId,
        p_lead_user_id: args.leadUserId,
        p_support_user_ids: args.supportUserIds,
      })
      if (error) throw error
    },
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: ['startups'] })
      void qc.invalidateQueries({ queryKey: ['startups', 'managers', args.startupId] })
    },
  })
}
