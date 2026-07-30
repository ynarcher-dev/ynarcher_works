import { DataTable, EmptyValue, cn, type Column, type DataTableProps } from '@ynarcher/ui'
import { ImageOff } from 'lucide-react'
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
  /** 사진 경로 → Signed URL(없으면 빈 자리). */
  urlOf: (path: string | undefined) => string | undefined
  /** 사용자 id → 이름(없으면 빈 칸). 비품 관리자 칸이 쓴다. */
  nameOf: (id: string | null) => string | null
  onOpen: (row: AssetRow) => void
  pagination: DataTableProps<AssetRow>['pagination']
}

/** 물품 썸네일. 사진이 없거나 서명에 실패하면 빈 자리를 같은 크기로 둔다(줄 높이가 흔들리지 않게). */
function Thumb({ url }: { url?: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-radius-sm border border-gray-200 bg-gray-50">
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <ImageOff className="size-4 text-gray-300" />
      )}
    </span>
  )
}

/**
 * 반출 가능 물품 표 — 이 화면의 주인공은 반출 기록이 아니라 물건이다.
 *
 * 한 줄이 답하는 것은 넷이다: 어떤 물건인가(사진·이름·품목), 지금 있는가(재고·상태),
 * 없다면 누가 언제까지 갖고 있는가(반출자·반납 예정), 그리고 누구에게 물어보는가(관리자).
 * 그 뒤의 이야기(시리얼·목적·행선지·지난 기록)와 모든 처리는 물건을 눌러 모달에서 한다 —
 * 표에 버튼과 값을 다 펼치면 정작 "지금 있나"가 묻히기 때문이다.
 *
 * 색은 연체 하나에만 쓴다. 색을 여러 값에 나눠 주면 어느 색도 경고가 되지 못한다.
 */
export function PortableAssetsTable({
  rows,
  now,
  urlOf,
  nameOf,
  onOpen,
  pagination,
}: PortableAssetsTableProps) {
  const columns: Column<AssetRow>[] = [
    {
      key: 'name',
      header: '물품',
      primary: true,
      align: 'left',
      className: 'w-64',
      render: (r) => (
        <div className="flex items-center gap-2">
          <Thumb url={urlOf(r.asset.photoPaths[0])} />
          <span className="min-w-0 truncate">{r.asset.name}</span>
        </div>
      ),
    },
    {
      key: 'itemType',
      header: '품목',
      className: 'w-24',
      render: (r) => r.asset.itemType ?? <EmptyValue />,
    },
    // 재고는 이 표에서 가장 자주 읽히는 숫자다 — "빌릴 수 있나"에 상태보다 먼저 답한다.
    // 보유를 옆에 함께 적는다: 3이라는 수는 보유가 3일 때와 10일 때 뜻이 다르다.
    {
      key: 'stock',
      header: '재고(잔여)',
      align: 'right',
      numeric: true,
      className: 'w-20',
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
      className: 'w-24',
      render: (r) =>
        r.state === 'OVERDUE' ? (
          <b className="font-semibold text-danger">{ASSET_STATE_LABELS[r.state]}</b>
        ) : (
          ASSET_STATE_LABELS[r.state]
        ),
    },
    {
      key: 'holder',
      header: '반출자',
      className: 'w-24',
      render: (r) => r.active?.createdByName ?? <EmptyValue />,
    },
    {
      key: 'dueAt',
      header: '반납 예정',
      className: 'w-44',
      render: (r) => {
        if (!r.active) return <EmptyValue />
        const late = overdueMs(r.active, now)
        return (
          <span className="tabular-nums text-gray-600">
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
      className: 'w-24',
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
      pagination={pagination}
      emptyText="조건에 맞는 반출 가능 물품이 없습니다."
    />
  )
}
