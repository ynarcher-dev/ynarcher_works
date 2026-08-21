import {
  DataTable,
  EmptyValue,
  cn,
  pinMark,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import {
  ASSET_STATE_LABELS,
  elapsedLabel,
  formatDateTime,
  overdueMs,
  type AssetState,
} from '@/features/office/checkouts/checkoutConfig'
import type { Checkout, PortableAsset } from '@/features/office/checkouts/checkoutsApi'

/** 표 한 줄 = 물품 하나 + 그 물건에 지금 걸려 있는 반출 건. */
export interface AssetRow {
  asset: PortableAsset
  state: AssetState
  /** 지금 이 순간 가져갈 수 있는 개수. 보유 수량에서 나가 있는 것을 뺀 값이다. */
  remaining: number
  /** 지금 상태를 만든 반출 건(반출 가능이면 없음). */
  active: Checkout | null
  /** 이 물건에 걸린 모든 점유 건(모달이 목록으로 편다). */
  checkouts: Checkout[]
}

interface PortableAssetsTableProps {
  rows: AssetRow[]
  now: string
  /** 사용자 id → 이름(없으면 빈 칸). 비품 관리자 칸이 쓴다. */
  nameOf: (id: string | null) => string | null
  onOpen: (row: AssetRow) => void
  pagination: DataTableProps<AssetRow>['pagination']
}

/**
 * 반출 가능 물품 표 — 이 화면의 주인공은 반출 기록이 아니라 물건이다.
 *
 * 한 줄이 답하는 것은 넷이다: 어떤 물건인가(이름·품목), 지금 있는가(재고·상태·승인 여부),
 * 없다면 누가 언제까지 갖고 있는가(반출자·반납 예정), 그리고 누구에게 물어보는가(관리자).
 * 그 뒤의 이야기(시리얼·목적·행선지·지난 기록)와 **모든 처리**는 물건을 눌러 모달에서 한다 —
 * 표에 버튼과 값을 다 펼치면 정작 "지금 있나"가 묻히기 때문이다. 승인도 예외가 아니다:
 * 승인은 어느 요청에 대고 하는 일이라, 어느 건인지 보지 않고 누르는 버튼은 그 자체가 위험하다.
 *
 * 색은 연체 하나에만 쓴다. 색을 여러 값에 나눠 주면 어느 색도 경고가 되지 못한다.
 */
export function PortableAssetsTable({
  rows,
  now,
  nameOf,
  onOpen,
  pagination,
}: PortableAssetsTableProps) {
  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<AssetRow>[] = [
    {
      key: 'name',
      header: '물품',
      primary: true,
      type: 'name',
      // 사진은 표에 두지 않는다 — 목록에서 답해야 할 것은 '지금 빌릴 수 있나'이고, 썸네일은
      // 그 답과 무관하면서 행마다 가장 눈에 띄는 자리를 차지한다. 실물 확인은 물건을 눌러
      // 모달의 사진(AssetPhotoCarousel)에서 한다.
      render: (r) => r.asset.name,
    },
    {
      key: 'itemType',
      header: '품목',
      type: 'text',
      render: (r) => r.asset.itemType ?? <EmptyValue />,
    },
    // 재고는 이 표에서 가장 자주 읽히는 숫자다 — "빌릴 수 있나"에 상태보다 먼저 답한다.
    // 보유를 옆에 함께 적는다: 3이라는 수는 보유가 3일 때와 10일 때 뜻이 다르다.
    // 머리글은 괄호로 부연하지 않고 두 수를 그대로 이름 붙인다(`재고(잔여)` → `잔여/보유`) —
    // 셀이 `3 / 10`으로 읽히는 순서와 머리글의 순서가 같아야 부연 없이도 뜻이 선다.
    {
      key: 'stock',
      header: '잔여/보유',
      type: 'count',
      render: (r) => (
        <span className="tabular-nums">
          <b className={cn('font-semibold', r.remaining === 0 && 'text-gray-400')}>
            {r.remaining}
          </b>
          <span className="text-gray-400"> / {r.asset.quantity}</span>
        </span>
      ),
    },
    {
      key: 'state',
      header: '상태',
      type: 'badge',
      render: (r) =>
        r.state === 'OVERDUE' ? (
          <b className="font-semibold text-danger">{ASSET_STATE_LABELS[r.state]}</b>
        ) : (
          ASSET_STATE_LABELS[r.state]
        ),
    },
    // 승인이 필요한 물건인가는 상태와 붙어 읽힌다 — "지금 있나" 다음에 오는 질문이
    // "그냥 가져가도 되나"이기 때문이다. 맨 끝의 '승인' 열과 뜻이 다르다: 이쪽은 이 물건의
    // 성질이고, 그쪽은 지금 기다리는 요청에 대고 하는 처리다.
    {
      key: 'requiresApproval',
      header: '승인 여부',
      type: 'badge',
      render: (r) => (r.asset.requiresApproval ? '필요' : '불필요'),
    },
    {
      key: 'holder',
      header: '반출자',
      type: 'person',
      render: (r) => r.active?.createdByName ?? <EmptyValue />,
    },
    {
      key: 'dueAt',
      header: '반납 예정',
      // 일시 + 연체 경과가 붙는 자리라 date보다 넓은 datetime 규격에 세운다.
      type: 'datetime',
      render: (r) => {
        if (!r.active) return <EmptyValue />
        const late = overdueMs(r.active, now)
        return (
          <span className="tabular-nums">
            {formatDateTime(r.active.dueAt)}
            {late > 0 && <b className="ml-1 font-semibold text-danger">{elapsedLabel(late)}</b>}
          </span>
        )
      },
    },
    // 관리자는 MANAGEMENT 자산 관리에서 지정한 사람이다. 반출을 물어보고 승인을 받을 상대이므로
    // 줄의 끝에 둔다 — 지금 누가 갖고 있는가(반출자)와 이 물건을 맡은 사람은 다른 질문이다.
    {
      key: 'manager',
      header: '관리자',
      type: 'person',
      render: (r) => nameOf(r.asset.managerId) ?? <EmptyValue />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.asset.id}
      standardColumns={false}
      onRowClick={onOpen}
      // 중요 물품은 이름 순을 건너뛰고 맨 위에 서므로 순번이 뜻을 잃는다 — 번호 자리를 핀에 준다.
      meta={{ rowMark: (r) => pinMark(r.asset.isPinned) }}
      pagination={pagination}
      emptyText="조건에 맞는 반출 가능 물품이 없습니다."
    />
  )
}
