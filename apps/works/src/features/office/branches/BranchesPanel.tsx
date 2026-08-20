import { DataTable, EmptyValue, PageHeader, Spinner, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { BranchDetailModal } from '@/features/office/branches/BranchDetailModal'
import { useBranchMemberEntries } from '@/features/office/branches/branchMembers'
import { useBranches, type Branch } from '@/features/office/branches/branchesApi'

/**
 * OFFICE 지사 정보(조회 전용). 표는 지사명·주소·전화번호만 두고, 상주인력을 포함한 전체 항목은
 * 행을 눌러 여는 상세 모달에서 순서대로 확인한다(상주인력이 늘어도 표 폭이 흔들리지 않게 한다).
 * 원장은 ADMIN '지사 관리'가 소유하며, 여기서는 확인만 한다(회의록 등 다른 목록과 같은 표 규격).
 */
export function BranchesPanel() {
  const branchesQuery = useBranches()
  const branches = branchesQuery.data ?? []
  const { entriesOf } = useBranchMemberEntries()
  const [current, setCurrent] = useState<Branch | null>(null)

  // 폭·정렬은 열마다의 종류(type)가 정한다(2026-08 디자인 리프레시, ADMIN 지사 관리와 동일 규격).
  const columns: Column<Branch>[] = [
    { key: 'name', header: '지사명', primary: true, type: 'name', render: (b) => b.name },
    { key: 'address', header: '주소', type: 'long', render: (b) => b.address ?? <EmptyValue /> },
    {
      key: 'phone',
      header: '전화번호',
      type: 'text',
      render: (b) =>
        b.phone ? <span className="tabular-nums text-gray-600">{b.phone}</span> : <EmptyValue />,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="지사 정보" />
      {branchesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={branches}
          rowKey={(b) => b.id}
          numbered
          standardColumns={false}
          onRowClick={(b) => setCurrent(b)}
          emptyText="등록된 지사가 없습니다."
        />
      )}

      <BranchDetailModal
        branch={current}
        members={current ? entriesOf(current.id) : []}
        onClose={() => setCurrent(null)}
      />
    </div>
  )
}
