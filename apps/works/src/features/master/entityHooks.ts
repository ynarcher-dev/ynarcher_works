import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 원장 이름을 인자로 받는 공용 단건 훅.
 *
 * 종전에는 이 훅들이 `features/networks/hooks.ts`에 있었고 NETWORKS 원장 9종과 STARTUP이
 * 함께 썼다. 2026-09-04에 NETWORKS가 원장 하나로 합쳐지면서 그쪽은 테이블 인자가 필요
 * 없어졌고(전용 훅이 `networks` 하나를 본다), 남은 소비자는 STARTUP이다. 그 화면이
 * NETWORKS 폴더의 훅을 계속 import하면 코드를 읽는 사람이 "스타트업이 네트워크 원장을
 * 쓰는가"를 되묻게 되므로 공용 자리로 옮긴다.
 *
 * 쓰기 권한은 각 원장 RLS가 판정하고, 사유가 필요한 수정·비활성화는 트랜잭션 컨텍스트에
 * 사유를 실어 주는 RPC(update_entity/deactivate_entity)를 경유한다.
 */
export type EntityRow = Record<string, unknown> & {
  id: string
  name: string
  is_provisional?: boolean
  merged_into_id?: string | null
  /**
   * 생성자(created_by → users) FK 임베드. 목록·상세의 생성자 표시 원천.
   * 담당자(관리 주체)는 별개 축 — 투자기업은 startup_managers 지정 담당자, 그 외는 공동관리.
   */
  creator?: { id: string; name: string | null } | null
}

/** 단건 조회(상세페이지). id 미지정 시 비활성. */
export function useEntity(table: string, id: string | undefined) {
  return useQuery({
    queryKey: [table, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<EntityRow | null> => {
      const { data, error } = await supabase
        .from(table)
        .select('*, creator:users!created_by(id, name)')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as EntityRow) ?? null
    },
  })
}

/** 동일 이름 중복 존재 여부(등록 전 검사). */
export async function checkDuplicateName(table: string, name: string): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

/** 등록(생성된 id 반환). */
export function useCreateEntity(table: string) {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

/**
 * 수정(사유 필수). 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남고 트리거는 사유를
 * 알 수 없으므로, 사유를 트랜잭션 컨텍스트에 실어 주는 update_entity RPC를 경유한다.
 */
export function useUpdateEntity(table: string) {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

/**
 * 사유를 남기는 비활성화(소프트 삭제). 원장 UPDATE와 사유 기록이 한 트랜잭션에 묶이므로,
 * '비활성화 기록만 남고 행은 살아 있는' 어긋난 상태가 생기지 않는다.
 */
export function useDeactivateEntity(table: string) {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  })
}

/** 기여 이력 1건(변동 이력 타임라인·공동 관리자 목록의 원천). */
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

/**
 * 레코드 기여 이력(오래된 순). 기록(쓰기)은 클라이언트에 두지 않는다 —
 * 변동 이력은 원장 트리거 app.log_entity_contribution()이 같은 트랜잭션에서 남긴다.
 */
export function useContributions(table: string, id: string | undefined) {
  return useQuery({
    queryKey: [table, 'contributions', id],
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
