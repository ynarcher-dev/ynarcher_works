/**
 * OFFICE 자산 현황 서버 훅 — **조회 전용**이다.
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 * 원장: public.assets(MANAGEMENT 소유) / 노출 경로: public.portable_assets 뷰
 *
 * 이 화면은 원장을 쓰지 않는다. 물품의 등록·수정·폐기·수량은 모두 MANAGEMENT `자산 관리`가
 * 소유하고, OFFICE는 "회사에 어떤 공용 물품이 어느 지사에 있는가"를 임직원 전원에게 보여
 * 주기만 한다(2026-08-25 결정 — 예약·반출 흐름 폐지).
 *
 * `assets` 원장을 직접 읽지 않는 이유는 그 조회 권한이 `can_read_workspace('management')`라,
 * 권한이 없는 임직원에게는 빈 화면이 되기 때문이다. 뷰가 필요한 만큼만 내려보낸다 —
 * 금액·결제 주기·할당 대상은 오지 않는다(물건을 찾는 데 필요한 정보가 아니고 각각 비용
 * 정보와 인사 정보다). 시리얼 번호도 2026-09-02에 뷰에서 걷어냈다 — 이 화면에 적지 않기로
 * 한 값이라, 화면에서만 지우고 내려보내면 "숨겼을 뿐 오는" 상태가 된다.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** 공용 물품(public.portable_assets 뷰). */
export interface PortableAsset {
  id: string
  name: string
  itemType: string | null
  branchId: string | null
  /**
   * 보관 위치(assets.location) — 지사 안에서 어디로 가면 되는지.
   * 지사는 탭으로 이미 골라 놓은 값이라, 목록에서 "어디 있나"에 실제로 답하는 것은 이 값이다.
   */
  location: string | null
  /** 자산 원장의 비고 — 이 물건이 어떤 물건인지 알려 주는 설명 자리다. */
  note: string | null
  photoPaths: string[]
  /** 보유 수량. */
  quantity: number
  /**
   * 이 물건을 맡은 사람(assets.manager_id) — 쓰려면 물어볼 상대다.
   * 뷰는 id만 내려보내고 이름은 화면이 임직원 디렉토리에서 붙인다.
   */
  managerId: string | null
  /** 중요 표시(assets.is_pinned). 자산 관리에서 정하고 이 화면은 자리(맨 위)로만 읽는다. */
  isPinned: boolean
}

interface PortableRow {
  id: string
  name: string
  item_type: string | null
  branch_id: string | null
  location: string | null
  note: string | null
  photo_paths: string[] | null
  quantity: number
  manager_id: string | null
  is_pinned: boolean
}

const COLUMNS =
  'id, name, item_type, branch_id, location, note, photo_paths, quantity, manager_id, is_pinned'

const toAsset = (r: PortableRow): PortableAsset => ({
  id: r.id,
  name: r.name,
  itemType: r.item_type,
  branchId: r.branch_id,
  location: r.location,
  note: r.note,
  photoPaths: r.photo_paths ?? [],
  quantity: r.quantity,
  managerId: r.manager_id,
  isPinned: r.is_pinned,
})

/**
 * 공용 물품이 한 점이라도 있는 지사 id 집합.
 * 지사 탭은 지사 전체가 아니라 이 집합으로 거른다 — 볼 것이 없는 탭을 열어 두면 빈손으로
 * 도착하고, 지사가 늘어날수록 그런 탭만 늘어난다(회의실 예약의 useRoomBranchIds와 같은 규칙).
 */
export function useAssetBranchIds() {
  return useQuery({
    queryKey: ['office', 'portable-asset-branch-ids'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from('portable_assets').select('branch_id')
      if (error) throw error
      return new Set(
        ((data ?? []) as { branch_id: string | null }[])
          .map((r) => r.branch_id)
          .filter((id): id is string => Boolean(id)),
      )
    },
  })
}

/**
 * 지사의 공용 물품.
 *
 * 차례는 중요 표시가 먼저, 그 안에서 물품명 순이다. 자산 관리 목록과 같은 규칙을 쓴다 —
 * 어느 물건을 먼저 보아야 하는가는 화면마다 달라질 이유가 없다.
 */
export function usePortableAssets(branchId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'portable-assets', branchId ?? ''],
    enabled: Boolean(branchId),
    queryFn: async (): Promise<PortableAsset[]> => {
      const { data, error } = await supabase
        .from('portable_assets')
        .select(COLUMNS)
        .eq('branch_id', branchId!)
        .order('is_pinned', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as PortableRow[]).map(toAsset)
    },
  })
}

/**
 * 물품 하나가 어느 지사에 있는지. 통합검색·알림 딥링크(`?asset=`)로 들어왔을 때 그 물건이
 * 있는 지사 탭으로 옮겨 가기 위해 쓴다 — 목록 조회 단위가 지사라, 지사를 모르면 그 물건이
 * 애초에 목록에 없다. 한 컬럼만 읽으므로 전체 목록을 다시 받는 것보다 싸다.
 */
export function usePortableAssetBranch(assetId: string | undefined) {
  return useQuery({
    queryKey: ['office', 'portable-asset-branch', assetId ?? ''],
    enabled: Boolean(assetId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('portable_assets')
        .select('branch_id')
        .eq('id', assetId!)
        .maybeSingle()
      if (error) throw error
      return (data as { branch_id: string | null } | null)?.branch_id ?? null
    },
  })
}
