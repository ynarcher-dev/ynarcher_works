import {
  Badge,
  DataTable,
  EmptyValue,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import {
  bankLabel,
  PARTNER_TYPE_LABELS,
} from '@/features/management/partners/config'
import { formatRegistrationNo } from '@/features/management/partners/partnerForm'
import type { TradePartner } from '@/features/management/partners/partnersApi'

interface PartnersTableProps {
  rows: TradePartner[]
  selectedKeys: string[]
  onSelectionChange: (keys: string[]) => void
  onRowClick: (row: TradePartner) => void
  pagination: DataTableProps<TradePartner>['pagination']
}

/** 첨부된 서류를 한 칸에 적는다 — 두 열로 나누면 '없음'이 두 번 반복될 뿐이다. */
function docsText(p: TradePartner): string[] {
  const names: string[] = []
  if (p.licensePath) names.push(p.partnerType === 'CORPORATE' ? '등록증' : '신분증')
  if (p.bankbookPath) names.push('통장')
  return names
}

/**
 * 거래처 표 — 코드 순으로 늘어놓는다(코드가 곧 등록 순서다).
 *
 * 등록번호는 구분에 따라 표기가 갈린다(법인 `123-45-67890` / 개인 `1990-01-01`). 원장에는
 * 숫자만 담겨 있고 꾸미는 일은 여기서 한 번만 한다 — 표기를 저장하면 같은 번호가 두 모양으로
 * 갈려 중복을 셀 수 없다.
 *
 * 은행·계좌번호·예금주는 이웃한 세 열이다. 셋이 함께 있어야 이체 한 건이 성립하므로, 한 칸에
 * 붙여 적지 않고 나란히 두어 어느 값이 비었는지가 한눈에 보이게 한다.
 *
 * 생성자 열은 두지 않는다(관리 축은 '지금 이 거래처와 거래하는가'이고 등록한 사람이 아니다).
 * 관리 열도 두지 않는다 — 사용 여부 전환은 행을 열어 확인한 뒤(폼) 또는 체크박스로 골라
 * 한 번에(선택 요약 줄) 한다.
 */
export function PartnersTable({
  rows,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  pagination,
}: PartnersTableProps) {
  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<TradePartner>[] = [
    {
      key: 'code',
      header: '코드',
      type: 'code',
      render: (p) => <span className="tabular-nums text-gray-600">{p.code}</span>,
    },
    {
      key: 'name',
      header: '거래처명',
      primary: true,
      type: 'name',
      render: (p) => p.name,
    },
    {
      key: 'partnerType',
      header: '구분',
      type: 'code',
      render: (p) => PARTNER_TYPE_LABELS[p.partnerType],
    },
    {
      key: 'registrationNo',
      header: '사업자등록번호(생년월일)',
      type: 'text',
      render: (p) => {
        const v = formatRegistrationNo(p.partnerType, p.registrationNo)
        return v ? <span className="tabular-nums text-gray-600">{v}</span> : <EmptyValue />
      },
    },
    {
      key: 'bank',
      header: '은행명',
      type: 'text',
      render: (p) => bankLabel(p.bankCode) ?? <EmptyValue />,
    },
    {
      key: 'accountNo',
      header: '계좌번호',
      type: 'text',
      render: (p) =>
        p.accountNo ? (
          <span className="tabular-nums text-gray-600">{p.accountNo}</span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      key: 'accountHolder',
      header: '예금주',
      type: 'person',
      render: (p) => p.accountHolder ?? <EmptyValue />,
    },
    {
      key: 'docs',
      header: '서류',
      type: 'code',
      render: (p) => {
        const names = docsText(p)
        return names.length ? names.join('·') : <EmptyValue />
      },
    },
    // 사용 여부는 이 목록에서 유일한 상태값이라 배지로 칠한다 — 대등한 분류가 아니라
    // '지금 쓰는가'의 한 축이고, 중단된 거래처가 눈에 띄어야 지급 대상을 잘못 고르지 않는다.
    {
      key: 'isActive',
      header: '사용 여부',
      type: 'badge',
      render: (p) =>
        p.isActive ? <Badge tone="success">사용</Badge> : <Badge tone="neutral">중단</Badge>,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      showAuthor={false}
      showManageColumn={false}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      pagination={pagination}
      emptyText="조건에 맞는 거래처가 없습니다."
    />
  )
}
