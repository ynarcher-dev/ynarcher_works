import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLedgerPage,
  sanitizeOrValue,
  type LedgerCondition,
  type LedgerPage,
} from '@/features/master/ledgerPage'
import { MA_BUYER_TABLE, type MaBuyerRow } from '@/features/mna/buyers/config'
import { supabase } from '@/lib/supabase'

/** 목록·상세가 함께 읽는 select 문자열. 작성자는 이름만 임베드한다. */
const SELECT =
  'id, name, industries, wish, available_funds, created_at, updated_at, created_by, creator:users!created_by(id, name)'

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
 * 등록·수정·삭제.
 *
 * 공용 RPC(update_entity·deactivate_entity)를 쓰지 않는다 — 그 둘은 변동 이력 트리거가 붙은
 * 원장만 받는 허용 목록(app.has_contribution_trigger)이고, 이 원장은 그 트리거를 아직 달지
 * 않았다(근거는 마이그레이션 주석). 그래서 사유를 묻지 않고 곧장 원장에 쓴다.
 * 쓰기 자격은 어느 경로로 오든 RLS(can_write_workspace('mna'))가 판정한다.
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

export function useUpdateMaBuyer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from(MA_BUYER_TABLE).update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ma-buyers'] }),
  })
}

/** 소프트 삭제. 물리 삭제 금지 원칙에 따라 행은 남기고 deleted_at만 찍는다. */
export function useDeleteMaBuyer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(MA_BUYER_TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ma-buyers'] }),
  })
}
