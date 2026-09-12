import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type InactiveLedgerKey = 'startups' | 'networks'
export type BulkDeactivateEntityKey =
  | InactiveLedgerKey
  | 'programs'
  | 'ma_programs'
  | 'ma_buyers'
  | 'ma_sellers'
  | 'funds'

export interface InactiveLedgerRow {
  entity_id: string
  entity_name: string
  category: string | null
  detail: string | null
  deleted_at: string
  deactivated_by: string | null
  deactivation_reason: string | null
  total_count: number | string
}

export interface InactiveLedgerPage {
  rows: InactiveLedgerRow[]
  total: number
}

export interface EntityDeleteBlocker {
  blocker_key: string
  blocker_label: string
  row_count: number | string
}

/** ADMIN 버튼에 표시할 비활성·미병합 행 수. 모달을 열기 전에는 목록 본문을 가져오지 않는다. */
export function useInactiveLedgerCount(ledger: InactiveLedgerKey, enabled: boolean) {
  return useQuery({
    queryKey: ['inactive-ledger', ledger, 'count'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from(ledger)
        .select('*', { count: 'exact', head: true })
        .not('deleted_at', 'is', null)
        .is('merged_into_id', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** ADMIN 전용 비활성 원장 목록. 행과 처리 이력은 서버 RPC가 같은 페이지 계약으로 접어 준다. */
export function useInactiveLedgerPage(
  ledger: InactiveLedgerKey,
  keyword: string,
  page: number,
  pageSize: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['inactive-ledger', ledger, 'page', keyword, page, pageSize],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<InactiveLedgerPage> => {
      const { data, error } = await supabase.rpc('admin_inactive_ledger_entities', {
        p_entity_key: ledger,
        p_keyword: keyword.trim() || null,
        p_limit: pageSize,
        p_offset: page * pageSize,
      })
      if (error) throw error
      const rows = (data ?? []) as InactiveLedgerRow[]
      return { rows, total: Number(rows[0]?.total_count ?? 0) }
    },
  })
}

/** ADMIN 선택 행 복구. 단건과 같은 검증을 쓰며 어느 하나라도 실패하면 전체 롤백한다. */
export function useRestoreEntities(ledger: InactiveLedgerKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const { data, error } = await supabase.rpc('restore_entities', {
        p_entity_key: ledger,
        p_ids: ids,
        p_reason: reason,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ledger] })
      void qc.invalidateQueries({ queryKey: ['inactive-ledger', ledger] })
    },
  })
}

/** 선택한 활성 행을 모두 성공하거나 모두 롤백되는 한 번의 RPC로 비활성화한다. */
const bulkInvalidateKey: Record<BulkDeactivateEntityKey, readonly string[]> = {
  startups: ['startups'],
  networks: ['networks'],
  programs: ['project'],
  ma_programs: ['mna'],
  ma_buyers: ['ma-parties', 'ma_buyers'],
  ma_sellers: ['ma-parties', 'ma_sellers'],
  funds: ['fund'],
}

export function useBulkDeactivateEntities(ledger: BulkDeactivateEntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const { data, error } = await supabase.rpc('deactivate_entities', {
        p_entity_key: ledger,
        p_ids: ids,
        p_reason: reason,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: bulkInvalidateKey[ledger] })
      if (ledger === 'startups' || ledger === 'networks') {
        void qc.invalidateQueries({ queryKey: ['inactive-ledger', ledger] })
      }
    },
  })
}

/** 영구 삭제 확인창에서 먼저 보여 줄 연결 데이터. 서버가 삭제 직전 같은 값을 다시 검사한다. */
export function useEntityDeleteBlockers(
  ledger: InactiveLedgerKey,
  ids: string[],
) {
  return useQuery({
    queryKey: ['inactive-ledger', ledger, 'delete-blockers', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<EntityDeleteBlocker[]> => {
      const { data, error } = await supabase.rpc('admin_entities_delete_blockers', {
        p_entity_key: ledger,
        p_ids: ids,
      })
      if (error) throw error
      return (data ?? []) as EntityDeleteBlocker[]
    },
  })
}

/** ADMIN 전용 물리 삭제. 성공하면 목록·건수 캐시에서 해당 행을 즉시 걷어낸다. */
export function useHardDeleteEntities(ledger: InactiveLedgerKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, reason, confirmText }: {
      ids: string[]
      reason: string
      confirmText: string
    }) => {
      const { data, error } = await supabase.rpc('admin_hard_delete_entities', {
        p_entity_key: ledger,
        p_ids: ids,
        p_reason: reason,
        p_confirm_text: confirmText,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ledger] })
      void qc.invalidateQueries({ queryKey: ['inactive-ledger', ledger] })
    },
  })
}

/** 서버의 의도된 복구 차단을 관리자에게 다음 행동이 보이는 문장으로 바꾼다. */
export function restoreErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (e?.code === '23505' || e?.message?.includes('active_duplicate_exists')) {
    return '같은 대상의 활성 데이터가 있습니다. 중복 병합 검증에서 먼저 확인하세요.'
  }
  if (e?.message?.includes('restore_required_fields_missing')) {
    return '복구에 필요한 필수 정보가 없습니다. 원장 데이터를 보완한 뒤 다시 시도하세요.'
  }
  if (e?.code === '42501') return '복구 권한이 없거나 이미 복구된 데이터입니다.'
  return '복구에 실패했습니다. 잠시 후 다시 시도하세요.'
}

export function hardDeleteErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (e?.code === '23001' || e?.message?.includes('dependent_records_exist')) {
    return '연결된 업무 데이터가 있어 영구 삭제할 수 없습니다.'
  }
  if (e?.code === '22023') return '확인 문구가 일치하지 않습니다.'
  if (e?.code === '42501') return '영구 삭제 권한이 없습니다.'
  return '영구 삭제에 실패했습니다. 잠시 후 다시 시도하세요.'
}
