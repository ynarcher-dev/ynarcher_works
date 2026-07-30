import { Badge, DataTable, type Column, type DataTableProps } from '@ynarcher/ui'
import {
  ACQUISITION_LABELS,
  ASSET_LABELS,
  assetTone,
} from '@/features/management/config'
import { formatAmount } from '@/features/management/assets/assetForm'
import { annualizedAmount, formatCycleAmount } from '@/features/management/assets/assetCost'
import type { Asset } from '@/features/management/assets/assetsApi'

interface AssetsTableProps {
  rows: Asset[]
  /** 할당 대상 id → 이름. 목록에는 이름만 적는다(연락처·이메일은 노출하지 않는다). */
  nameOf: (id: string | null) => string
  selectedKeys: string[]
  onSelectionChange: (keys: string[]) => void
  onRowClick: (row: Asset) => void
  pagination: DataTableProps<Asset>['pagination']
}

/**
 * 자산 표 — 지사 안에서 자산명 순으로 늘어놓는다.
 *
 * 금액 열은 주기까지 함께 적는다('55,000/월') — 숫자만 적으면 완납가와 구독료가 같은 크기로
 * 읽혀 합계는 물론 눈대중도 틀린다. 그 옆 연 환산 열이 주기가 다른 자산을 한 자로 비교해 준다.
 *
 * 등록자 열은 두지 않는다(원장에 created_by가 없고, 관리 축은 '지금 누구에게 있는가'다).
 * 관리 열도 두지 않는다 — 비활성화는 행을 열어 내용을 확인한 뒤(모달 푸터) 또는 체크박스로 골라
 * 한 번에(선택 요약 줄) 한다. 열이 이미 많은 표에서 행마다 버튼을 세워 두면 스치듯 눌리기 쉽고,
 * 무엇을 지우는지 보지 않은 채 지우게 된다.
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
      render: (a) => <span className="tabular-nums text-gray-600">{a.serialNo ?? '—'}</span>,
    },
    { key: 'itemType', header: '품목', className: 'w-24', render: (a) => a.itemType ?? '—' },
    {
      key: 'acquisitionType',
      header: '분류',
      className: 'w-20',
      render: (a) => ACQUISITION_LABELS[a.acquisitionType],
    },
    {
      key: 'status',
      header: '상태',
      className: 'w-24',
      render: (a) => <Badge tone={assetTone[a.status]}>{ASSET_LABELS[a.status]}</Badge>,
    },
    {
      key: 'assignedTo',
      header: '할당 대상',
      className: 'w-24',
      render: (a) => nameOf(a.assignedTo),
    },
    {
      key: 'amount',
      header: '금액',
      align: 'right',
      numeric: true,
      className: 'w-28',
      render: (a) => formatCycleAmount(a.amount, a.billingCycle),
    },
    {
      key: 'annualized',
      header: '연 환산',
      align: 'right',
      numeric: true,
      className: 'w-28',
      render: (a) => formatAmount(annualizedAmount(a)),
    },
    {
      key: 'acquiredOn',
      header: '취득일자',
      className: 'w-24',
      render: (a) => <span className="tabular-nums text-gray-600">{a.acquiredOn ?? '—'}</span>,
    },
    {
      key: 'returnDue',
      header: '만료일',
      className: 'w-24',
      render: (a) => <span className="tabular-nums text-gray-600">{a.returnDue ?? '—'}</span>,
    },
    {
      key: 'disposedOn',
      header: '폐기일자',
      className: 'w-24',
      render: (a) => <span className="tabular-nums text-gray-600">{a.disposedOn ?? '—'}</span>,
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
    // 자산명 열을 고정하지 않는다 — 고정은 가로 스크롤이 있을 때 식별 열을 붙잡아 두려는 것이고,
    // 그 대가로 경계에 그림자가 깔린다. 관리 열을 뺀 뒤로는 표가 한 화면에 들어가므로
    // 붙잡을 것이 없고 그림자만 남는다.
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
