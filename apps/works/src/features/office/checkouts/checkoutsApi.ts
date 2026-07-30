/**
 * 반출대장(public.asset_checkouts) 서버 훅 — OFFICE가 소유한다.
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 * 원장: supabase/migrations/20260730180000_asset_checkouts.sql(+20260730190000 일시화)
 *
 * RLS: 조회는 내부 임직원 전원(app.is_internal_user), 등록은 본인 명의만,
 * 수정은 본인·management 쓰기·관리자. 무엇으로 바꿀 수 있는가(상태 전이)는 DB 트리거가
 * 판정하므로 여기서는 전이 요청을 그대로 보내고 실패 메시지를 옮긴다.
 *
 * 자산은 조인하지 않는다 — assets 조회 권한이 없는 임직원도 대장을 봐야 하므로 목록은
 * 뷰(portable_assets)에서, 기록의 물품 표기는 원장의 등록 시점 스냅샷에서 온다.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  OCCUPYING_STATUSES,
  type CheckoutStatus,
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
  /** ISO 일시(timestamptz). */
  checkoutAt: string
  dueAt: string
  returnedAt: string | null
  /** 이번 반출로 들고 나간 개수. */
  quantity: number
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
  checkout_at: string
  due_at: string
  returned_at: string | null
  quantity: number
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
  'id, asset_id, asset_name, asset_item_type, asset_serial_no, branch_id, status, checkout_at, due_at, returned_at, quantity, purpose, destination, note, created_by, created_by_name, decided_by, decided_at, decision_note, returned_by_name, return_note'

const toCheckout = (r: CheckoutRow): Checkout => ({
  id: r.id,
  assetId: r.asset_id,
  assetName: r.asset_name,
  assetItemType: r.asset_item_type,
  assetSerialNo: r.asset_serial_no,
  branchId: r.branch_id,
  status: r.status,
  checkoutAt: r.checkout_at,
  dueAt: r.due_at,
  returnedAt: r.returned_at,
  quantity: r.quantity,
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

// ── 반출 후보 자산 ────────────────────────────────────────────────────

/** 반출 후보(public.portable_assets 뷰). 금액·할당 대상은 내려오지 않는다(관리자만 온다). */
export interface PortableAsset {
  id: string
  name: string
  itemType: string | null
  serialNo: string | null
  branchId: string | null
  requiresApproval: boolean
  /** 자산 원장의 비고 — 이 물건이 어떤 물건인지 알려 주는 설명 자리다. */
  note: string | null
  photoPaths: string[]
  /** 보유 수량. 잔여는 이 값에서 그때 나가 있는 개수를 뺀 것이다. */
  quantity: number
  /**
   * 이 물건을 맡은 사람(assets.manager_id) — 반출을 물어보고 승인을 받을 상대다.
   * 뷰는 id만 내려보내고 이름은 화면이 임직원 디렉토리에서 붙인다.
   */
  managerId: string | null
}

interface PortableRow {
  id: string
  name: string
  item_type: string | null
  serial_no: string | null
  branch_id: string | null
  requires_approval: boolean
  note: string | null
  photo_paths: string[] | null
  quantity: number
  manager_id: string | null
}

/**
 * 지사의 반출 가능 자산. `assets`가 아니라 뷰를 읽는다 — 원장은 MANAGEMENT 권한자만 볼 수
 * 있고, 반출대장은 임직원 전원이 쓰는 화면이기 때문이다.
 */
export function usePortableAssets(branchId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'portable-assets', branchId ?? ''],
    enabled: Boolean(branchId),
    queryFn: async (): Promise<PortableAsset[]> => {
      const { data, error } = await supabase
        .from('portable_assets')
        .select(
          'id, name, item_type, serial_no, branch_id, requires_approval, note, photo_paths, quantity, manager_id',
        )
        .eq('branch_id', branchId!)
        .order('name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as PortableRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        itemType: r.item_type,
        serialNo: r.serial_no,
        branchId: r.branch_id,
        requiresApproval: r.requires_approval,
        note: r.note,
        photoPaths: r.photo_paths ?? [],
        quantity: r.quantity,
        managerId: r.manager_id,
      }))
    },
  })
}

/**
 * 지사 물품들에 지금 걸려 있는 반출 건(승인 대기·예약·반출 중) — 자산 id별로 묶어 준다.
 * 목록의 상태·반출자·반납 예정 칸이 모두 이 한 번의 조회에서 나온다.
 */
export function useActiveCheckouts(assetIds: string[]) {
  const key = [...assetIds].sort().join(',')
  return useQuery({
    queryKey: [...CHECKOUTS_KEY, 'active', key],
    enabled: assetIds.length > 0,
    queryFn: async (): Promise<Map<string, Checkout[]>> => {
      const { data, error } = await supabase
        .from('asset_checkouts')
        .select(COLUMNS)
        .in('asset_id', assetIds)
        .is('deleted_at', null)
        .in('status', OCCUPYING_STATUSES)
        .order('checkout_at', { ascending: true })
      if (error) throw error
      const map = new Map<string, Checkout[]>()
      for (const row of (data ?? []) as CheckoutRow[]) {
        const c = toCheckout(row)
        const arr = map.get(c.assetId) ?? []
        arr.push(c)
        map.set(c.assetId, arr)
      }
      return map
    },
  })
}

/** 물품 하나의 지난 기록(종결 건). 모달 하단에서 "이 물건이 그동안 어디에 다녀왔는가"를 읽는다. */
export function useCheckoutHistory(assetId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: [...CHECKOUTS_KEY, 'history', assetId ?? '', limit],
    enabled: Boolean(assetId),
    queryFn: async (): Promise<Checkout[]> => {
      const { data, error } = await supabase
        .from('asset_checkouts')
        .select(COLUMNS)
        .eq('asset_id', assetId!)
        .is('deleted_at', null)
        .not('status', 'in', `(${OCCUPYING_STATUSES.join(',')})`)
        .order('checkout_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ((data ?? []) as CheckoutRow[]).map(toCheckout)
    },
  })
}

// ── 쓰기 ──────────────────────────────────────────────────────────────

export interface CheckoutInput {
  assetId: string
  /** ISO 일시. */
  checkoutAt: string
  dueAt: string
  quantity: number
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
        checkout_at: v.checkoutAt,
        due_at: v.dueAt,
        quantity: v.quantity,
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
      returnedAt?: string
      returnNote?: string | null
      decisionNote?: string | null
    }) => {
      const patch: Record<string, unknown> = { status: v.status }
      if (v.status === 'RETURNED') {
        patch.returned_at = v.returnedAt ?? new Date().toISOString()
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

/**
 * 재고 부족으로 거절된 요청인지 판별한다.
 *
 * 이 경우에는 서버가 보낸 문장을 그대로 보여 준다 — "이 기간에 2개를 요청했지만 잔여는
 * 1개입니다(보유 3개)"처럼, 화면이 다시 지어낼 수 없는 수치가 이미 들어 있다.
 */
export function stockErrorMessage(err: unknown): string | null {
  const message = (err as { message?: string } | null)?.message
  return message?.includes('재고가 부족') ? message : null
}
