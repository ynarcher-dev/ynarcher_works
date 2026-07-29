import { Badge, Button, DataTable, Spinner, useToast, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { BranchFormModal } from '@/features/management/panels/BranchFormModal'
import { useBranchMemberNames } from '@/features/office/branches/branchMembers'
import {
  useBranches,
  useCreateBranch,
  useSetBranchActive,
  useUpdateBranch,
  type Branch,
  type BranchInput,
} from '@/features/office/branches/branchesApi'

/**
 * MANAGEMENT 지사 관리: 지사 목록(지사명·주소·전화번호·상주인력) + 생성/수정/비활성화.
 * 여기가 지사 원장의 단일 세팅 지점이며, OFFICE '지사 정보'가 이를 소비한다.
 * 회의실 예약의 지점 탭은 이 원장과 연동하지 않는다(ADMIN '회의실 관리'가 소유하는 meeting_places).
 * 쓰기는 RLS(`branches_insert`/`branches_update`)가 관리자만 허용하므로 화면 노출과 무관하게 서버가 막는다.
 */
export function BranchAdminPanel() {
  const toast = useToast()
  const branchesQuery = useBranches(true)
  const branches = branchesQuery.data ?? []
  const { namesOf, idsOf } = useBranchMemberNames()

  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const setActive = useSetBranchActive()

  const [form, setForm] = useState<'create' | Branch | null>(null)
  const editing = form && form !== 'create' ? form : undefined
  const busy = createBranch.isPending || updateBranch.isPending

  const submit = async (v: BranchInput) => {
    try {
      if (editing) {
        await updateBranch.mutateAsync({ ...v, id: editing.id })
        toast.show('지사를 수정했습니다.', 'success')
      } else {
        await createBranch.mutateAsync(v)
        toast.show('지사를 추가했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const toggleActive = async (b: Branch) => {
    if (
      b.isActive &&
      !window.confirm(`'${b.name}' 지사를 비활성화하시겠습니까? OFFICE에서 숨겨집니다.`)
    )
      return
    try {
      await setActive.mutateAsync({ id: b.id, isActive: !b.isActive })
      toast.show(b.isActive ? '비활성화했습니다.' : '활성화했습니다.', 'success')
    } catch {
      toast.show('변경에 실패했습니다.', 'danger')
    }
  }

  const columns: Column<Branch>[] = [
    { key: 'name', header: '지사명', primary: true, className: 'w-56', render: (b) => b.name },
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
      header: '상주인력',
      className: 'w-56',
      render: (b) => {
        const names = namesOf(b.id)
        return names.length > 0 ? names.join(', ') : '—'
      },
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      className: 'w-20',
      render: (b) =>
        b.isActive ? <Badge tone="success">활성</Badge> : <Badge tone="neutral">비활성</Badge>,
    },
    {
      key: 'action',
      header: '관리',
      align: 'center',
      className: 'w-40',
      render: (b) => (
        <span className="flex items-center justify-center gap-1.5">
          <Button variant="outline" onClick={() => setForm(b)}>
            수정
          </Button>
          <Button variant="outline" onClick={() => void toggleActive(b)}>
            {b.isActive ? '비활성화' : '활성화'}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setForm('create')}>지사 추가</Button>
      </div>

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

      <BranchFormModal
        open={form !== null}
        branch={editing}
        memberIds={editing ? idsOf(editing.id) : []}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={submit}
      />
    </div>
  )
}
