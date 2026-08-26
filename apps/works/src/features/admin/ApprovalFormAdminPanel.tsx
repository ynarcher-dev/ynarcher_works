import { Badge, Button, DataTable, Spinner, useToast, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { ApprovalFormModal, type ApprovalFormSubmit } from '@/features/admin/ApprovalFormModal'
import { useApprovalForms, type ApprovalForm } from '@/features/approval/approvalApi'
import {
  parseFields,
  primaryAmountLabel,
} from '@/features/approval/fields'
import {
  useCreateApprovalForm,
  useSetApprovalFormActive,
  useUpdateApprovalForm,
} from '@/features/approval/formsAdminApi'

/**
 * 결재 양식 관리(ADMIN) — 전자결재가 무엇을 입력받을지 정하는 곳.
 *
 * 양식은 필드 정의 목록이고 문서는 그 값이다. 그래서 여기서 금액을 금액 타입으로 잡아 두면
 * 나중에 사람이 문서를 열어 옮겨 적지 않아도 집계 화면이 답한다.
 *
 * 필드 스키마를 고치면 새 버전이 발행되고 이미 쓴 문서는 자기 기안 시점 버전을 계속 본다 —
 * 그래서 양식을 고쳐도 과거 문서가 깨지지 않는다.
 */
export function ApprovalFormAdminPanel() {
  const toast = useToast()
  const { data: forms, isLoading } = useApprovalForms()
  const create = useCreateApprovalForm()
  const update = useUpdateApprovalForm()
  const setActive = useSetApprovalFormActive()

  // 모달 상태: null이면 닫힘, 'create'면 신규, 양식이면 그 양식 수정.
  const [form, setForm] = useState<'create' | ApprovalForm | null>(null)
  const editing = form && form !== 'create' ? form : undefined

  const submit = async (v: ApprovalFormSubmit) => {
    const meta = {
      name: v.name,
      abbrev: v.abbrev,
      retention: v.retention,
      security_grade: v.security_grade,
      sort_order: v.sort_order,
    }
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          meta,
          // 스키마가 그대로면 새 버전을 만들지 않는다(이름만 고쳤는데 버전이 올라가면
          // 버전 목록이 의미를 잃는다).
          fields: v.schemaChanged ? v.fields : undefined,
          latestVersionNo: editing.current_version?.version_no ?? 0,
        })
        toast.show(v.schemaChanged ? '새 버전을 발행했습니다.' : '양식을 수정했습니다.', 'success')
      } else {
        await create.mutateAsync({ ...meta, fields: v.fields })
        toast.show('양식을 등록했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 약칭 중복·권한을 확인하세요.', 'danger')
    }
  }

  const toggleActive = (row: ApprovalForm) => {
    if (row.is_active && !window.confirm(`'${row.name}' 양식을 비활성화하시겠습니까?`)) return
    setActive.mutate(
      { id: row.id, isActive: !row.is_active },
      {
        onSuccess: () =>
          toast.show(row.is_active ? '비활성화했습니다.' : '활성화했습니다.', 'success'),
        onError: () => toast.show('변경에 실패했습니다.', 'danger'),
      },
    )
  }

  const columns: Column<ApprovalForm>[] = [
    { key: 'name', header: '양식명', type: 'name', primary: true, render: (r) => r.name },
    { key: 'abbrev', header: '번호 약칭', type: 'text', render: (r) => r.abbrev },
    {
      key: 'fields',
      header: '필드',
      type: 'count',
      render: (r) => parseFields(r.current_version?.fields).length,
    },
    {
      key: 'amount',
      header: '대표 금액',
      type: 'text',
      render: (r) => primaryAmountLabel(parseFields(r.current_version?.fields)) ?? '-',
    },
    {
      key: 'version',
      header: '버전',
      type: 'count',
      render: (r) => r.current_version?.version_no ?? '-',
    },
    {
      key: 'active',
      header: '상태',
      type: 'badge',
      render: (r) => (
        <Badge tone={r.is_active ? 'success' : 'neutral'}>{r.is_active ? '사용' : '중지'}</Badge>
      ),
    },
    {
      key: 'action',
      header: '관리',
      align: 'center',
      render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" density="table" onClick={() => setForm(r)}>
            수정
          </Button>
          <Button variant="ghost" density="table" onClick={() => toggleActive(r)}>
            {r.is_active ? '비활성화' : '활성화'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setForm('create')}>결재 양식 등록</Button>
      </div>

      {isLoading && !forms ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={forms ?? []}
          rowKey={(r) => r.id}
          numbered
          standardColumns={false}
          emptyText="등록된 결재 양식이 없습니다."
        />
      )}

      <ApprovalFormModal
        open={form !== null}
        form={editing}
        onClose={() => setForm(null)}
        onSubmit={submit}
      />
    </div>
  )
}
