/**
 * 자산 원장(public.assets) 서버 훅 — MANAGEMENT '자산 관리'가 소유한다.
 *
 * 조회는 지사 단위다(지사 탭이 곧 화면 구조). 지사 목록 자체는 지사 원장(branches)이 소유하고
 * 여기서는 참조만 하므로 이 파일에 지사 쓰기는 없다.
 *
 * RLS: 조회 app.can_read_workspace('management') / 쓰기 app.can_write_workspace('management')
 * (supabase/migrations/20260705210000_management_schema.sql의 워크스페이스 게이트).
 * 값 규칙(폐기일자↔상태, 금액 하한, 할당 대상 필수)은 DB check 제약이 최종 판정한다
 * (20260730100000_assets_ledger.sql) — 여기서 미리 걸러 주는 것은 안내를 위해서다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AssetAcquisition, AssetStatus } from '@/features/management/config'

export interface Asset {
  id: string
  name: string
  /** 품목(노트북·차량 등 자유입력). */
  itemType: string | null
  acquisitionType: AssetAcquisition
  status: AssetStatus
  branchId: string | null
  assignedTo: string | null
  acquiredOn: string | null
  disposedOn: string | null
  /** 취득가(원). 입력이 없으면 null이며 0과 구분한다. */
  amount: number | null
  isPortable: boolean
  returnDue: string | null
  note: string | null
  updatedAt: string | null
}

/** 등록·수정 공용 입력. 화면 폼이 그대로 넘긴다. */
export interface AssetInput {
  name: string
  itemType: string | null
  acquisitionType: AssetAcquisition
  status: AssetStatus
  branchId: string
  assignedTo: string | null
  acquiredOn: string | null
  disposedOn: string | null
  amount: number | null
  isPortable: boolean
  returnDue: string | null
  note: string | null
}

interface AssetRow {
  id: string
  name: string
  item_type: string | null
  acquisition_type: AssetAcquisition
  status: AssetStatus
  branch_id: string | null
  assigned_to: string | null
  acquired_on: string | null
  disposed_on: string | null
  amount: string | number | null
  is_portable: boolean
  return_due: string | null
  note: string | null
  updated_at: string | null
}

const COLUMNS =
  'id, name, item_type, acquisition_type, status, branch_id, assigned_to, acquired_on, disposed_on, amount, is_portable, return_due, note, updated_at'

const toAsset = (r: AssetRow): Asset => ({
  id: r.id,
  name: r.name,
  itemType: r.item_type,
  acquisitionType: r.acquisition_type,
  status: r.status,
  branchId: r.branch_id,
  assignedTo: r.assigned_to,
  acquiredOn: r.acquired_on,
  disposedOn: r.disposed_on,
  // numeric은 PostgREST가 문자열로 준다(정밀도 보존). 표시·정렬은 수치라 여기서 한 번만 바꾼다.
  amount: r.amount == null ? null : Number(r.amount),
  isPortable: r.is_portable,
  returnDue: r.return_due,
  note: r.note,
  updatedAt: r.updated_at,
})

const toRow = (v: AssetInput) => ({
  name: v.name.trim(),
  item_type: v.itemType?.trim() || null,
  acquisition_type: v.acquisitionType,
  status: v.status,
  branch_id: v.branchId,
  assigned_to: v.assignedTo,
  acquired_on: v.acquiredOn,
  disposed_on: v.disposedOn,
  amount: v.amount,
  is_portable: v.isPortable,
  return_due: v.returnDue,
  note: v.note?.trim() || null,
})

const ASSETS_KEY = ['management', 'assets']

/**
 * 선택 지사의 자산 목록(자산명 오름차순). 지사가 정해지지 않으면 조회하지 않는다 —
 * 전사 자산을 한 번에 내리는 경로를 두면 지사 귀속이라는 화면 규칙이 무의미해진다.
 * 폐기 자산도 목록에 남긴다(하단으로 밀지 않고 상태 배지로만 구분).
 */
export function useAssets(branchId?: string) {
  return useQuery({
    queryKey: [...ASSETS_KEY, branchId ?? ''],
    enabled: Boolean(branchId),
    queryFn: async (): Promise<Asset[]> => {
      const { data, error } = await supabase
        .from('assets')
        .select(COLUMNS)
        .eq('branch_id', branchId!)
        .is('deleted_at', null)
        .order('name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as AssetRow[]).map(toAsset)
    },
  })
}

/**
 * 품목 자동완성 후보 — 이미 쓰인 품목 값을 지사와 무관하게 모아 준다.
 * 표기 흔들림('노트북'/'랩탑')을 줄이는 제안일 뿐이라 새 값 입력을 막지는 않는다.
 */
export function useAssetItemTypes() {
  return useQuery({
    queryKey: [...ASSETS_KEY, 'item-types'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('assets')
        .select('item_type')
        .not('item_type', 'is', null)
        .is('deleted_at', null)
      if (error) throw error
      const seen = new Set<string>()
      for (const r of (data ?? []) as { item_type: string | null }[]) {
        const v = r.item_type?.trim()
        if (v) seen.add(v)
      }
      return [...seen].sort((a, b) => a.localeCompare(b, 'ko'))
    },
  })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: AssetInput) => {
      const { error } = await supabase.from('assets').insert(toRow(v))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: AssetInput & { id: string }) => {
      const { error } = await supabase.from('assets').update(toRow(v)).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

/**
 * 비활성화(soft delete) — 잘못 등록한 행을 목록에서 걷어낸다.
 * 폐기(status=RETIRED)와는 다른 축이다: 폐기는 자산의 실물 상태, 비활성화는 목록 정리다.
 */
export function useDeactivateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assets')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}
