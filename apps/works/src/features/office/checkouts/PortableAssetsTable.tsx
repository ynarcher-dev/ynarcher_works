import {
  Button,
  DataTable,
  EmptyValue,
  cn,
  pinMark,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import { ImageOff } from 'lucide-react'
import {
  ASSET_STATE_LABELS,
  elapsedLabel,
  formatDateTime,
  overdueMs,
  pendingCheckouts,
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
  /** 보는 사람이 승인권자인가(management 쓰기·관리자). 아니면 승인 열은 대기 건수만 알린다. */
  canApprove: boolean
  onOpen: (row: AssetRow) => void
  /** 승인 실행(확인 문구·서버 호출은 워크스페이스가 갖는다). */
  onApprove: (target: Checkout) => void
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
 * 그 뒤의 이야기(시리얼·목적·행선지·지난 기록)와 처리는 물건을 눌러 모달에서 한다 —
 * 표에 버튼과 값을 다 펼치면 정작 "지금 있나"가 묻히기 때문이다. 예외는 승인 하나다:
 * 승인권자가 목록을 훑으며 끝내는 일이라 그 자리에 버튼을 둔다(맨 끝 승인 열).
 *
 * 색은 연체 하나에만 쓴다. 색을 여러 값에 나눠 주면 어느 색도 경고가 되지 못한다.
 */
export function PortableAssetsTable({
  rows,
  now,
  urlOf,
  nameOf,
  canApprove,
  onOpen,
  onApprove,
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
    // 승인만 표에 꺼내 둔다. 반려는 사유를 받아야 하고 반출 시작·반납은 본인이 물건을 손에
    // 쥐고 하는 처리라 물품을 열어 확인한 뒤에 해도 늦지 않지만, 승인은 승인권자가 목록을
    // 훑다가 "이건 됐다"고 끝내는 일이고 그때마다 모달을 여는 것은 절차가 아니라 지연이다.
    {
      key: 'approval',
      header: '승인',
      className: 'w-24',
      render: (r) => {
        const pending = pendingCheckouts(r.checkouts)
        if (!pending.length) return <EmptyValue />
        // 승인권자가 아니면 누를 것이 없다 — 대신 기다리는 요청이 있다는 사실만 알린다.
        if (!canApprove) return <span className="text-gray-500">대기 {pending.length}건</span>
        return (
          <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              // 여러 건이 기다리면 어느 건인지 골라야 한다 — 표에서 임의로 하나를 고르지
              // 않고 물품을 열어 목록을 보여 준다.
              onClick={() => (pending.length === 1 ? onApprove(pending[0]!) : onOpen(r))}
            >
              {pending.length === 1 ? '승인' : `승인 ${pending.length}건`}
            </Button>
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
      // 중요 물품은 이름 순을 건너뛰고 맨 위에 서므로 순번이 뜻을 잃는다 — 번호 자리를 핀에 준다.
      meta={{ rowMark: (r) => pinMark(r.asset.isPinned) }}
      pagination={pagination}
      emptyText="조건에 맞는 반출 가능 물품이 없습니다."
    />
  )
}
