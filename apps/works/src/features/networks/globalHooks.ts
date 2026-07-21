import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { GLOBAL_TABLE, type GlobalRow } from '@/features/networks/globalConfig'
import type { Contribution } from '@/features/networks/hooks'

/**
 * 목록/상세 조회 시 권역·국가명과 등록자(created_by → users)를 함께 임베드한다.
 * 국내 8종(useEntityPage)과 동일하게 creator를 실어 "등록자" 컬럼/항목이 비지 않게 한다.
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
 * 글로벌 네트워크 서버 사이드 페이지네이션(검색/미삭제/미병합).
 * 이름 검색은 ilike, 권역·국가명은 조인 임베드로 함께 조회한다. page는 0-base.
 */
export function useGlobalPage(keyword: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['networks', GLOBAL_TABLE, 'page', keyword, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GlobalPage> => {
      const from = page * pageSize
      const to = from + pageSize - 1
      let q = supabase
        .from(GLOBAL_TABLE)
        .select(SELECT_WITH_TAGS, { count: 'exact' })
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .range(from, to)
      const trimmed = keyword.trim()
      if (trimmed) q = q.ilike('name', `%${trimmed}%`)
      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      let totalAll = total
      if (trimmed) {
        const { count: allCount } = await supabase
          .from(GLOBAL_TABLE)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('merged_into_id', null)
        totalAll = allCount ?? total
      }
      return { rows: (data ?? []) as unknown as GlobalRow[], total, totalAll }
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

/** 글로벌 네트워크 수정. */
export function useUpdateGlobal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from(GLOBAL_TABLE).update(values).eq('id', id)
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
