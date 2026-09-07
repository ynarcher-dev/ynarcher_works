import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLedgerPage,
  sanitizeOrValue,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
import type { Contribution } from '@/features/networks/hooks'
import { MA_BUYER_TABLE, type MaBuyerRow } from '@/features/mna/buyers/config'
import { supabase } from '@/lib/supabase'

/** 목록·상세가 함께 읽는 select 문자열. 작성자는 이름만 임베드한다. */
const SELECT =
  'id, name, industries, wish, available_funds, contact_name, contact_email, startup_id, created_at, updated_at, created_by, creator:users!created_by(id, name), startup:startups!startup_id(id, name)'

/**
 * 목록 한 페이지.
 *
 * 정렬은 최신 수정순이다 — 이 원장은 이름으로 찾는 것이 아니라 "요즘 무엇이 움직였나"로 읽는다
 * (가용자금 순으로 세우고 싶은 날이 오면 그때 정렬 축을 연다).
 * 검색은 기업명과 희망사항 두 컬럼에 OR로 걸리며, 둘 다 trigram 인덱스를 갖는다 —
 * 한 컬럼이라도 인덱스가 없으면 플래너가 BitmapOr를 포기하고 순차 스캔으로 되돌아간다.
 */
export function useMaBuyerListPage(keyword: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['ma-buyers', 'list', keyword, page, pageSize],
    queryFn: async (): Promise<LedgerPage<MaBuyerRow>> => {
      const narrow: LedgerCondition[] = []
      const kw = sanitizeOrValue(keyword)
      if (kw) narrow.push({ kind: 'or', expr: `name.ilike.%${kw}%,wish.ilike.%${kw}%` })

      return fetchLedgerPage<MaBuyerRow>({
        table: MA_BUYER_TABLE,
        select: SELECT,
        liveColumns: ['deleted_at'],
        order: { column: 'updated_at', ascending: false },
        page,
        pageSize,
        narrow,
      })
    },
  })
}

/** 상세 한 건. 본문(overview_html)은 목록이 읽지 않으므로 여기서만 가져온다. */
export function useMaBuyerRecord(id: string | undefined) {
  return useQuery({
    queryKey: ['ma-buyers', 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<MaBuyerRow | null> => {
      const { data, error } = await supabase
        .from(MA_BUYER_TABLE)
        .select(`${SELECT}, overview_html`)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as MaBuyerRow | null) ?? null
    },
  })
}

/**
 * 등록.
 *
 * 변동 이력 'created'는 화면이 아니라 원장 트리거가 같은 트랜잭션에서 남긴다
 * (20260907130000) — 손으로 남기던 시절에는 임포터·일괄 이관이 이력에서 통째로 빠졌다.
 */
export function useCreateMaBuyer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(MA_BUYER_TABLE)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ma-buyers'] }),
  })
}

/**
 * 수정(사유 필수).
 *
 * 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남고 트리거는 사유를 알 수 없으므로,
 * 사유를 트랜잭션 컨텍스트(app.contribution_ctx)에 실어 주는 update_entity RPC를 경유한다.
 * 그 RPC는 SECURITY INVOKER라 쓰기 권한은 이 원장의 RLS가 그대로 판정한다.
 */
export function useUpdateMaBuyer() {
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
        p_table: MA_BUYER_TABLE,
        p_id: id,
        p_values: values,
        p_note: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['ma-buyers'] })
      void qc.invalidateQueries({ queryKey: ['ma-buyers', 'contributions', id] })
    },
  })
}

/**
 * 사유를 남기는 삭제(소프트). 원장 UPDATE와 사유 기록이 한 트랜잭션에 묶이므로,
 * '삭제 기록만 남고 행은 살아 있는' 어긋난 상태가 생기지 않는다.
 */
export function useDeleteMaBuyer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('deactivate_entity', {
        p_entity_key: MA_BUYER_TABLE,
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: (_v, { id }) => {
      void qc.invalidateQueries({ queryKey: ['ma-buyers'] })
      void qc.invalidateQueries({ queryKey: ['ma-buyers', 'contributions', id] })
    },
  })
}

/**
 * 변동 이력. 기록(쓰기)은 클라이언트에 두지 않는다 — 원장 트리거가 남긴다.
 * 최초 기여순(오래된 순)으로 가져온다: `uniqueContributors`가 그 순서를 전제한다.
 */
export function useMaBuyerContributions(id: string | undefined) {
  return useQuery({
    queryKey: ['ma-buyers', 'contributions', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', MA_BUYER_TABLE)
        .eq('entity_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}
