import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/networks/hooks'
import {
  fetchLedgerPage,
  managedRecordIds,
  sanitizeOrValue,
  userIdsByName,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
import type { ManagementStatus } from '@/features/startup/startupClassification'

/**
 * 발굴기업(startups) 목록 복수 필터. 빈 배열/빈 문자열은 "미적용"이다.
 * 분야만 배열 컬럼(industries)이라 overlaps로, 나머지 스칼라는 in으로, 설립일은 범위로 건다.
 */
export interface StartupPoolFilters {
  /** 소재지(location, location_tags 태그명). */
  locations: string[]
  /** 분야(industries 배열, 태그명) — 선택 중 하나라도 포함(overlaps). */
  industries: string[]
  /** 단계(stage). */
  stages: string[]
  /** 구분(management_status). */
  categories: string[]
  /** 관리현황(pool_status). 투자기업에서만 채워지므로 비투자 탭에서는 필터 자체를 내린다. */
  statuses: string[]
  /** 최소 업력(년차, 만 나이 기준). '' = 미적용. */
  ageMin: string
  /** 최대 업력(년차, 만 나이 기준). '' = 미적용. */
  ageMax: string
}

/** 필터 초기값(전부 미적용). */
export const EMPTY_STARTUP_FILTERS: StartupPoolFilters = {
  locations: [],
  industries: [],
  stages: [],
  categories: [],
  statuses: [],
  ageMin: '',
  ageMax: '',
}

/**
 * 검색어를 걸어도 되는 민감 필드(이메일·연락처). 목록에서 가려지는 값은 검색어로도 잡지 않는다 —
 * `d***@example.com`으로 보이는 값이 전체 주소로 검색되면, 화면이 가린 것을 검색창이 되짚어 주는
 * 확인 도구가 되기 때문이다. 판단 근거는 화면과 동일한 마스킹 정책(useMaskPolicy)이다.
 *
 * 다만 이것은 **표시 일관성이지 보안 경계가 아니다** — 목록 조회는 행 전체를 그대로 내려받고
 * 마스킹은 렌더 단계에서 걸리므로, 원본은 이미 클라이언트에 있다. 정책이 서버(정책 테이블 +
 * RPC)로 옮겨갈 때 이 게이트도 함께 서버로 옮겨야 실제 통제가 된다.
 */
export interface StartupSearchScope {
  email: boolean
  phone: boolean
}

/** 하나라도 활성 필터가 있는지. */
export function hasActiveStartupFilters(f: StartupPoolFilters): boolean {
  return (
    f.locations.length > 0 ||
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

/** 기업 목록 페이지. 다른 원장 목록과 동일 규약(rows + 건수 둘). */
export type StartupPoolPage = LedgerPage<EntityRow>

/**
 * 발굴기업 풀 전용 서버 사이드 페이지네이션 훅. NETWORKS 공용 useEntityPage와 달리
 * 다중 필드 검색(기업명·대표자·사업자번호·담당자 + 공개 시 이메일·연락처)과
 * 복수 필터(소재지·분야·단계·구분·관리현황·설립일)를
 * 스타트업 스키마에 맞춰 처리한다. 담당자(투자 지정)는 startup_managers를 임베드해 컬럼으로 노출하고,
 * 생성자(created_by)는 '내 관리기업' 조회 조건으로만 쓴다(표시·검색 대상은 아님).
 */
export function useStartupPoolPage(
  keyword: string,
  filters: StartupPoolFilters,
  page: number,
  pageSize: number,
  /** 탭별 구분 고정 필터(코드). 지정 시 해당 구분만 조회한다(4개 메뉴 상호 배타 뷰). */
  category?: ManagementStatus | null,
  /**
   * 지정 시 담당자(startup_managers) 또는 생성자(created_by)가 이 사용자인 기업만 조회한다('내 관리기업').
   * 담당자는 투자기업 전용 개념이므로 생성자 축을 함께 봐야 발굴·보육·기타 기업도 잡힌다.
   */
  mineUserId?: string | null,
  /** 검색 대상에 포함할 민감 필드. 마스킹 정책이 공개로 열린 필드만 켠다. */
  searchScope: StartupSearchScope = { email: false, phone: false },
) {
  return useQuery({
    // 정책이 바뀌면 같은 검색어라도 결과가 달라지므로 스코프도 캐시 키에 넣는다.
    queryKey: [
      'startups',
      'pool',
      keyword,
      filters,
      page,
      pageSize,
      category ?? null,
      mineUserId ?? null,
      searchScope,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StartupPoolPage> => {
      const kw = sanitizeOrValue(keyword)

      const scope: LedgerCondition[] = []
      // 탭 고정 구분(있으면). 사용자 구분 필터는 탭 뷰에서 제거되어 category 로만 좁힌다.
      if (category) scope.push({ kind: 'eq', column: 'management_status', value: category })
      // '내 관리기업' 스코프: 생성자(created_by=나) OR 담당자(startup_managers.user_id=나).
      // 담당은 원장 밖에 있어 조인으로 걸 수 없으므로 담당 기업 id를 먼저 모은다.
      if (mineUserId) {
        const ids = await managedRecordIds('startup_managers', 'startup_id', mineUserId)
        const parts = [`created_by.eq.${mineUserId}`]
        if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
        scope.push({ kind: 'or', expr: parts.join(',') })
      }

      const narrow: LedgerCondition[] = []
      if (kw) narrow.push(await searchCondition(kw, searchScope))
      // 분야(industries)은 jsonb 배열이라 overlaps(&&) 불가 — 각 선택값의 포함(@>, cs)을 OR로 묶는다.
      if (filters.industries.length) {
        narrow.push({
          kind: 'or',
          expr: filters.industries
            .map((name) => `industries.cs.${JSON.stringify([name])}`)
            .join(','),
        })
      }
      if (filters.locations.length)
        narrow.push({ kind: 'in', column: 'location', values: filters.locations })
      if (filters.stages.length)
        narrow.push({ kind: 'in', column: 'stage', values: filters.stages })
      if (filters.categories.length)
        narrow.push({ kind: 'in', column: 'management_status', values: filters.categories })
      if (filters.statuses.length)
        narrow.push({ kind: 'in', column: 'pool_status', values: filters.statuses })

      // 업력(년차) 범위 → 설립일 경계. 최소 N년차 이상 = N년 전 또는 그 이전에 설립.
      // 최대 N년차 이하 = (N+1)년 전보다 나중에 설립(만 나이 N년 초과분 제외).
      const ageMin = Number.parseInt(filters.ageMin, 10)
      const ageMax = Number.parseInt(filters.ageMax, 10)
      if (Number.isFinite(ageMin) && filters.ageMin !== '')
        narrow.push({ kind: 'lte', column: 'founded_on', value: foundedCutoff(ageMin) })
      if (Number.isFinite(ageMax) && filters.ageMax !== '')
        narrow.push({ kind: 'gt', column: 'founded_on', value: foundedCutoff(ageMax + 1) })

      return fetchLedgerPage<EntityRow>({
        table: 'startups',
        // creator = 생성자(created_by). managers = 담당자(투자기업 지정, startup_managers).
        // 두 축은 별개 — 생성자 컬럼은 전 구분 공통, 담당자 컬럼은 투자 전용(비투자는 담당자 없음=공동관리).
        select:
          '*, creator:users!created_by(id, name), managers:startup_managers(user_id, is_lead, user:users!startup_managers_user_id_fkey(id, name))',
        liveColumns: ['deleted_at', 'merged_into_id'],
        order: { column: 'name', ascending: true },
        page,
        pageSize,
        scope,
        narrow,
      })
    },
  })
}

/**
 * 검색어 조건: 기업명·대표자·사업자번호 + 담당자(이름→users.id→startup_managers 역조회).
 * 생성자는 검색 대상이 아니다 — 목록이 답해야 하는 것은 '지금 누가 관리하나'이고,
 * 생성자는 아무 권한도 갖지 않는 축이라 열도 검색도 담당자 하나로 모은다.
 * 이메일·연락처는 목록에서 공개된 경우에만 검색어가 닿는다(가려진 값은 조건에서 빠진다).
 */
async function searchCondition(
  kw: string,
  searchScope: StartupSearchScope,
): Promise<LedgerCondition> {
  const parts = [`name.ilike.%${kw}%`, `representative.ilike.%${kw}%`, `biz_reg_no.ilike.%${kw}%`]
  if (searchScope.email) parts.push(`email.ilike.%${kw}%`)
  if (searchScope.phone) parts.push(`phone.ilike.%${kw}%`)

  const userIds = await userIdsByName(kw)
  if (userIds.length) {
    const { data: mgr } = await supabase
      .from('startup_managers')
      .select('startup_id')
      .in('user_id', userIds)
    const startupIds = [...new Set(((mgr ?? []) as { startup_id: string }[]).map((m) => m.startup_id))]
    if (startupIds.length) parts.push(`id.in.(${startupIds.join(',')})`)
  }
  return { kind: 'or', expr: parts.join(',') }
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
 * 투자 승격 RPC 호출(담당자 지정 + investment 전환 + 관리현황·단계 지정 원자 처리).
 * 미투자 → 투자 전환은 자사 투자 집행이 있을 때만 서버가 허용한다(20260724190000).
 * poolStatus·stage 를 주면 승격과 동시에 관리현황·단계를 세팅한다(생략 시 기존값 유지, 20260724220000).
 * closedOn(폐업일자)은 관리현황이 '폐업'일 때만 유효 — 그 외 상태로 바뀌면 서버가 NULL 로 정리한다(20260724230000).
 */
export function usePromoteToInvested() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      startupId: string
      leadUserId: string
      supportUserIds: string[]
      poolStatus?: string | null
      /** 라운드(투자단계) = startups.stage 로 전파. */
      stage?: string | null
      /** 폐업일자(YYYY-MM-DD). 관리현황이 폐업일 때만 서버가 반영한다. */
      closedOn?: string | null
    }) => {
      const { error } = await supabase.rpc('promote_to_invested', {
        p_startup_id: args.startupId,
        p_lead_user_id: args.leadUserId,
        p_support_user_ids: args.supportUserIds,
        p_pool_status: args.poolStatus ?? null,
        p_stage: args.stage ?? null,
        p_closed_on: args.closedOn ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: ['startups'] })
      void qc.invalidateQueries({ queryKey: ['startups', 'managers', args.startupId] })
      void qc.invalidateQueries({ queryKey: ['fund'] })
    },
  })
}
