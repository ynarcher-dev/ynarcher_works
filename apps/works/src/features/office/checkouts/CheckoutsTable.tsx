import { Button, DataTable, EmptyValue, type Column, type DataTableProps } from '@ynarcher/ui'
import {
  CHECKOUT_LABELS,
  abilityOf,
  overdueDays,
  todayKey,
} from '@/features/office/checkouts/checkoutConfig'
import type { Checkout } from '@/features/office/checkouts/checkoutsApi'

/** 행에 대고 할 수 있는 일. 무엇을 물어봐야 하는지는 부모가 정한다(반려 사유·반납 메모). */
export type CheckoutAction = 'APPROVE' | 'REJECT' | 'START' | 'RETURN' | 'CANCEL'

interface CheckoutsTableProps {
  rows: Checkout[]
  branchNameOf: (id: string | null) => string | null
  viewer: { id?: string; isManager: boolean }
  busy: boolean
  onAction: (row: Checkout, action: CheckoutAction) => void
  onRowClick: (row: Checkout) => void
  pagination: DataTableProps<Checkout>['pagination']
}

/** 날짜 셀. 자릿수가 흔들리지 않게 tabular-nums로 고정한다. */
function DateCell({ value }: { value: string | null }) {
  if (!value) return <EmptyValue />
  return <span className="tabular-nums text-gray-600">{value}</span>
}

/**
 * 반출 표 — 뷰(탭)가 무엇을 담을지 정하고, 표는 그것을 같은 모양으로 그린다.
 *
 * 상태는 배지로 칠하지 않고 글자로 적는다(자산 표와 같은 규칙). 이 표에서 색을 쓰는 곳은
 * 연체 하나뿐이며, 그래서 붉은 글씨가 보이면 그것이 연체라는 뜻이 된다 — 색을 여러 값에
 * 나눠 주면 어느 색도 경고가 되지 못한다.
 *
 * 표준 열(등록자·수정일)은 끈다. 등록자는 '반출자' 열이 이미 도메인 값으로 들고 있고,
 * 이 대장에서 날짜는 수정일이 아니라 반출일·반납일이다.
 */
export function CheckoutsTable({
  rows,
  branchNameOf,
  viewer,
  busy,
  onAction,
  onRowClick,
  pagination,
}: CheckoutsTableProps) {
  const today = todayKey()

  const columns: Column<Checkout>[] = [
    {
      key: 'assetName',
      header: '물품',
      primary: true,
      align: 'left',
      className: 'w-56',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate">{c.assetName}</p>
          {(c.assetItemType || c.assetSerialNo) && (
            <p className="truncate text-caption text-gray-500">
              {[c.assetItemType, c.assetSerialNo].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'branchId',
      header: '지사',
      className: 'w-24',
      render: (c) => branchNameOf(c.branchId) ?? <EmptyValue />,
    },
    {
      key: 'createdByName',
      header: '반출자',
      className: 'w-24',
      render: (c) => c.createdByName ?? <EmptyValue />,
    },
    {
      key: 'checkoutOn',
      header: '반출일',
      className: 'w-28',
      render: (c) => <DateCell value={c.checkoutOn} />,
    },
    {
      key: 'dueOn',
      header: '반납 예정',
      className: 'w-36',
      render: (c) => {
        const late = overdueDays(c, today)
        return (
          <span className="tabular-nums text-gray-600">
            {c.dueOn}
            {late > 0 && <b className="ml-1 font-semibold text-danger">{late}일 경과</b>}
          </span>
        )
      },
    },
    {
      key: 'returnedOn',
      header: '실제 반납',
      className: 'w-28',
      render: (c) => <DateCell value={c.returnedOn} />,
    },
    {
      key: 'status',
      header: '상태',
      className: 'w-24',
      render: (c) => CHECKOUT_LABELS[c.status],
    },
    {
      key: 'actions',
      header: '처리',
      className: 'w-40',
      render: (c) => {
        const can = abilityOf(c, viewer)
        // 버튼이 하나도 없는 행은 빈 칸으로 둔다 — 종결된 건에 회색 버튼을 남겨 두면
        // 누를 수 있는 것처럼 보인다.
        return (
          <div
            className="flex flex-wrap items-center gap-1"
            // 행 클릭(상세 열기)과 버튼이 겹친다 — 버튼 쪽 클릭은 여기서 멈춘다.
            onClick={(e) => e.stopPropagation()}
          >
            {can.canApprove && (
              <>
                <Button variant="outline" onClick={() => onAction(c, 'APPROVE')} disabled={busy}>
                  승인
                </Button>
                <Button
                  variant="outline"
                  className="text-danger hover:bg-danger-subtle hover:text-danger"
                  onClick={() => onAction(c, 'REJECT')}
                  disabled={busy}
                >
                  반려
                </Button>
              </>
            )}
            {can.canStart && (
              <Button variant="outline" onClick={() => onAction(c, 'START')} disabled={busy}>
                반출 시작
              </Button>
            )}
            {can.canReturn && (
              <Button variant="outline" onClick={() => onAction(c, 'RETURN')} disabled={busy}>
                반납
              </Button>
            )}
            {can.canCancel && (
              <Button variant="ghost" onClick={() => onAction(c, 'CANCEL')} disabled={busy}>
                취소
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
      rowKey={(c) => c.id}
      standardColumns={false}
      onRowClick={onRowClick}
      pagination={pagination}
      emptyText="조건에 맞는 반출 기록이 없습니다."
    />
  )
}
