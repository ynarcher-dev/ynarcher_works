import {
  DataTable,
  EmptyValue,
  pinMark,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import type { PortableAsset } from '@/features/office/assets/portableAssetsApi'

interface PortableAssetsTableProps {
  rows: PortableAsset[]
  /** 사용자 id → 이름(없으면 빈 칸). 관리자 칸이 쓴다. */
  nameOf: (id: string | null) => string | null
  onOpen: (asset: PortableAsset) => void
  pagination: DataTableProps<PortableAsset>['pagination']
}

/**
 * 공용 물품 표 — **조회 전용**이다.
 *
 * 한 줄이 답하는 것은 셋이다: 어떤 물건인가(이름·품목·시리얼), 몇 개 있나, 누구에게 물어보나.
 * 사진과 설명은 물건을 눌러 모달에서 본다 — 목록에서 답해야 할 것은 "그런 물건이 회사에
 * 있나"이고, 썸네일은 그 답과 무관하면서 행마다 가장 눈에 띄는 자리를 차지한다.
 *
 * 관리 열이 없다. 물품의 등록·수정·폐기는 MANAGEMENT `자산 관리`가 소유하며 이 화면은
 * 읽기만 한다(2026-08-25 결정 — 예약·반출 흐름 폐지).
 */
export function PortableAssetsTable({
  rows,
  nameOf,
  onOpen,
  pagination,
}: PortableAssetsTableProps) {
  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<PortableAsset>[] = [
    { key: 'name', header: '물품', primary: true, type: 'name', render: (a) => a.name },
    {
      key: 'itemType',
      header: '품목',
      type: 'text',
      render: (a) => a.itemType ?? <EmptyValue />,
    },
    {
      key: 'serialNo',
      header: '시리얼 번호',
      type: 'text',
      render: (a) => a.serialNo ?? <EmptyValue />,
    },
    {
      key: 'quantity',
      header: '보유',
      type: 'count',
      render: (a) => <span className="tabular-nums">{a.quantity}</span>,
    },
    // 관리자는 MANAGEMENT 자산 관리에서 지정한 사람이다 — 이 물건을 쓰려면 물어볼 상대이므로
    // 줄의 끝에 둔다.
    {
      key: 'manager',
      header: '관리자',
      type: 'person',
      render: (a) => nameOf(a.managerId) ?? <EmptyValue />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(a) => a.id}
      standardColumns={false}
      onRowClick={onOpen}
      // 중요 물품은 이름 순을 건너뛰고 맨 위에 서므로 순번이 뜻을 잃는다 — 번호 자리를 핀에 준다.
      meta={{ rowMark: (a) => pinMark(a.isPinned) }}
      pagination={pagination}
      emptyText="조건에 맞는 물품이 없습니다."
    />
  )
}
