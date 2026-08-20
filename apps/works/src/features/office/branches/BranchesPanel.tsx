import { DataTable, EmptyValue, Input, PageHeader, Spinner, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { BranchDetailModal } from '@/features/office/branches/BranchDetailModal'
import { useBranchMemberEntries } from '@/features/office/branches/branchMembers'
import { useBranches, type Branch } from '@/features/office/branches/branchesApi'

/** 회의록 목록과 같은 한 페이지 분량(OFFICE 조회 목록 공통). */
const PAGE_SIZE = 15

/** 검색은 표에 보이는 세 열(지사명·주소·전화번호)만 훑는다 — 결과와 화면이 어긋나지 않게 한다. */
function matchesKeyword(b: Branch, kw: string): boolean {
  const q = kw.trim().toLowerCase()
  if (!q) return true
  return [b.name, b.address, b.phone].some((v) => (v ?? '').toLowerCase().includes(q))
}

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
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  const filtered = branches.filter((b) => matchesKeyword(b, keyword))
  // 검색으로 목록이 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 클램프한다.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // 폭·정렬은 열마다의 종류(type)가 정한다(2026-08 디자인 리프레시, ADMIN 지사 관리와 동일 규격).
  const columns: Column<Branch>[] = [
    { key: 'name', header: '지사명', primary: true, type: 'name', render: (b) => b.name },
    { key: 'address', header: '주소', type: 'long', render: (b) => b.address ?? <EmptyValue /> },
    {
      key: 'phone',
      header: '전화번호',
      type: 'text',
      render: (b) =>
        b.phone ? <span className="tabular-nums">{b.phone}</span> : <EmptyValue />,
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="지사 정보"
        search={
          <Input
            placeholder="지사명·주소·전화번호 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />
      {branchesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(b) => b.id}
          numbered
          standardColumns={false}
          onRowClick={(b) => setCurrent(b)}
          emptyText={keyword.trim() ? '검색 결과가 없습니다.' : '등록된 지사가 없습니다.'}
          pagination={{
            page: safePage,
            pageSize: PAGE_SIZE,
            total: filtered.length,
            totalAll: branches.length,
            onChange: setPage,
          }}
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
