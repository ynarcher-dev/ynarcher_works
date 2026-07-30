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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  AssetAcquisition,
  AssetBillingCycle,
  AssetStatus,
} from '@/features/management/config'

export interface Asset {
  id: string
  name: string
  /** 품목(노트북·차량 등 자유입력). */
  itemType: string | null
  acquisitionType: AssetAcquisition
  status: AssetStatus
  branchId: string | null
  assignedTo: string | null
  /** 시리얼·관리 번호. 유니크가 아니다(라이선스 키는 좌석마다 반복될 수 있다). */
  serialNo: string | null
  acquiredOn: string | null
  disposedOn: string | null
  /** 금액(원). 어느 주기의 값인지는 billingCycle이 정한다. 미입력은 null이며 0과 구분한다. */
  amount: number | null
  billingCycle: AssetBillingCycle
  /** 보유 수량. 같은 물건을 여러 개 두는 자산에서 1보다 크며, 반출 잔여의 기준이 된다. */
  quantity: number
  isPortable: boolean
  /** 반출 시 승인이 필요한가. 반출 가능(isPortable)일 때만 뜻을 갖는다. */
  requiresApproval: boolean
  returnDue: string | null
  note: string | null
  /** 사진 경로(asset-photos 버킷 키). 순서가 표시 순서이며 최대 5장(DB check). */
  photoPaths: string[]
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
  serialNo: string | null
  acquiredOn: string | null
  disposedOn: string | null
  amount: number | null
  billingCycle: AssetBillingCycle
  quantity: number
  isPortable: boolean
  requiresApproval: boolean
  returnDue: string | null
  note: string | null
  photoPaths: string[]
}

interface AssetRow {
  id: string
  name: string
  item_type: string | null
  acquisition_type: AssetAcquisition
  status: AssetStatus
  branch_id: string | null
  assigned_to: string | null
  serial_no: string | null
  acquired_on: string | null
  disposed_on: string | null
  amount: string | number | null
  billing_cycle: AssetBillingCycle
  quantity: number
  is_portable: boolean
  requires_approval: boolean
  return_due: string | null
  note: string | null
  photo_paths: string[] | null
  updated_at: string | null
}

const COLUMNS =
  'id, name, item_type, acquisition_type, status, branch_id, assigned_to, serial_no, acquired_on, disposed_on, amount, billing_cycle, quantity, is_portable, requires_approval, return_due, note, photo_paths, updated_at'

const toAsset = (r: AssetRow): Asset => ({
  id: r.id,
  name: r.name,
  itemType: r.item_type,
  acquisitionType: r.acquisition_type,
  status: r.status,
  branchId: r.branch_id,
  assignedTo: r.assigned_to,
  serialNo: r.serial_no,
  acquiredOn: r.acquired_on,
  disposedOn: r.disposed_on,
  // numeric은 PostgREST가 문자열로 준다(정밀도 보존). 표시·정렬은 수치라 여기서 한 번만 바꾼다.
  amount: r.amount == null ? null : Number(r.amount),
  billingCycle: r.billing_cycle,
  quantity: r.quantity,
  isPortable: r.is_portable,
  requiresApproval: r.requires_approval,
  returnDue: r.return_due,
  note: r.note,
  // 컬럼 기본값이 빈 배열이라 null이 올 일은 없지만, 없으면 없는 대로 다룬다(화면이 빈 칸을 그린다).
  photoPaths: r.photo_paths ?? [],
  updatedAt: r.updated_at,
})

/** 저장 페이로드. 임포터도 이 함수를 거쳐 화면과 같은 모양으로 넣는다. */
export const toAssetRow = (v: AssetInput) => ({
  name: v.name.trim(),
  item_type: v.itemType?.trim() || null,
  acquisition_type: v.acquisitionType,
  status: v.status,
  branch_id: v.branchId,
  assigned_to: v.assignedTo,
  serial_no: v.serialNo?.trim() || null,
  acquired_on: v.acquiredOn,
  disposed_on: v.disposedOn,
  amount: v.amount,
  billing_cycle: v.billingCycle,
  quantity: v.quantity,
  is_portable: v.isPortable,
  // 반출이 불가한 자산에 승인 여부는 뜻이 없다 — 토글을 끄면 함께 내린다(꺼진 채 남아 있으면
  // 나중에 반출을 다시 켰을 때 예전 설정이 조용히 되살아난다).
  requires_approval: v.isPortable && v.requiresApproval,
  return_due: v.returnDue,
  note: v.note?.trim() || null,
  photo_paths: v.photoPaths,
})

const ASSETS_KEY = ['management', 'assets']

/** 목록 필터. 값이 비어 있는 축은 조건을 걸지 않는다. */
export interface AssetFilters {
  statuses: string[]
  acquisitionTypes: string[]
  billingCycles: string[]
  /** 반출 가능 여부. 'true'/'false' 문자열 다중선택(둘 다 고르면 조건 없음과 같다). */
  portable: string[]
}

export const EMPTY_ASSET_FILTERS: AssetFilters = {
  statuses: [],
  acquisitionTypes: [],
  billingCycles: [],
  portable: [],
}

export function hasActiveAssetFilters(f: AssetFilters): boolean {
  return (
    f.statuses.length > 0 ||
    f.acquisitionTypes.length > 0 ||
    f.billingCycles.length > 0 ||
    f.portable.length > 0
  )
}

export interface AssetPage {
  rows: Asset[]
  /** 검색·필터가 반영된 건수(페이저·번호의 기준). */
  total: number
  /** 같은 지사의 필터 미적용 전체 건수 — 표 좌측에 "반영/전체"로 적는다. */
  totalAll: number
}

/** PostgREST or 구문에서 값 구분자로 쓰이는 문자를 걷어낸다(검색어가 조건을 깨지 않도록). */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

/**
 * 선택 지사의 자산 목록(자산명 오름차순, 서버 페이지네이션).
 * 지사가 정해지지 않으면 조회하지 않는다 — 전사 자산을 한 번에 내리는 경로를 두면
 * 지사 귀속이라는 화면 규칙이 무의미해진다.
 * 폐기 자산도 목록에 남긴다(하단으로 밀지 않고 상태 배지로만 구분).
 * 검색은 자산명·품목·시리얼 번호를 함께 훑는다(현장에서 자산을 찾는 세 가지 단서다).
 */
export function useAssetsPage(
  branchId: string | undefined,
  keyword: string,
  filters: AssetFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: [...ASSETS_KEY, 'page', branchId ?? '', keyword, filters, page, pageSize],
    enabled: Boolean(branchId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AssetPage> => {
      const from = page * pageSize
      const kw = sanitizeOrValue(keyword)

      let q = supabase
        .from('assets')
        .select(COLUMNS, { count: 'exact' })
        .eq('branch_id', branchId!)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .range(from, from + pageSize - 1)

      if (kw) {
        q = q.or(
          [`name.ilike.%${kw}%`, `item_type.ilike.%${kw}%`, `serial_no.ilike.%${kw}%`].join(','),
        )
      }
      if (filters.statuses.length) q = q.in('status', filters.statuses)
      if (filters.acquisitionTypes.length) q = q.in('acquisition_type', filters.acquisitionTypes)
      if (filters.billingCycles.length) q = q.in('billing_cycle', filters.billingCycles)
      // 두 값을 다 고른 것은 조건이 없는 것과 같다 — 그때는 절을 붙이지 않는다.
      if (filters.portable.length === 1) q = q.eq('is_portable', filters.portable[0] === 'true')

      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      // 검색·필터가 없으면 반영 건수가 곧 전체 건수다. 있을 때만 전체를 따로 센다.
      let totalAll = total
      if (kw || hasActiveAssetFilters(filters)) {
        const { count: allCount } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId!)
          .is('deleted_at', null)
        totalAll = allCount ?? total
      }

      return { rows: ((data ?? []) as AssetRow[]).map(toAsset), total, totalAll }
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
      const { error } = await supabase.from('assets').insert(toAssetRow(v))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: AssetInput & { id: string }) => {
      const { error } = await supabase.from('assets').update(toAssetRow(v)).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

/**
 * 비활성화(soft delete) — 잘못 등록한 행을 목록에서 걷어낸다.
 * 폐기(status=RETIRED)와는 다른 축이다: 폐기는 자산의 실물 상태, 비활성화는 목록 정리다.
 *
 * 여러 건도 한 문장으로 처리한다(`in`) — 건마다 요청을 돌리면 중간에 끊겼을 때 절반만
 * 정리된 상태가 남고, 사용자는 무엇이 남았는지 목록을 다시 세어 봐야 한다.
 */
export function useDeactivateAssets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return
      const { error } = await supabase
        .from('assets')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

/**
 * 반출 승인 필요 여부 일괄 설정 — 품목 단위 운용의 실제 경로다.
 *
 * 정책을 품목(item_type)에 매달 수 없어(원장 없는 자유입력이라 '노트북'과 '랩탑'이 갈린다)
 * 값은 자산마다 있지만, 실제 운용은 "차량 12대를 전부 승인 대상으로"처럼 무리 단위다.
 * 검색으로 골라 한 번에 바꾸는 이 경로가 그것을 대신한다.
 *
 * 반출 가능한 자산에만 건다 — 반출이 불가한 자산의 승인 여부는 뜻이 없는 값이고, 켜 두면
 * 나중에 반출을 허용하는 순간 아무도 의도하지 않은 승인 절차가 조용히 붙는다.
 */
export function useSetAssetsApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { ids: string[]; requiresApproval: boolean }) => {
      if (!v.ids.length) return
      const { error } = await supabase
        .from('assets')
        .update({ requires_approval: v.requiresApproval })
        .in('id', v.ids)
        .eq('is_portable', true)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}

/**
 * 대용량 업로드 — 검증을 통과한 행을 한 번에 넣는다.
 * 부분 성공을 허용하지 않는다: 한 요청 안에서 실패하면 전부 롤백되므로, 사용자는 파일을
 * 고쳐 다시 올리면 된다(절반만 들어간 원장을 정리하는 일보다 그쪽이 쉽다).
 */
export function useBulkCreateAssets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: AssetInput[]) => {
      if (!rows.length) return
      const { error } = await supabase.from('assets').insert(rows.map(toAssetRow))
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSETS_KEY }),
  })
}
