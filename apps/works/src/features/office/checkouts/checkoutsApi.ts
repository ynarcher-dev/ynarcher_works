/**
 * 반출대장(public.asset_checkouts) 서버 훅 — OFFICE가 소유한다.
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 * 원장: supabase/migrations/20260730180000_asset_checkouts.sql
 *
 * RLS: 조회는 내부 임직원 전원(app.is_internal_user), 등록은 본인 명의만,
 * 수정은 본인·management 쓰기·관리자. 무엇으로 바꿀 수 있는가(상태 전이)는 DB 트리거가
 * 판정하므로 여기서는 전이 요청을 그대로 보내고 실패 메시지를 옮긴다.
 *
 * 자산명·시리얼·지사는 조인하지 않는다 — assets 조회 권한이 없는 임직원도 대장을 봐야 하므로
 * 원장이 등록 시점 값을 스냅샷으로 들고 있다(회의실 예약의 created_by_name과 같은 해법).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  OCCUPYING_STATUSES,
  todayKey,
  type CheckoutStatus,
  type CheckoutView,
} from '@/features/office/checkouts/checkoutConfig'

export interface Checkout {
  id: string
  assetId: string
  /** 등록 시점 자산 표기(스냅샷). 이후 자산명이 바뀌어도 대장은 그때의 이름으로 읽힌다. */
  assetName: string
  assetItemType: string | null
  assetSerialNo: string | null
  branchId: string | null
  status: CheckoutStatus
  checkoutOn: string
  dueOn: string
  returnedOn: string | null
  purpose: string
  destination: string | null
  note: string | null
  createdBy: string
  createdByName: string | null
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
  returnedByName: string | null
  returnNote: string | null
}

interface CheckoutRow {
  id: string
  asset_id: string
  asset_name: string
  asset_item_type: string | null
  asset_serial_no: string | null
  branch_id: string | null
  status: CheckoutStatus
  checkout_on: string
  due_on: string
  returned_on: string | null
  purpose: string
  destination: string | null
  note: string | null
  created_by: string
  created_by_name: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  returned_by_name: string | null
  return_note: string | null
}

const COLUMNS =
  'id, asset_id, asset_name, asset_item_type, asset_serial_no, branch_id, status, checkout_on, due_on, returned_on, purpose, destination, note, created_by, created_by_name, decided_by, decided_at, decision_note, returned_by_name, return_note'

const toCheckout = (r: CheckoutRow): Checkout => ({
  id: r.id,
  assetId: r.asset_id,
  assetName: r.asset_name,
  assetItemType: r.asset_item_type,
  assetSerialNo: r.asset_serial_no,
  branchId: r.branch_id,
  status: r.status,
  checkoutOn: r.checkout_on,
  dueOn: r.due_on,
  returnedOn: r.returned_on,
  purpose: r.purpose,
  destination: r.destination,
  note: r.note,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  returnedByName: r.returned_by_name,
  returnNote: r.return_note,
})

const CHECKOUTS_KEY = ['office', 'asset-checkouts']

/** PostgREST or 구문에서 값 구분자로 쓰이는 문자를 걷어낸다. */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

export interface CheckoutPage {
  rows: Checkout[]
  total: number
}

/**
 * 뷰(탭) 하나의 목록. 뷰가 곧 조건이며, 정렬도 뷰가 정한다 —
 * 진행 중인 건은 급한 것(반납 예정이 가까운 것)부터, 지난 기록은 최근 것부터 읽는다.
 */
export function useCheckoutsPage(args: {
  view: CheckoutView
  keyword: string
  branchIds: string[]
  page: number
  pageSize: number
  myId?: string
}) {
  const { view, keyword, branchIds, page, pageSize, myId } = args
  return useQuery({
    queryKey: [...CHECKOUTS_KEY, 'page', view, keyword, branchIds, page, pageSize, myId ?? ''],
    // '내 반출'은 내가 누구인지 알아야 답할 수 있는 질문이다.
    enabled: view !== 'MINE' || Boolean(myId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CheckoutPage> => {
      const from = page * pageSize
      const kw = sanitizeOrValue(keyword)
      const recent = view === 'MINE' || view === 'ALL'

      let q = supabase
        .from('asset_checkouts')
        .select(COLUMNS, { count: 'exact' })
        .is('deleted_at', null)
        .order(recent ? 'checkout_on' : 'due_on', { ascending: !recent })
        .range(from, from + pageSize - 1)

      if (view === 'OUT') q = q.eq('status', 'OUT')
      if (view === 'PENDING') q = q.eq('status', 'PENDING')
      if (view === 'RESERVED') q = q.eq('status', 'RESERVED')
      if (view === 'OVERDUE') q = q.eq('status', 'OUT').lt('due_on', todayKey())
      if (view === 'MINE' && myId) q = q.eq('created_by', myId)

      if (branchIds.length) q = q.in('branch_id', branchIds)
      if (kw) {
        q = q.or(
          [
            `asset_name.ilike.%${kw}%`,
            `asset_serial_no.ilike.%${kw}%`,
            `created_by_name.ilike.%${kw}%`,
          ].join(','),
        )
      }

      const { data, error, count } = await q
      if (error) throw error
      return { rows: ((data ?? []) as CheckoutRow[]).map(toCheckout), total: count ?? 0 }
    },
  })
}

/** 한 자산의 기간을 잡고 있는 반출 건(예약·승인 대기·반출 중). 등록 폼의 경고·안내용. */
export function useAssetOccupancy(assetId: string | undefined) {
  return useQuery({
    queryKey: [...CHECKOUTS_KEY, 'occupancy', assetId ?? ''],
    enabled: Boolean(assetId),
    queryFn: async (): Promise<Checkout[]> => {
      const { data, error } = await supabase
        .from('asset_checkouts')
        .select(COLUMNS)
        .eq('asset_id', assetId!)
        .is('deleted_at', null)
        .in('status', OCCUPYING_STATUSES)
        .order('checkout_on', { ascending: true })
      if (error) throw error
      return ((data ?? []) as CheckoutRow[]).map(toCheckout)
    },
  })
}

// ── 반출 후보 자산 ────────────────────────────────────────────────────

/** 반출 후보(public.portable_assets 뷰). 금액·할당 대상은 내려오지 않는다. */
export interface PortableAsset {
  id: string
  name: string
  itemType: string | null
  serialNo: string | null
  branchId: string | null
  requiresApproval: boolean
}

interface PortableRow {
  id: string
  name: string
  item_type: string | null
  serial_no: string | null
  branch_id: string | null
  requires_approval: boolean
}

/**
 * 반출 가능 자산 목록. `assets`가 아니라 뷰를 읽는다 — 원장은 MANAGEMENT 권한자만 볼 수 있고,
 * 반출대장은 임직원 전원이 쓰는 화면이기 때문이다.
 */
export function usePortableAssets() {
  return useQuery({
    queryKey: ['office', 'portable-assets'],
    queryFn: async (): Promise<PortableAsset[]> => {
      const { data, error } = await supabase
        .from('portable_assets')
        .select('id, name, item_type, serial_no, branch_id, requires_approval')
        .order('name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as PortableRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        itemType: r.item_type,
        serialNo: r.serial_no,
        branchId: r.branch_id,
        requiresApproval: r.requires_approval,
      }))
    },
  })
}

// ── 쓰기 ──────────────────────────────────────────────────────────────

export interface CheckoutInput {
  assetId: string
  checkoutOn: string
  dueOn: string
  purpose: string
  destination: string | null
  note: string | null
}

/**
 * 반출 등록. 반출자·자산 스냅샷·초기 상태(승인 대기/예약)는 모두 서버 트리거가 정한다 —
 * 클라이언트가 상태를 보내도 자산의 승인 필요 여부가 덮어쓴다.
 */
export function useCreateCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: CheckoutInput) => {
      const { error } = await supabase.from('asset_checkouts').insert({
        asset_id: v.assetId,
        checkout_on: v.checkoutOn,
        due_on: v.dueOn,
        purpose: v.purpose.trim(),
        destination: v.destination?.trim() || null,
        note: v.note?.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHECKOUTS_KEY }),
  })
}

/**
 * 상태 전이 하나. 승인·반려·반출 시작·반납·취소가 모두 이 한 문장이며, 허용 여부와 주체는
 * DB 트리거가 판정한다(화면의 버튼 노출은 같은 규칙을 비춘 것일 뿐이다).
 */
export function useTransitionCheckout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      id: string
      status: CheckoutStatus
      returnedOn?: string
      returnNote?: string | null
      decisionNote?: string | null
    }) => {
      const patch: Record<string, unknown> = { status: v.status }
      if (v.status === 'RETURNED') {
        patch.returned_on = v.returnedOn ?? todayKey()
        patch.return_note = v.returnNote?.trim() || null
      }
      if (v.status === 'REJECTED' || v.status === 'RESERVED') {
        if (v.decisionNote !== undefined) patch.decision_note = v.decisionNote?.trim() || null
      }
      const { error } = await supabase.from('asset_checkouts').update(patch).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHECKOUTS_KEY }),
  })
}

/** 기간 겹침(EXCLUDE 위반)인지 판별해 친절한 안내로 바꾸기 위한 헬퍼. */
export function isOverlapError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === '23P01' || Boolean(e?.message?.includes('asset_checkouts_no_overlap'))
}
