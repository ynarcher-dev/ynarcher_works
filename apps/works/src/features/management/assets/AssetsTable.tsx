import { Badge, DataTable, EmptyValue, type Column, type DataTableProps } from '@ynarcher/ui'
import {
  ACQUISITION_LABELS,
  ASSET_LABELS,
  BILLING_LABELS,
} from '@/features/management/config'
import { formatAmount } from '@/features/management/assets/assetForm'
import type { Asset } from '@/features/management/assets/assetsApi'

interface AssetsTableProps {
  rows: Asset[]
  /**
   * 할당 대상 id → 이름. 목록에는 이름만 적는다(연락처·이메일은 노출하지 않는다).
   * 할당 대상이 없으면 `null`이며, 빈 칸 표기는 표가 정한다.
   */
  nameOf: (id: string | null) => string | null
  selectedKeys: string[]
  onSelectionChange: (keys: string[]) => void
  onRowClick: (row: Asset) => void
  pagination: DataTableProps<Asset>['pagination']
}

/** 날짜 셀. 자릿수가 흔들리지 않게 tabular-nums로 고정한다. */
function DateCell({ value }: { value: string | null }) {
  if (!value) return <EmptyValue />
  return <span className="tabular-nums text-gray-600">{value}</span>
}

/**
 * 자산 표 — 지사 안에서 자산명 순으로 늘어놓는다.
 *
 * 금액과 결제 주기는 이웃한 두 열이다. 한 칸에 '55,000/월'로 붙여 적으면 금액 열의 숫자가
 * 서로 다른 자를 쓰게 되어 세로로 훑을 수 없다 — 주기를 옆 칸으로 빼면 금액 열은 숫자만 남고,
 * 그 숫자가 무엇인지는 바로 옆에서 읽힌다.
 *
 * 만료일과 폐기일자는 한 열이다. 둘 다 "이 자산이 끝나는 날"이고 한 자산에 동시에 성립하지
 * 않으므로, 열을 나누면 어느 쪽이든 늘 절반이 비어 있게 된다. 그 날이 예정인지 사실인지는
 * 바로 왼쪽 상태 열이 이미 말하고 있다.
 *
 * 등록자 열은 두지 않는다(원장에 created_by가 없고, 관리 축은 '지금 누구에게 있는가'다).
 * 관리 열도 두지 않는다 — 비활성화는 행을 열어 내용을 확인한 뒤(모달 푸터) 또는 체크박스로 골라
 * 한 번에(선택 요약 줄) 한다.
 */
export function AssetsTable({
  rows,
  nameOf,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  pagination,
}: AssetsTableProps) {
  const columns: Column<Asset>[] = [
    {
      key: 'name',
      header: '자산명',
      primary: true,
      align: 'left',
      className: 'w-52',
      render: (a) => a.name,
    },
    {
      key: 'serialNo',
      header: '시리얼 번호',
      className: 'w-32',
      render: (a) =>
        a.serialNo ? (
          <span className="tabular-nums text-gray-600">{a.serialNo}</span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      key: 'itemType',
      header: '품목',
      className: 'w-24',
      render: (a) => a.itemType ?? <EmptyValue />,
    },
    {
      key: 'acquisitionType',
      header: '분류',
      className: 'w-20',
      render: (a) => ACQUISITION_LABELS[a.acquisitionType],
    },
    // 상태는 네 값이 대등한 분류라 배지로 칠하지 않는다(색을 입히면 없는 위계가 생긴다).
    {
      key: 'status',
      header: '상태',
      className: 'w-20',
      render: (a) => ASSET_LABELS[a.status],
    },
    {
      key: 'assignedTo',
      header: '할당',
      className: 'w-24',
      render: (a) => nameOf(a.assignedTo) ?? <EmptyValue />,
    },
    {
      key: 'amount',
      header: '금액',
      align: 'right',
      numeric: true,
      className: 'w-28',
      render: (a) => (a.amount == null ? <EmptyValue /> : formatAmount(a.amount)),
    },
    {
      key: 'billingCycle',
      header: '결제 주기',
      className: 'w-24',
      render: (a) => BILLING_LABELS[a.billingCycle],
    },
    {
      key: 'acquiredOn',
      header: '취득일자',
      className: 'w-28',
      render: (a) => <DateCell value={a.acquiredOn} />,
    },
    {
      key: 'endsOn',
      header: '만료(폐기)일자',
      className: 'w-28',
      render: (a) => <DateCell value={a.disposedOn ?? a.returnDue} />,
    },
    {
      key: 'isPortable',
      header: '반출',
      className: 'w-20',
      render: (a) =>
        a.isPortable ? <Badge tone="info">가능</Badge> : <Badge tone="neutral">불가</Badge>,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(a) => a.id}
      showAuthor={false}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      pagination={pagination}
      // 목록에 관리 액션이 없으므로 열 자체를 없앤다(자리만 남겨 빈 열을 만들지 않는다).
      showManageColumn={false}
      emptyText="조건에 맞는 자산이 없습니다."
    />
  )
}
