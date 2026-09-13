import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 비활성 원장 콘솔이 다루는 원장 7종. 서버(admin_inactive_ledger_entities·restore_entities·
 * admin_ledger_console_capabilities)가 정확히 이 집합을 받는다 — 여기에 값을 늘리면
 * 서버가 `unsupported_entity`로 거절한다.
 */
export type InactiveLedgerKey =
  | 'startups'
  | 'networks'
  | 'programs'
  | 'ma_programs'
  | 'ma_buyers'
  | 'ma_sellers'
  | 'funds'

/** 일괄 비활성화 대상. 콘솔이 다루는 원장과 같은 집합이다. */
export type BulkDeactivateEntityKey = InactiveLedgerKey

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

export interface LedgerConsoleCapability {
  entity_key: InactiveLedgerKey
  can_list: boolean
  can_restore: boolean
  can_hard_delete: boolean
  unsupported_note: string | null
}

/**
 * 원장별로 무엇이 열려 있는지는 화면이 추측하지 않고 서버가 답한다.
 * 삭제 컨트롤의 노출 조건이 이 값이므로, 서버가 삭제를 닫으면 화면도 같은 순간에 닫힌다.
 */
export function useLedgerConsoleCapability(ledger: InactiveLedgerKey, enabled: boolean) {
  return useQuery({
    queryKey: ['inactive-ledger', ledger, 'capabilities'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LedgerConsoleCapability | null> => {
      const { data, error } = await supabase.rpc('admin_ledger_console_capabilities', {
        p_entity_key: ledger,
      })
      if (error) throw error
      return ((data ?? []) as LedgerConsoleCapability[])[0] ?? null
    },
  })
}

/**
 * ADMIN 버튼에 표시할 비활성 행 수.
 *
 * 원장 테이블을 직접 세지 않고 목록 RPC의 `total_count`를 한 행만 받아 읽는다 — 원장 일곱 중
 * `merged_into_id`가 없는 것이 있고(programs·ma_programs·funds), M&A 당사자 둘은 SELECT 정책이
 * 비활성 행을 가려 직접 조회로는 언제나 0이 된다. 건수와 목록이 같은 계약을 읽어야
 * "(3)인데 열면 비어 있다"가 생기지 않는다.
 */
export function useInactiveLedgerCount(ledger: InactiveLedgerKey, enabled: boolean) {
  return useQuery({
    queryKey: ['inactive-ledger', ledger, 'count'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('admin_inactive_ledger_entities', {
        p_entity_key: ledger,
        p_keyword: null,
        p_limit: 1,
        p_offset: 0,
      })
      if (error) throw error
      const rows = (data ?? []) as InactiveLedgerRow[]
      return Number(rows[0]?.total_count ?? 0)
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

/**
 * 원장별 **활성 목록** 캐시 키의 뿌리. 비활성/복구 어느 쪽으로 움직여도 이 키를 무효화해야
 * 방금 처리한 행이 업무 목록에서 사라지거나 되살아난다. 키의 모양은 각 원장의 조회 훅이
 * 소유하므로(`[config.key, 'programs', ...]` / `['ma-parties', table, ...]` 등) 여기서는
 * 그 앞머리만 적는다 — 앞머리가 어긋나면 무효화가 조용히 아무것도 하지 않는다.
 */
const ledgerInvalidateKey: Record<InactiveLedgerKey, readonly string[]> = {
  startups: ['startups'],
  networks: ['networks'],
  programs: ['project'],
  ma_programs: ['mna'],
  ma_buyers: ['ma-parties', 'ma_buyers'],
  ma_sellers: ['ma-parties', 'ma_sellers'],
  funds: ['fund'],
}

/** 활성 목록과 비활성 콘솔(목록·건수) 캐시를 한 번에 걷는다. 원장 일곱이 같은 처리를 쓴다. */
function invalidateLedger(qc: ReturnType<typeof useQueryClient>, ledger: InactiveLedgerKey) {
  void qc.invalidateQueries({ queryKey: ledgerInvalidateKey[ledger] })
  void qc.invalidateQueries({ queryKey: ['inactive-ledger', ledger] })
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
    onSuccess: () => invalidateLedger(qc, ledger),
  })
}

/** 선택한 활성 행을 모두 성공하거나 모두 롤백되는 한 번의 RPC로 비활성화한다. */
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
    onSuccess: () => invalidateLedger(qc, ledger),
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
    onSuccess: () => invalidateLedger(qc, ledger),
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
