import { DataTable, PageHeader, Spinner, type Column } from '@ynarcher/ui'
import { useBranchMemberNames } from '@/features/office/branches/branchMembers'
import { useBranches, type Branch } from '@/features/office/branches/branchesApi'

/**
 * OFFICE 지사 정보(조회 전용). 지사명·주소·전화번호·배정인력만 보여주는 리스트뷰다.
 * 원장은 ADMIN '지사 관리'가 소유하며, 여기서는 확인만 한다(회의록 등 다른 목록과 같은 표 규격).
 */
export function BranchesPanel() {
  const branchesQuery = useBranches()
  const branches = branchesQuery.data ?? []
  const { namesOf } = useBranchMemberNames()

  const columns: Column<Branch>[] = [
    { key: 'name', header: '지사명', primary: true, className: 'w-40', render: (b) => b.name },
    { key: 'address', header: '주소', render: (b) => b.address ?? '—' },
    {
      key: 'phone',
      header: '전화번호',
      align: 'center',
      className: 'w-36',
      render: (b) => <span className="tabular-nums text-gray-600">{b.phone ?? '—'}</span>,
    },
    {
      key: 'members',
      header: '배정인력',
      className: 'w-64',
      render: (b) => {
        const names = namesOf(b.id)
        return names.length > 0 ? names.join(', ') : '—'
      },
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
          emptyText="등록된 지사가 없습니다."
        />
      )}
    </div>
  )
}
