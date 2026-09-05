import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/master/entityHooks'
import type { LedgerPage } from '@/features/master/ledgerPage'

/**
 * 기업(startups) 목록 복수 필터. 빈 배열/빈 문자열은 "미적용"이다.
 * 분야만 배열 컬럼(industries)이라 overlaps로, 나머지 스칼라는 in으로, 설립일은 범위로 건다.
 */
export interface StartupPoolFilters {
  /** 소재지(location, location_tags 태그명). 권역의 아래 단이라 권역 축과 함께 걸린다. */
  locations: string[]
  /**
   * 권역(location_region_tags id). 요약 카드의 권역 타일이 소유하는 축이며,
   * 소재지 태그의 부모(region_tag_id)로 판정한다.
   */
  regions: string[]
  /**
   * 권역 미지정(소재지가 비었거나 태그 원장에 없는 값). 권역 배열과 **OR**로 묶인다 —
   * AND로 두면 '수도권 또는 미지정'이 늘 0건이 되어, 고를 수 있다고 말하면서 아무것도
   * 답하지 않는 조합이 생긴다(NETWORKS가 2026-09-04에 고친 결함과 같은 자리).
   */
  regionUnset: boolean
  /** 분야(industries 배열, 태그명) — 선택 중 하나라도 포함(overlaps). */
  industries: string[]
  /** 투자단계(stage). 요약 카드의 단계 타일이 소유하는 축이다. */
  stages: string[]
  /** 투자단계 미지정. 단계 배열과 OR로 묶인다(권역 축과 같은 규약). */
  stageUnset: boolean
  /** 구분(management_status). 코드 4종(투자·보육·발굴·기타) 다중선택. */
  categories: string[]
  /** 관리현황(pool_status). 투자기업에서만 채워지는 값이라 비투자 구분에서는 결과가 빈다. */
  statuses: string[]
  /** 최소 업력(년차, 만 나이 기준). '' = 미적용. */
  ageMin: string
  /** 최대 업력(년차, 만 나이 기준). '' = 미적용. */
  ageMax: string
}

/** 필터 초기값(전부 미적용). */
export const EMPTY_STARTUP_FILTERS: StartupPoolFilters = {
  locations: [],
  regions: [],
  regionUnset: false,
  industries: [],
  stages: [],
  stageUnset: false,
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
    f.regions.length > 0 ||
    f.regionUnset ||
    f.industries.length > 0 ||
    f.stages.length > 0 ||
    f.stageUnset ||
    f.categories.length > 0 ||
    f.statuses.length > 0 ||
    f.ageMin !== '' ||
    f.ageMax !== ''
  )
}

/** 기업 목록 페이지. 다른 원장 목록과 동일 규약(rows + 건수 둘). */
export type StartupPoolPage = LedgerPage<EntityRow>

/**
 * 목록 RPC와 요약 집계 RPC가 **같은 인자 한 벌**을 받는다. 두 호출이 조건을 각자 조립하면
 * 표와 카드가 어긋나는 날이 오고, 어긋났을 때 어느 쪽이 사실인지 판정할 근거가 없다.
 * 축을 빼는 일(집계에서 자기 축 제외)은 화면이 아니라 서버가 한다.
 *
 * 업력(년차)은 년수 그대로 넘긴다 — 설립일 경계로 환산하는 일은 서버가 한다.
 * 클라이언트에서 오늘 날짜로 환산하면 자정을 넘긴 탭에서 어제 기준으로 조회하게 된다.
 */
export function startupFilterArgs(
  keyword: string,
  filters: StartupPoolFilters,
  mineUserId: string | null | undefined,
  searchScope: StartupSearchScope,
) {
  const ageMin = Number.parseInt(filters.ageMin, 10)
  const ageMax = Number.parseInt(filters.ageMax, 10)
  return {
    p_keyword: keyword.trim() || null,
    p_mine_user: mineUserId ?? null,
    p_locations: filters.locations.length ? filters.locations : null,
    p_regions: filters.regions.length ? filters.regions : null,
    // 미지정 축은 '켰을 때만' 조건이 된다. false를 그대로 보내면 '값이 있는 행만'이라는
    // 반대 조건이 되어, 아무것도 고르지 않은 화면이 미지정 행을 통째로 숨긴다.
    p_region_unset: filters.regionUnset ? true : null,
    p_industries: filters.industries.length ? filters.industries : null,
    p_stages: filters.stages.length ? filters.stages : null,
    p_stage_unset: filters.stageUnset ? true : null,
    p_categories: filters.categories.length ? filters.categories : null,
    p_statuses: filters.statuses.length ? filters.statuses : null,
    p_age_min: filters.ageMin !== '' && Number.isFinite(ageMin) ? ageMin : null,
    p_age_max: filters.ageMax !== '' && Number.isFinite(ageMax) ? ageMax : null,
    p_search_email: searchScope.email,
    p_search_phone: searchScope.phone,
  }
}

/** RPC가 돌려주는 행 한 줄(표시용 JSON + 필터 반영 건수). */
interface StartupPoolRpcRow {
  row_json: EntityRow
  total_count: number | string
}

/**
 * 기업 풀 목록 훅. 조회는 `startup_pool_entities` RPC 하나이며, 필터 판정은
 * `app.startup_pool_filtered`가 소유한다(요약 카드의 집계도 같은 함수를 부른다).
 *
 * 공용 `fetchLedgerPage`(PostgREST 조립)를 쓰지 않는 원장은 NETWORKS에 이어 여기가 둘째다.
 * 옮긴 이유는 목록이 아니라 **요약 카드** 때문이다 — 타일 하나가 조회 하나이던 구조로
 * 권역·투자단계 두 줄(약 19칸)을 세우면 요약만으로 스무 번 가까이 호출하게 된다.
 * 집계를 서버로 옮기려면 목록과 집계가 같은 판정을 공유해야 하고, 그 판정이 살 곳은 SQL이다.
 *
 * 전체 건수(totalAll)는 검색어·필터가 하나라도 걸렸을 때만 따로 묻는다(NETWORKS와 같은 규약) —
 * 범위(내 관리기업/전체)만 반영한 수라 분모로 쓰인다.
 */
export function useStartupPoolPage(
  keyword: string,
  filters: StartupPoolFilters,
  page: number,
  pageSize: number,
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
      mineUserId ?? null,
      searchScope,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StartupPoolPage> => {
      const { data, error } = await supabase.rpc('startup_pool_entities', {
        ...startupFilterArgs(keyword, filters, mineUserId, searchScope),
        p_limit: pageSize,
        p_offset: page * pageSize,
      })
      if (error) throw error

      const raw = (data ?? []) as StartupPoolRpcRow[]
      const total = Number(raw[0]?.total_count ?? 0)

      // 좁힘 조건이 없으면 반영 건수가 곧 전체 건수다 — 두 번째 질의를 내지 않는다.
      let totalAll = total
      if (keyword.trim() || hasActiveStartupFilters(filters)) {
        const { data: allData, error: allError } = await supabase.rpc('startup_pool_entities', {
          p_mine_user: mineUserId ?? null,
          p_limit: 1,
          p_offset: 0,
        })
        if (allError) throw allError
        const allRaw = (allData ?? []) as { total_count?: number | string }[]
        totalAll = Number(allRaw[0]?.total_count ?? total)
      }

      return { rows: raw.map((r) => r.row_json), total, totalAll }
    },
  })
}

/** 스타트업 담당자 행(startup_managers + user 임베드). */
export interface StartupManagerRow {
  user_id: string
  is_lead: boolean
  /** 배정 시점·배정한 사람 — 상세의 담당자 표가 읽는다(승격 RPC가 채운다). */
  assigned_at: string | null
  user: {
    id: string
    name: string | null
    email: string | null
    department_id: string | null
  } | null
  assigner: { name: string | null } | null
}

/** 특정 스타트업의 담당자 목록(리드 우선). id 미지정 시 비활성. */
export function useStartupManagers(startupId: string | undefined) {
  return useQuery({
    queryKey: ['startups', 'managers', startupId],
    enabled: Boolean(startupId),
    queryFn: async (): Promise<StartupManagerRow[]> => {
      const { data, error } = await supabase
        .from('startup_managers')
        .select(
          'user_id, is_lead, assigned_at, ' +
            'user:users!startup_managers_user_id_fkey(id, name, email, department_id), ' +
            'assigner:users!startup_managers_assigned_by_fkey(name)',
        )
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
