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
 * 물리삭제 금지 규약을 지켜 신규 테이블에 insert한 뒤 기존 레코드를 soft-delete한다.
 * insert 성공 후 soft-delete가 실패하면 방금 생성한 신규 레코드를 되돌린다(보상 삭제).
 * 이동으로 생성된 신규 레코드 id를 반환한다.
 */
export function useMoveEntity(from: EntityKey, to: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: Record<string, unknown>
    }): Promise<string> => {
      const { data, error } = await supabase
        .from(to)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      const newId = (data as { id: string }).id

      // 이동은 소스도 soft-delete한다. 파괴적 작업 가드를 통과하도록 이동자를 소스 기여자로
      // 먼저 기록한다(순수 비활성화와 달리 이동은 데이터를 옮기는 것이라 허용).
      await recordContribution({
        table: from,
        id,
        action: 'edited',
        source: 'manual',
        note: '구분 변경 이관',
      })
      const { error: delError } = await supabase
        .from(from)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (delError) {
        // 원본 soft-delete 실패 시 신규 레코드를 되돌려 중복 노출을 막는다.
        await supabase.from(to).delete().eq('id', newId)
        throw delError
      }
      // 이관 = 대상 테이블에 신규 등록. 현재 유저를 기여자로 기록한다.
      await recordContribution({
        table: to,
        id: newId,
        action: 'created',
        source: 'manual',
        note: '미분류에서 이관',
      })
      return newId
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

      const { data, error } = await supabase
        .from(to)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      const newId = (data as { id: string }).id

      const { error: delError } = await supabase
        .from(from)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id)
      if (delError) {
        await supabase.from(to).delete().eq('id', newId)
        throw delError
      }
      return newId
    },
    onSuccess: (_newId, { to }) => {
      void qc.invalidateQueries({ queryKey: ['networks', from] })
      void qc.invalidateQueries({ queryKey: ['networks', to] })
    },
  })
}

/** 엔티티 수정. */
export function useUpdateEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: Record<string, unknown>
    }) => {
      const { error } = await supabase.from(table).update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', table] }),
  })
}

/** 중복 병합: duplicate → primary 로 병합(merged_into_id 지정). */
export function useMergeEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      primaryId,
      duplicateId,
    }: {
      primaryId: string
      duplicateId: string
    }) => {
      const { error } = await supabase
        .from(table)
        .update({ merged_into_id: primaryId })
        .eq('id', duplicateId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', table] }),
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

/**
 * 기여 1건 기록(user_id·user_name은 서버 트리거가 현재 유저로 스탬프).
 * 부수 기록이므로 실패해도 본 작업(등록/병합/업로드)을 막지 않는다(에러를 삼킨다).
 */
export async function recordContribution(input: {
  table: EntityKey
  id: string
  action: Contribution['action']
  source: Contribution['source']
  batchId?: string | null
  note?: string | null
}): Promise<void> {
  await supabase.from('entity_contributions').insert({
    entity_table: input.table,
    entity_id: input.id,
    action: input.action,
    source: input.source,
    batch_id: input.batchId ?? null,
    note: input.note ?? null,
  })
}

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
 * useMoveEntity와 동일 규약: 대상에 병합 완성값을 insert 후 원본 soft-delete(실패 시 보상 삭제).
 * 파괴적 가드 통과를 위해 원본에 기여를 먼저 기록한다. 신규 레코드 id 반환.
 */
export async function mergeReclassify(input: {
  from: EntityKey
  fromId: string
  to: EntityKey
  values: Record<string, unknown>
  batchId?: string | null
}): Promise<string> {
  const { data, error } = await supabase
    .from(input.to)
    .insert(input.values)
    .select('id')
    .single()
  if (error) throw error
  const newId = (data as { id: string }).id

  await recordContribution({
    table: input.from,
    id: input.fromId,
    action: 'edited',
    source: 'upload',
    batchId: input.batchId,
    note: '업로드 재분류',
  })
  const { error: delError } = await supabase
    .from(input.from)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.fromId)
  if (delError) {
    await supabase.from(input.to).delete().eq('id', newId)
    throw delError
  }
  await recordContribution({
    table: input.to,
    id: newId,
    action: 'merged',
    source: 'upload',
    batchId: input.batchId,
    note: '업로드 병합·재분류',
  })
  return newId
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
