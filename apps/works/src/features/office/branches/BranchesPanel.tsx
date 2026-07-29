import { DataTable, PageHeader, Spinner, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { BranchDetailModal } from '@/features/office/branches/BranchDetailModal'
import { useBranchMemberNames } from '@/features/office/branches/branchMembers'
import { useBranches, type Branch } from '@/features/office/branches/branchesApi'

/**
 * OFFICE 지사 정보(조회 전용). 표는 지사명·주소·전화번호만 두고, 배정인력을 포함한 전체 항목은
 * 행을 눌러 여는 상세 모달에서 순서대로 확인한다(배정인력이 늘어도 표 폭이 흔들리지 않게 한다).
 * 원장은 ADMIN '지사 관리'가 소유하며, 여기서는 확인만 한다(회의록 등 다른 목록과 같은 표 규격).
 */
export function BranchesPanel() {
  const branchesQuery = useBranches()
  const branches = branchesQuery.data ?? []
  const { namesOf } = useBranchMemberNames()
  // 모달은 목록 순서(index)로 연다 — 지사 id로 잡으면 이전·다음 이동에서 위치를 다시 찾아야 한다.
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const current = openIndex !== null ? branches[openIndex] ?? null : null

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
          onRowClick={(b) => setOpenIndex(branches.findIndex((x) => x.id === b.id))}
          emptyText="등록된 지사가 없습니다."
        />
      )}

      <BranchDetailModal
        branch={current}
        memberNames={current ? namesOf(current.id) : []}
        index={(openIndex ?? 0) + 1}
        total={branches.length}
        onClose={() => setOpenIndex(null)}
        onPrev={
          openIndex !== null && openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined
        }
        onNext={
          openIndex !== null && openIndex < branches.length - 1
            ? () => setOpenIndex(openIndex + 1)
            : undefined
        }
      />
    </div>
  )
}
