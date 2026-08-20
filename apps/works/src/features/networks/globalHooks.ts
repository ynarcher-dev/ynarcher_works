import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { GLOBAL_TABLE, type GlobalRow } from '@/features/networks/globalConfig'
import {
  CLOSED_SEARCH_SCOPE,
  EMPTY_GLOBAL_FILTERS,
  hasActiveGlobalFilters,
  type GlobalFilterState,
  type NetworkSearchScope,
} from '@/features/networks/filters'
import type { Contribution } from '@/features/networks/hooks'

/**
 * 목록/상세 조회 시 권역·국가명과 생성자(created_by → users)를 함께 임베드한다.
 * 국내 8종(useEntityPage)과 동일하게 creator를 실어 "생성자" 컬럼/항목이 비지 않게 한다.
 */
const SELECT_WITH_TAGS =
  '*, region:region_tags(name), country:country_tags(name), creator:users!created_by(id, name)'

/** 글로벌 네트워크 목록 페이지(0-base). 국내 useEntityPage와 동일 규약 + 태그 조인. */
export interface GlobalPage {
  rows: GlobalRow[]
  total: number
  totalAll: number
}

/**
 * 글로벌 목록의 범위. 'mine'은 내가 생성했거나 기여한 것만, 'all'은 볼 수 있는 전부.
 * 국내 통합 목록(NetworkListScope)과 같은 축이며 판정 기준도 같다.
 */
export type GlobalListScope = 'mine' | 'all'

/**
 * 글로벌 네트워크 서버 사이드 페이지네이션(범위/검색/필터/미삭제/미병합).
 *
 * 조회를 PostgREST가 아니라 RPC(`global_network_entities`)로 내린다 — '내 것' 판정이
 * 기여 로그(entity_contributions)와의 조인이라 다형 키를 FK로 삼는 PostgREST 임베드로는
 * 표현되지 않고, id를 먼저 긁어 와 `in()`으로 걸면 그 id 목록의 상한이 곧 목록의 상한이 된다.
 *
 * 검색은 이름·소속에 항상 닿고, 이메일·연락처는 목록 마스킹 정책이 공개로 연 경우에만 닿는다
 * (`searchScope`) — 가려진 값을 검색으로 되짚을 수 있으면 마스킹이 무력해진다.
 * RPC는 권역·국가·생성자를 평면 컬럼으로 돌려주므로 다른 목록과 같은 중첩 형태
 * (region.name / country.name / creator.name)로 되담는다. page는 0-base.
 */
export function useGlobalPage(
  scope: GlobalListScope,
  keyword: string,
  page: number,
  pageSize: number,
  filters: GlobalFilterState = EMPTY_GLOBAL_FILTERS,
  searchScope: NetworkSearchScope = CLOSED_SEARCH_SCOPE,
) {
  // 필터 객체는 매 렌더 새로 만들어지므로 값으로 직렬화해 캐시 키를 안정시킨다.
  // 정책이 바뀌면 같은 검색어라도 결과가 달라지므로 검색 범위도 캐시 키에 넣는다.
  const filtersKey = JSON.stringify(filters)
  const scopeKey = JSON.stringify(searchScope)
  return useQuery({
    queryKey: [
      'networks',
      GLOBAL_TABLE,
      'page',
      scope,
      keyword,
      filtersKey,
      scopeKey,
      page,
      pageSize,
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GlobalPage> => {
      const trimmed = keyword.trim()
      const { data, error } = await supabase.rpc('global_network_entities', {
        p_keyword: trimmed || null,
        p_mine: scope === 'mine',
        // 권역·국가는 태그 FK로, 구분은 스칼라 값으로 거른다(모두 목록에 노출된 열이다).
        p_regions: filters.regionIds.length ? filters.regionIds : null,
        p_countries: filters.countryIds.length ? filters.countryIds : null,
        p_categories: filters.categories.length ? filters.categories : null,
        p_search_email: searchScope.email,
        p_search_phone: searchScope.phone,
        p_limit: pageSize,
        p_offset: page * pageSize,
      })
      if (error) throw error
      const raw = (data ?? []) as (Record<string, unknown> & {
        region_name?: string | null
        country_name?: string | null
        creator_name?: string | null
        total_count?: number | string
        total_all?: number | string
      })[]
      const total = Number(raw[0]?.total_count ?? 0)
      // 검색·필터가 하나도 없으면 반영 건수가 곧 범위 전체 건수다(RPC도 같은 값을 싣는다).
      const totalAll =
        trimmed || hasActiveGlobalFilters(filters) ? Number(raw[0]?.total_all ?? total) : total

      return {
        rows: raw.map(
          ({
            region_name,
            country_name,
            creator_name,
            total_count: _total,
            total_all: _totalAll,
            ...row
          }) =>
            ({
              ...row,
              region: region_name ? { name: region_name } : null,
              country: country_name ? { name: country_name } : null,
              creator: creator_name ? { name: creator_name } : null,
            }) as unknown as GlobalRow,
        ),
        total,
        totalAll,
      }
    },
  })
}

/** 글로벌 네트워크 단건 조회(수정 폼). id 미지정 시 비활성. */
export function useGlobalEntity(id: string | undefined) {
  return useQuery({
    queryKey: ['networks', GLOBAL_TABLE, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<GlobalRow | null> => {
      const { data, error } = await supabase
        .from(GLOBAL_TABLE)
        .select(SELECT_WITH_TAGS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as GlobalRow | null
    },
  })
}

/** 글로벌 네트워크 레코드의 기여 이력(연혁, 오래된 순). 공동 관리자·타임라인 표시용. */
export function useGlobalContributions(id: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'contributions', GLOBAL_TABLE, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', GLOBAL_TABLE)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}

/** 동일 이름 중복 존재 여부(등록 전 검사). */
export async function checkGlobalDuplicateName(name: string): Promise<boolean> {
  const { data } = await supabase
    .from(GLOBAL_TABLE)
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

/** 글로벌 네트워크 생성(생성 id 반환). 생성자는 기여 로그로 함께 기록한다. */
export function useCreateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(GLOBAL_TABLE)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      // 변동 이력 'created'는 원장 트리거가 같은 트랜잭션에서 남긴다(20260721150000).
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] }),
  })
}

/**
 * 글로벌 네트워크 수정(사유 필수). 사유를 트랜잭션 컨텍스트에 실어 주는 update_entity RPC를
 * 경유한다(20260721200000) — 국내 8종의 useUpdateEntity와 같은 규약이다.
 */
export function useUpdateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      reason,
    }: {
      id: string
      values: Record<string, unknown>
      reason: string
    }) => {
      const { error } = await supabase.rpc('update_entity', {
        p_table: GLOBAL_TABLE,
        p_id: id,
        p_values: values,
        p_note: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] })
      // 수정도 이제 트리거가 'edited'로 남긴다(종전에는 아무 기록도 남지 않았다).
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', GLOBAL_TABLE, id] })
    },
  })
}

/**
 * 비활성화(soft delete). 사유는 원장에 컬럼이 없어 기여 로그의 note로만 남으므로,
 * 사유를 트랜잭션 컨텍스트에 실어 주는 deactivate_entity RPC를 경유한다.
 * 원장 쓰기 권한은 RPC가 아니라 global_networks의 RLS가 그대로 판정한다(SECURITY INVOKER).
 */
export function useDeactivateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('deactivate_entity', {
        p_entity_key: GLOBAL_TABLE,
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['networks', GLOBAL_TABLE] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', GLOBAL_TABLE, id] })
    },
  })
}

// 기록(쓰기)은 클라이언트에 두지 않는다 — global_networks의 변동 이력은 원장 트리거
// app.log_entity_contribution()이 같은 트랜잭션에서 남긴다(마이그레이션 20260721150000).
// 손으로 남기던 시절에는 useUpdateGlobal에 호출이 없어 글로벌 수정이 통째로 이력에서 빠져 있었다.
