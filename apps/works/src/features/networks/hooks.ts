import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ENTITIES, normalizeEntityRowCategory, type EntityKey } from '@/features/networks/config'

export type EntityRow = Record<string, unknown> & {
  id: string
  name: string
  is_provisional?: boolean
  merged_into_id?: string | null
  /**
   * 작성자(등록자, created_by → users) FK 임베드. 목록·상세의 작성자 표시 원천.
   * 담당자(관리 주체)는 별개 축 — 투자기업은 startup_managers 지정 담당자, 그 외는 공동관리(특정 담당자 없음).
   */
  creator?: { id: string; name: string | null } | null
}

/** 엔티티 목록(검색/미삭제/미병합). */
export function useEntityList(table: EntityKey, keyword: string) {
  return useQuery({
    queryKey: ['networks', table, keyword],
    queryFn: async (): Promise<EntityRow[]> => {
      let q = supabase
        .from(table)
        .select('*, creator:users!created_by(id, name)')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .limit(200)
      if (keyword.trim()) q = q.ilike('name', `%${keyword.trim()}%`)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as EntityRow[]).map((row) => normalizeEntityRowCategory(row, table))
    },
  })
}

/** 엔티티 목록 페이지(0-base page). 서버 사이드 페이지네이션 결과와 건수 정보. */
export interface EntityPage {
  rows: EntityRow[]
  /** 현재 검색어(필터)에 반영된 건수. 페이지 수·No. 넘버링의 기준. */
  total: number
  /** 필터 미적용(미삭제/미병합) 전체 건수. 검색어가 없으면 total과 같다. */
  totalAll: number
}

/**
 * 엔티티 목록의 서버 사이드 페이지네이션(검색/미삭제/미병합).
 * `.range()`로 페이지 구간만 조회하고 `count: 'exact'`로 필터 반영 건수를 함께 받는다.
 * 검색어가 있으면 필터 미적용 전체 건수(totalAll)를 head 카운트로 추가 조회한다(행 미전송).
 * page는 0-base. 페이지 전환 시 이전 페이지를 유지(keepPreviousData)해 깜빡임을 줄인다.
 */
export function useEntityPage(
  table: EntityKey,
  keyword: string,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ['networks', table, 'page', keyword, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EntityPage> => {
      const from = page * pageSize
      const to = from + pageSize - 1
      let q = supabase
        .from(table)
        .select('*, creator:users!created_by(id, name)', { count: 'exact' })
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .range(from, to)
      const trimmed = keyword.trim()
      if (trimmed) q = q.ilike('name', `%${trimmed}%`)
      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      // 검색어가 없으면 필터 반영 건수 == 전체 건수. 있을 때만 전체 건수를 별도 조회한다.
      let totalAll = total
      if (trimmed) {
        const { count: allCount } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('merged_into_id', null)
        totalAll = allCount ?? total
      }

      return {
        rows: ((data ?? []) as EntityRow[]).map((row) => normalizeEntityRowCategory(row, table)),
        total,
        totalAll,
      }
    },
  })
}

// ── 내 네트워크(10종 통합 목록) ───────────────────────────────────────────────

/**
 * 기여 이력 기준 통합 목록의 행(RPC `my_network_entities` 반환 컬럼).
 * 공용 리스트뷰(`MasterListView`)가 그대로 렌더할 수 있도록 `MasterRow` 호환 형태를 유지한다
 * (부서·직책·구분은 다른 네트워크와 동일하게 `profile` jsonb의 점 경로에서 읽힌다).
 */
export type MyNetworkRow = Record<string, unknown> & {
  /** 원장 테이블명(= EntityKey). 상세 라우트의 기준(10종 혼재 목록이라 행마다 다르다). */
  entity_table: EntityKey
  id: string
  name: string
  affiliation: string | null
  email: string | null
  phone: string | null
  /** 부서/직책/구분 등 공용 프로필 jsonb(다른 네트워크 목록과 동일 스키마). */
  profile: Record<string, unknown> | null
  expertise: unknown
  created_by: string | null
  /** 등록자(created_by → users.name). 공용 리스트뷰가 `creator.name`으로 읽는다. */
  creator: { name: string | null } | null
  updated_at: string | null
  /** 가장 최근 기여 행위(created/merged/enriched/edited). */
  last_action: string | null
  last_contributed_at: string | null
}

/** 내 네트워크 목록 페이지. `useEntityPage`와 동일 규약(rows + 건수). */
export interface MyNetworkPage {
  rows: MyNetworkRow[]
  total: number
}

/**
 * 내가 등록·편집·병합에 관여한 네트워크 10종 통합 목록(서버 사이드 페이지네이션).
 * 다형 조인·중복 제거가 필요해 PostgREST 대신 RPC(`my_network_entities`)로 조회한다.
 * 호출자 판정은 RPC 내부에서 하므로 user_id를 인자로 넘기지 않는다.
 * 총 건수는 모든 행에 동일하게 실려오는 윈도우 카운트(`total_count`)에서 읽는다(행 0건이면 0).
 * page는 0-base이며, 페이지 전환 시 이전 페이지를 유지(keepPreviousData)해 깜빡임을 줄인다.
 */
export function useMyNetworkPage(keyword: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['networks', 'mine', 'page', keyword, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MyNetworkPage> => {
      const trimmed = keyword.trim()
      const { data, error } = await supabase.rpc('my_network_entities', {
        p_keyword: trimmed || null,
        p_limit: pageSize,
        p_offset: page * pageSize,
      })
      if (error) throw error
      // RPC 원본 행: 등록자가 평면 컬럼(creator_name), 총 건수가 행마다 실린 윈도우 카운트.
      const rows = (data ?? []) as (Record<string, unknown> & {
        creator_name?: string | null
        total_count?: number | string
      })[]
      return {
        // RPC는 등록자를 평면 컬럼(creator_name)으로 돌려주므로 다른 네트워크 목록과 동일한
        // 중첩 형태(creator.name)로 정규화한다(공용 리스트뷰의 작성자 컬럼 규약).
        rows: rows.map(
          ({ total_count: _total, creator_name, ...row }) =>
            ({
              ...row,
              creator: creator_name ? { name: creator_name } : null,
            }) as MyNetworkRow,
        ),
        total: Number(rows[0]?.total_count ?? 0),
      }
    },
  })
}

/** 엔티티 단건 조회(상세페이지). id 미지정 시 비활성. */
export function useEntity(table: EntityKey, id: string | undefined) {
  return useQuery({
    queryKey: ['networks', table, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<EntityRow | null> => {
      const { data, error } = await supabase
        .from(table)
        .select('*, creator:users!created_by(id, name)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data ? normalizeEntityRowCategory(data as EntityRow, table) : null
    },
  })
}

/** 동일 이름 중복 존재 여부(등록 전 검사). */
export async function checkDuplicateName(
  table: EntityKey,
  name: string,
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

/** 엔티티 생성(생성된 id 반환). */
export function useCreateEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(table)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', table] }),
  })
}

/**
 * 엔티티 이동(구분 변경). `from` 테이블 레코드를 `to` 테이블로 옮긴다.
 * 대상 등록과 원본 비활성화를 reassign_entity RPC가 한 트랜잭션으로 처리하므로,
 * 종전처럼 '대상은 만들어졌는데 원본이 안 지워져서 방금 만든 행을 물리 삭제로 되돌리는'
 * 보상 로직이 필요 없다(물리 삭제 금지 규약에도 부합). 변동 이력은 원장 트리거가 남긴다.
 * 이동으로 생성된 신규 레코드 id를 반환한다.
 */
export function useMoveEntity(from: EntityKey, to: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      note,
    }: {
      id: string
      values: Record<string, unknown>
      note?: string
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('reassign_entity', {
        p_from: from,
        p_to: to,
        p_id: id,
        p_values: values,
        p_note_target: note ?? '구분 변경 이동',
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['networks', from] })
      void qc.invalidateQueries({ queryKey: ['networks', to] })
    },
  })
}

/**
 * 이관 시 대상 테이블로 복제할 공통(통일 스키마) 컬럼.
 * 8종 네트워크 테이블이 전부 공유하는 experts 동일 컬럼만 복제한다. 원본(others)에만 있는
 * 레거시 컬럼(category/representative/memo/contact 등)까지 복사하면 대상 테이블에 해당 컬럼이
 * 없어 insert가 실패하므로, 화이트리스트로 안전하게 좁힌다. (profile은 별도 병합.)
 */
const REASSIGN_COPY_KEYS = [
  'name',
  'email',
  'phone',
  'affiliation',
  'expertise',
  'is_provisional',
] as const

/**
 * 미분류(others) 임시 저장소에서 구분을 선택해 대상 네트워크로 이관한다.
 * 목록 인라인 드롭다운 전용. 대상 테이블마다 목적지가 달라 `useMoveEntity`(고정 to)와 달리
 * 이관 시점에 `to`를 받는다. `useMoveEntity`와 동일 규약으로 대상에 복제 insert 후
 * 원본을 soft-delete하며, soft-delete 실패 시 신규 레코드를 보상 삭제한다.
 */
export function useReassignCategory(from: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      row,
      to,
    }: {
      row: EntityRow
      to: EntityKey
    }): Promise<string> => {
      // 공통 컬럼만 복제하고, 구분(profile.category)을 대상 라벨로 갱신한다.
      const prevProfile = (row.profile as Record<string, unknown> | undefined) ?? {}
      const values: Record<string, unknown> = {
        profile: { ...prevProfile, category: ENTITIES[to].label },
      }
      for (const k of REASSIGN_COPY_KEYS) {
        if (row[k] !== undefined) values[k] = row[k]
      }

      // 종전에는 여기에 기여 기록이 아예 없어 미분류 일괄 이관이 이력에서 통째로 빠졌다.
      // 이제 RPC 한 트랜잭션이고 기록은 원장 트리거가 남긴다.
      const { data, error } = await supabase.rpc('reassign_entity', {
        p_from: from,
        p_to: to,
        p_id: row.id,
        p_values: values,
        p_note_target: '미분류에서 이관',
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_newId, { to }) => {
      void qc.invalidateQueries({ queryKey: ['networks', from] })
      void qc.invalidateQueries({ queryKey: ['networks', to] })
    },
  })
}

/**
 * 엔티티 수정(사유 필수). 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남고 트리거는
 * 사유를 알 수 없으므로, 사유를 트랜잭션 컨텍스트에 실어 주는 update_entity RPC를
 * 경유한다(20260721200000). 쓰기 권한은 원장 RLS가 그대로 판정한다.
 */
export function useUpdateEntity(table: EntityKey) {
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
        p_table: table,
        p_id: id,
        p_values: values,
        p_note: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['networks', table] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', table, id] })
    },
  })
}

/**
 * 사유를 남기는 비활성화(소프트 삭제)를 지원하는 원장 키.
 * 서버는 '기록 트리거가 실제로 붙어 있는가'를 카탈로그에서 확인해 거절하므로
 * (app.has_contribution_trigger), 이 타입은 그 집합의 클라이언트 측 표현이다.
 */
export type DeactivatableKey = EntityKey | 'global_networks'

/**
 * 사유를 남기는 비활성화. 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남으므로,
 * 사유를 트랜잭션 컨텍스트에 실어 주는 deactivate_entity RPC를 경유한다(20260721150000).
 * 원장 UPDATE와 사유 기록이 한 트랜잭션에 묶이므로, 종전처럼 '비활성화 기록만 남고 행은
 * 살아 있는' 어긋난 상태가 생기지 않는다. 쓰기 권한은 원장 RLS가 그대로 판정한다.
 */
export function useDeactivateEntity(table: DeactivatableKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('deactivate_entity', {
        p_entity_key: table,
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['networks', table] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', table, id] })
    },
  })
}

/**
 * 중복 병합: duplicate → primary 로 병합(merged_into_id 지정).
 * RPC가 양쪽에 이력을 남긴다 — 중복에는 '어디로 흡수됐는지', 정본에는 '무엇을 흡수했는지'.
 * 병합된 중복은 목록에서 사라져 이력을 열 수 없으므로 정본 쪽 기록이 실질적으로 읽히는 기록이다.
 */
export function useMergeEntity(table: EntityKey) {
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
        p_table: table,
        p_primary_id: primaryId,
        p_duplicate_id: duplicateId,
        p_note: note ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_v, { primaryId }) => {
      void qc.invalidateQueries({ queryKey: ['networks', table] })
      void qc.invalidateQueries({ queryKey: ['networks', 'contributions', table, primaryId] })
    },
  })
}

// ── 대용량 업로드 Phase 2: 기여 이력 / 업로드 배치 데이터 계층 ────────────────

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
export function useContributions(table: EntityKey, id: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'contributions', table, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', table)
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
// 사유·배치처럼 트리거가 알 수 없는 정보는 전용 RPC(deactivate_entity/reassign_entity/
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

/**
 * 합치기+재분류: 기존 매칭 레코드를 대상 구분 테이블로 이관한다(미분류→실구분 또는 명시적 override).
 * 수동 이관과 같은 reassign_entity RPC를 쓰되 업로드 컨텍스트(source·batch_id)를 실어 보낸다.
 * 신규 레코드 id 반환.
 */
export async function mergeReclassify(input: {
  from: EntityKey
  fromId: string
  to: EntityKey
  values: Record<string, unknown>
  batchId?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('reassign_entity', {
    p_from: input.from,
    p_to: input.to,
    p_id: input.fromId,
    p_values: input.values,
    p_source: 'upload',
    p_batch_id: input.batchId ?? null,
    p_target_action: 'merged',
    p_note_target: '업로드 병합·재분류',
    p_note_source: '업로드 재분류',
  })
  if (error) throw error
  return data as string
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
