import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  categoryLabel,
  NETWORK_TABLE,
  REGION_SCOPE_LABEL,
  type NetworkCategory,
  type RegionScope,
} from '@/features/networks/config'
import {
  categoryCodes,
  CLOSED_SEARCH_SCOPE,
  EMPTY_NETWORK_FILTERS,
  hasActiveNetworkFilters,
  regionScopeValues,
  wantsCountryUnset,
  wantsUncategorized,
  type NetworkFilterState,
  type NetworkSearchScope,
} from '@/features/networks/filters'

/** 레인지 입력(문자열)을 숫자로. 빈 칸·비수치는 '경계 없음'(null)이다. */
function rangeBound(v: string): number | null {
  const trimmed = v.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

/**
 * 통합 원장 행. 목록 RPC와 단건 조회가 같은 형태를 쓰도록 맞춘다.
 * `category_label`·`region_label`은 저장값이 아니라 표시용 파생값이다 — 목록 열이 읽는다.
 */
export type NetworkRow = Record<string, unknown> & {
  id: string
  name: string
  affiliation?: string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  category?: NetworkCategory | null
  region_scope?: RegionScope
  /** 국가가 속한 권역(조인 결과). 행에 저장되지 않는다. */
  region_tag_id?: string | null
  country_tag_id?: string | null
  /** 목록 RPC가 평면으로 실어 주는 태그명(단건 조회는 조인 임베드에서 꺼내 채운다). */
  region_name?: string | null
  country_name?: string | null
  /** 표시 파생값 — 열이 직접 읽는다(구분 라벨 / 국가명). */
  category_label?: string
  country_label?: string
  profile?: Record<string, unknown> | null
  expertise?: unknown
  is_provisional?: boolean
  merged_into_id?: string | null
  created_by?: string | null
  /**
   * 생성자(created_by → users) 임베드. 담당자(관리 주체)는 별개 축 —
   * NETWORKS는 담당자 원장이 없는 영구 공동관리다.
   */
  creator?: { id?: string; name: string | null } | null
  updated_at?: string | null
  /** 가장 최근 기여 행위(created/merged/enriched/edited). 전체 범위에서는 비어 있다. */
  last_action?: string | null
  last_contributed_at?: string | null
  /** 활동(참여 사업 수). 참여 이력이 없으면 0. */
  activity_count?: number
  /** 만족도(멘토 평가 평균). 근거 원장이 걷혀(20260903150000) 항상 null이라 '-'로 남는다. */
  satisfaction_avg?: number | null
}

/**
 * 국가 표시값 — 국가를 알면 국가명을 그대로 세운다(한국도 '한국'으로 명시).
 * 국가를 모르는 옛 행만 '국내'/'해외'로 물러선다 — 그 칸이 비어 있으면 "한국인가, 아직
 * 안 넣었는가"를 표가 답하지 못하므로, 최소한 어느 쪽인지는 말한다.
 */
export function countryLabelOf(row: {
  region_scope?: string | null
  country_name?: string | null
}): string {
  const country = row.country_name?.trim()
  if (country) return country
  return row.region_scope === 'OVERSEAS'
    ? REGION_SCOPE_LABEL.OVERSEAS
    : REGION_SCOPE_LABEL.DOMESTIC
}

/** RPC 평면 행 → 화면 행(생성자 중첩 복원 + 표시 파생값). */
function toRow(raw: Record<string, unknown>): NetworkRow {
  const { total_count: _total, creator_name, ...rest } = raw as Record<string, unknown> & {
    creator_name?: string | null
    total_count?: number | string
  }
  const row = rest as NetworkRow
  return {
    ...row,
    creator: creator_name ? { name: creator_name } : null,
    category_label: categoryLabel(row.category),
    country_label: countryLabelOf(row),
  }
}

// ── 목록 ──────────────────────────────────────────────────────────────────

/** 목록 페이지. 서버 사이드 페이지네이션 결과와 건수 정보. */
export interface NetworkPage {
  rows: NetworkRow[]
  /** 현재 검색어(필터)에 반영된 건수. 페이지 수·No. 넘버링의 기준. */
  total: number
  /** 필터 미적용(미삭제/미병합) 전체 건수. 검색어가 없으면 total과 같다. */
  totalAll: number
}

/**
 * 목록의 범위. 'mine'은 내가 등록·편집·병합에 관여한 것만, 'all'은 볼 수 있는 전부.
 * 두 목록은 열·필터·검색·상세 진입이 모두 같고 이 축 하나로만 갈린다.
 */
export type NetworkListScope = 'mine' | 'all'

/**
 * 범위별 RPC. 인자와 반환 열 규약은 같고 함수만 다르다 — 두 범위는 빠른 실행 계획이 서로
 * 달라(내 것은 기여 로그 조인 + 최근 기여순, 전체는 조인 없이 이름순) DB에서 나뉘어 있다.
 */
const SCOPE_RPC: Record<NetworkListScope, string> = {
  mine: 'my_network_entities',
  all: 'all_network_entities',
}

/**
 * 통합 목록(서버 사이드 페이지네이션).
 *
 * 조회를 PostgREST가 아니라 RPC로 내린다 — 활동은 AC 참여 원장에서 집계되는 파생값이라
 * 원장 테이블에 얹은 조건으로는 거를 수 없고, 클라이언트에서 거르면 지금 페이지에 실려 온
 * 30건 안에서만 걸러져 2페이지의 대상이 사라진 것처럼 보인다. '내 것' 범위 판정도 기여
 * 로그와의 조인이라 같은 이유로 서버 몫이다.
 *
 * 구분이 비어 있는 행(미지정)은 별도 인자가 아니라 구분 필터 축의 한 값이다 — 화면에서
 * '미지정'이 구분 선택지 옆에 서고, 서버가 그 둘을 OR로 합쳐 판정한다(20260904140000).
 * 종전에는 전용 메뉴가 있어 목록이 미지정을 통째로 빼고 셌으나, 메뉴를 접은 뒤로는 이
 * 목록이 원장 전부를 담는다 — 어느 화면에도 나타나지 않는 행이 있으면 안 된다.
 */
export function useNetworkListPage(
  scope: NetworkListScope,
  keyword: string,
  page: number,
  pageSize: number,
  filters: NetworkFilterState = EMPTY_NETWORK_FILTERS,
  searchScope: NetworkSearchScope = CLOSED_SEARCH_SCOPE,
) {
  // 필터 객체는 매 렌더 새로 만들어지므로 값으로 직렬화해 캐시 키를 안정시킨다.
  // 정책이 바뀌면 같은 검색어라도 결과가 달라지므로 검색 범위도 캐시 키에 넣는다.
  const filtersKey = JSON.stringify(filters)
  const scopeKey = JSON.stringify(searchScope)
  return useQuery({
    queryKey: ['networks', scope, 'page', keyword, filtersKey, scopeKey, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<NetworkPage> => {
      const trimmed = keyword.trim()
      // 구분 축은 코드와 '미지정'이 한 배열에 섞여 온다 — 서버 인자는 둘로 갈리므로 여기서 나눈다.
      const codes = categoryCodes(filters)
      const { data, error } = await supabase.rpc(SCOPE_RPC[scope], {
        p_keyword: trimmed || null,
        p_limit: pageSize,
        p_offset: page * pageSize,
        p_categories: codes.length ? codes : null,
        p_uncategorized: wantsUncategorized(filters) ? true : null,
        p_region_scope: regionScopeValues(filters).length ? regionScopeValues(filters) : null,
        p_regions: filters.regionIds.length ? filters.regionIds : null,
        p_countries: filters.countryIds.length ? filters.countryIds : null,
        p_country_unset: wantsCountryUnset(filters) ? true : null,
        p_search_email: searchScope.email,
        p_search_phone: searchScope.phone,
        p_expertise: filters.expertise.length ? filters.expertise : null,
        // 둘 다 고르면 거르지 않은 것과 같다(전체) — 조건을 붙이지 않는다.
        p_match: filters.match.length === 1 ? filters.match[0] : null,
        p_activity_min: rangeBound(filters.activityMin),
        p_activity_max: rangeBound(filters.activityMax),
      })
      if (error) throw error
      const raw = (data ?? []) as (Record<string, unknown> & { total_count?: number | string })[]
      const total = Number(raw[0]?.total_count ?? 0)

      // 검색어·필터가 모두 없으면 반영 건수 == 전체 건수. 하나라도 걸렸을 때만 별도 조회한다.
      let totalAll = total
      if (trimmed || hasActiveNetworkFilters(filters)) {
        // 전체 건수는 구분을 가리지 않는다 — 미지정도 이 목록의 행이므로 분모에 든다.
        const { count: allCount } = await supabase
          .from(NETWORK_TABLE)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('merged_into_id', null)
        totalAll = allCount ?? total
      }

      return { rows: raw.map(toRow), total, totalAll }
    },
  })
}

/**
 * 이름순 단순 목록(중복 병합 콘솔 등 페이지네이션이 필요 없는 자리).
 * 구분을 주면 그 구분만, 주지 않으면 전부.
 */
export function useNetworkList(keyword: string, category?: NetworkCategory) {
  return useQuery({
    queryKey: ['networks', 'list', category ?? 'all', keyword],
    queryFn: async (): Promise<NetworkRow[]> => {
      let q = supabase
        .from(NETWORK_TABLE)
        .select('*, creator:users!created_by(id, name)')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .limit(200)
      if (category) q = q.eq('category', category)
      if (keyword.trim()) q = q.ilike('name', `%${keyword.trim()}%`)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as NetworkRow[]).map((row) => ({
        ...row,
        category_label: categoryLabel(row.category),
      }))
    },
  })
}

// ── 단건 ──────────────────────────────────────────────────────────────────

/**
 * 단건 조회(상세페이지). id 미지정 시 비활성.
 * 국가는 태그명을 조인해 읽고, 권역은 원장이 아니라 그 국가를 거쳐 얻는다 —
 * 권역은 행에 저장되지 않으므로(20260904120000) networks에는 걸 FK가 없다.
 */
export function useNetworkRecord(id: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<NetworkRow | null> => {
      const { data, error } = await supabase
        .from(NETWORK_TABLE)
        .select(
          '*, creator:users!created_by(id, name), country:country_tags!country_tag_id(name, region:region_tags!region_tag_id(name))',
        )
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as NetworkRow & {
        country?: { name: string; region?: { name: string } | null } | null
      }
      return {
        ...row,
        region_name: row.country?.region?.name ?? null,
        country_name: row.country?.name ?? null,
        category_label: categoryLabel(row.category),
        country_label: countryLabelOf({
          region_scope: row.region_scope,
          country_name: row.country?.name ?? null,
        }),
      }
    },
  })
}

/** 동일 이름 중복 존재 여부(등록 전 검사). 원장이 하나라 검사도 한 번이다. */
export async function checkDuplicateName(name: string): Promise<boolean> {
  const { data } = await supabase
    .from(NETWORK_TABLE)
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

/** 등록(생성된 id 반환). */
export function useCreateNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(NETWORK_TABLE)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks'] }),
  })
}

/**
 * 수정(사유 필수). 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남고 트리거는 사유를
 * 알 수 없으므로, 사유를 트랜잭션 컨텍스트에 실어 주는 update_entity RPC를 경유한다
 * (20260721200000). 쓰기 권한은 원장 RLS가 그대로 판정한다.
 */
export function useUpdateNetwork() {
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
        p_table: NETWORK_TABLE,
        p_id: id,
        p_values: values,
        p_note: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['networks'] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', id] })
    },
  })
}

/**
 * 사유를 남기는 비활성화. 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남으므로,
 * 사유를 트랜잭션 컨텍스트에 실어 주는 deactivate_entity RPC를 경유한다(20260721150000).
 * 원장 UPDATE와 사유 기록이 한 트랜잭션에 묶이므로, 종전처럼 '비활성화 기록만 남고 행은
 * 살아 있는' 어긋난 상태가 생기지 않는다.
 */
export function useDeactivateNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('deactivate_entity', {
        p_entity_key: NETWORK_TABLE,
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['networks'] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', id] })
    },
  })
}

/**
 * 중복 병합: duplicate → primary 로 병합(merged_into_id 지정).
 * RPC가 양쪽에 이력을 남긴다 — 중복에는 '어디로 흡수됐는지', 정본에는 '무엇을 흡수했는지'.
 * 병합된 중복은 목록에서 사라져 이력을 열 수 없으므로 정본 쪽 기록이 실질적으로 읽히는 기록이다.
 */
export function useMergeNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      primaryId,
      duplicateId,
      note,
    }: {
      primaryId: string
      duplicateId: string
      note?: string
    }) => {
      const { error } = await supabase.rpc('merge_entity', {
        p_table: NETWORK_TABLE,
        p_primary_id: primaryId,
        p_duplicate_id: duplicateId,
        p_note: note ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_v, { primaryId }) => {
      void qc.invalidateQueries({ queryKey: ['networks'] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', primaryId] })
    },
  })
}

// ── 기여 이력 / 업로드 배치 ────────────────────────────────────────────────

export interface Contribution {
  id: string
  entity_table: string
  entity_id: string
  user_id: string | null
  user_name: string | null
  action: 'created' | 'merged' | 'enriched' | 'edited' | 'deactivated'
  source: 'manual' | 'upload'
  batch_id: string | null
  note: string | null
  created_at: string
}

/** 레코드 기여 이력(연혁, 오래된 순). 공동 관리자 목록·타임라인의 원천. */
export function useContributions(id: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'contributions', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', NETWORK_TABLE)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}

// 기록(쓰기)은 클라이언트에 두지 않는다 — 변동 이력은 원장 트리거
// app.log_entity_contribution()이 같은 트랜잭션에서 남긴다(20260721150000·160000).
// 손으로 남기던 시절에는 수정·미분류 일괄 이관·임포터가 이력에서 통째로 빠졌고,
// 구분 변경은 두 곳이 각각 기록해 'created'가 두 줄이 됐다.
// 사유·배치처럼 트리거가 알 수 없는 정보는 전용 RPC(deactivate_entity/update_entity/
// merge_entity/upload_*)가 트랜잭션 컨텍스트로 실어 보낸다.

/** 업로드 배치 이력 생성(uploaded_by는 서버 트리거 스탬프). 배치 id 반환(실패 시 null). */
export async function createUploadBatch(input: {
  filename: string
  contentHash: string
  total: number
  inserted: number
  merged: number
  skipped: number
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('upload_batches')
    .insert({
      filename: input.filename,
      content_hash: input.contentHash,
      total_rows: input.total,
      inserted_count: input.inserted,
      merged_count: input.merged,
      skipped_count: input.skipped,
    })
    .select('id')
    .single()
  if (error) return null
  return (data as { id: string }).id
}

/** 동일 콘텐츠 해시의 이전 업로드 이력(동일 파일 재업로드 경고용). */
export async function findPriorBatchByHash(
  contentHash: string,
): Promise<{ filename: string | null; created_at: string } | null> {
  const { data } = await supabase
    .from('upload_batches')
    .select('filename, created_at')
    .eq('content_hash', contentHash)
    .order('created_at', { ascending: false })
    .limit(1)
  return (data?.[0] as { filename: string | null; created_at: string }) ?? null
}
