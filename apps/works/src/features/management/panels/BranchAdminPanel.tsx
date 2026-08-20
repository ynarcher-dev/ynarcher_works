import {
  Badge,
  Button,
  DataTable,
  EmptyValue,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
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
 * 회의실 예약의 지사 탭과 자산 반출대장의 지사 탭도 이 원장을 읽는다 — 회의실 자체(운영시간·슬롯)만
 * ADMIN '회의실 관리'가 소유한다. 지사를 비활성화하면 그 지사의 회의실 탭도 함께 사라진다
 * (회의실·예약 행은 지워지지 않으므로 재활성화하면 그대로 돌아온다).
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

  // 전환 후에는 폼을 닫는다 — 폼이 들고 있는 지사는 열 때의 스냅샷이라, 열어 둔 채로는
  // 버튼 라벨이 방금 만든 상태와 어긋난다.
  const toggleActive = async (b: Branch) => {
    if (
      b.isActive &&
      !window.confirm(`'${b.name}' 지사를 비활성화하시겠습니까? OFFICE에서 숨겨집니다.`)
    )
      return
    try {
      await setActive.mutateAsync({ id: b.id, isActive: !b.isActive })
      toast.show(b.isActive ? '비활성화했습니다.' : '활성화했습니다.', 'success')
      setForm(null)
    } catch {
      toast.show('변경에 실패했습니다.', 'danger')
    }
  }

  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
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
    {
      key: 'members',
      header: '상주인력',
      type: 'long',
      render: (b) => {
        const names = namesOf(b.id)
        return names.length > 0 ? names.join(', ') : <EmptyValue />
      },
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      render: (b) =>
        b.isActive ? <Badge tone="success">활성</Badge> : <Badge tone="neutral">비활성</Badge>,
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        {/* 문구는 `{대상 명사} 등록` 규칙(구 '지사 추가'). */}
        <Button onClick={() => setForm('create')}>지사 등록</Button>
      </div>

      {branchesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        // 행을 누르면 그 지사를 연다 — 확인과 수정이 같은 화면이라 '수정' 열을 따로 두지 않는다.
        <DataTable
          columns={columns}
          rows={branches}
          rowKey={(b) => b.id}
          numbered
          standardColumns={false}
          onRowClick={(b) => setForm(b)}
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
        onToggleActive={editing ? () => void toggleActive(editing) : undefined}
      />
    </div>
  )
}
