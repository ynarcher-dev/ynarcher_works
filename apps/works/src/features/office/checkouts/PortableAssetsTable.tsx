import { Button, DataTable, EmptyValue, type Column, type DataTableProps } from '@ynarcher/ui'
import { ImageOff } from 'lucide-react'
import {
  ASSET_STATE_LABELS,
  abilityOf,
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
  /** 지금 상태를 만든 반출 건(반출 가능이면 없음). */
  active: Checkout | null
  /** 이 물건에 걸린 모든 점유 건(모달이 목록으로 편다). */
  checkouts: Checkout[]
}

interface PortableAssetsTableProps {
  rows: AssetRow[]
  viewer: { id?: string; isManager: boolean }
  now: string
  busy: boolean
  /** 사진 경로 → Signed URL(없으면 빈 자리). */
  urlOf: (path: string | undefined) => string | undefined
  onOpen: (row: AssetRow) => void
  /** 표에서 바로 누르는 대표 처리(반출하기·반납하기). 나머지 처리는 모달이 갖는다. */
  onCheckout: (row: AssetRow) => void
  onReturn: (row: AssetRow) => void
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
 * 한 줄이 답하는 것은 셋이다: 어떤 물건인가(사진·이름·품목·시리얼), 지금 있는가(상태),
 * 없다면 누가 언제까지 갖고 있는가(반출자·반납 예정). 그 뒤의 이야기(목적·행선지·지난 기록)는
 * 물건을 눌러 모달에서 읽는다 — 표에 다 펼치면 정작 "지금 있나"가 묻히기 때문이다.
 *
 * 색은 연체 하나에만 쓴다. 색을 여러 값에 나눠 주면 어느 색도 경고가 되지 못한다.
 */
export function PortableAssetsTable({
  rows,
  viewer,
  now,
  busy,
  urlOf,
  onOpen,
  onCheckout,
  onReturn,
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
    {
      key: 'serialNo',
      header: '시리얼 번호',
      className: 'w-32',
      render: (r) =>
        r.asset.serialNo ? (
          <span className="tabular-nums text-gray-600">{r.asset.serialNo}</span>
        ) : (
          <EmptyValue />
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
    {
      key: 'actions',
      header: '처리',
      className: 'w-28',
      render: (r) => {
        const can = r.active ? abilityOf(r.active, viewer) : null
        // 표에는 대표 처리 하나만 둔다 — 승인·취소처럼 판단이 필요한 일은 물건을 열어서 한다.
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {r.state === 'AVAILABLE' && (
              <Button variant="outline" onClick={() => onCheckout(r)} disabled={busy}>
                반출하기
              </Button>
            )}
            {can?.canReturn && (
              <Button variant="outline" onClick={() => onReturn(r)} disabled={busy}>
                반납하기
              </Button>
            )}
            {r.state === 'PENDING' && viewer.isManager && (
              <Button variant="outline" onClick={() => onOpen(r)} disabled={busy}>
                승인 처리
              </Button>
            )}
          </div>
        )
      },
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
