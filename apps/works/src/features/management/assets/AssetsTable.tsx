import { Badge, DataTable, EmptyValue, pinMark, type Column, type DataTableProps } from '@ynarcher/ui'
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
   * 사용자 id → 이름(관리자·할당 대상). 목록에는 이름만 적는다(연락처·이메일은 노출하지 않는다).
   * 지정된 사람이 없으면 `null`이며, 빈 칸 표기는 표가 정한다.
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
  // 폭·정렬·수치서식은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<Asset>[] = [
    {
      key: 'name',
      header: '자산명',
      primary: true,
      type: 'name',
      render: (a) => a.name,
    },
    {
      key: 'serialNo',
      header: '시리얼 번호',
      type: 'text',
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
      type: 'text',
      render: (a) => a.itemType ?? <EmptyValue />,
    },
    // 수량은 1이 대부분이라 굳이 강조하지 않는다 — 1보다 클 때만 눈에 들어오면 된다.
    {
      key: 'quantity',
      header: '수량',
      type: 'count',
      render: (a) => a.quantity,
    },
    {
      key: 'acquisitionType',
      header: '분류',
      // 구매·리스·렌탈·기타 네 값. 선택지가 정해진 값은 고정폭으로 세운다.
      type: 'code',
      render: (a) => ACQUISITION_LABELS[a.acquisitionType],
    },
    // 상태는 네 값이 대등한 분류라 배지로 칠하지 않는다(색을 입히면 없는 위계가 생긴다).
    {
      key: 'status',
      header: '상태',
      type: 'code',
      render: (a) => ASSET_LABELS[a.status],
    },
    // 관리자와 할당은 이웃한 두 열이다 — 맡은 사람과 쓰는 사람이 한눈에 갈려야 한다.
    {
      key: 'managerId',
      header: '관리자',
      type: 'person',
      render: (a) => nameOf(a.managerId) ?? <EmptyValue />,
    },
    {
      key: 'assignedTo',
      header: '할당',
      type: 'person',
      render: (a) => nameOf(a.assignedTo) ?? <EmptyValue />,
    },
    {
      key: 'amount',
      header: '금액',
      type: 'money',
      render: (a) => (a.amount == null ? <EmptyValue /> : formatAmount(a.amount)),
    },
    {
      key: 'billingCycle',
      header: '결제 주기',
      type: 'code',
      render: (a) => BILLING_LABELS[a.billingCycle],
    },
    {
      key: 'acquiredOn',
      header: '취득일자',
      type: 'date',
      render: (a) => <DateCell value={a.acquiredOn} />,
    },
    {
      key: 'endsOn',
      header: '만료(폐기)일자',
      type: 'date',
      render: (a) => <DateCell value={a.disposedOn ?? a.returnDue} />,
    },
    // 승인 필요는 반출 가능의 하위 값이라 열을 나누지 않는다 — 나누면 '불가'인 행에 늘 빈 칸이
    // 하나 더 생기고, 두 칸을 함께 읽어야 뜻이 서는 값이 된다.
    {
      key: 'isPortable',
      header: '반출',
      type: 'badge',
      render: (a) =>
        !a.isPortable ? (
          <Badge tone="neutral">불가</Badge>
        ) : a.requiresApproval ? (
          <Badge tone="warning">승인 필요</Badge>
        ) : (
          <Badge tone="info">가능</Badge>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(a) => a.id}
      showAuthor={false}
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      // 중요 자산은 정렬을 건너뛰고 맨 위에 서므로 순번이 뜻을 잃는다 — 번호 자리를 핀에 준다.
      meta={{ rowMark: (a) => pinMark(a.isPinned) }}
      pagination={pagination}
      // 목록에 관리 액션이 없으므로 열 자체를 없앤다(자리만 남겨 빈 열을 만들지 않는다).
      showManageColumn={false}
      emptyText="조건에 맞는 자산이 없습니다."
    />
  )
}
