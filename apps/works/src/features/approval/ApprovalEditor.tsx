import {
  BackButton,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { ApprovalFieldsForm } from '@/features/approval/ApprovalFieldsForm'
import { ApprovalLinePicker } from '@/features/approval/ApprovalLinePicker'
import { useApprovalForms, useCreateApproval } from '@/features/approval/approvalApi'
import { APPROVAL_ATTACHMENT_TYPE } from '@/features/approval/config'
import {
  emptyValues,
  formatMoney,
  missingRequired,
  parseFields,
  primaryAmount,
  primaryAmountLabel,
  pruneValues,
  type FieldValues,
} from '@/features/approval/fields'
import { useEmployees } from '@/features/management/hooks'

interface ApprovalEditorProps {
  onSaved: (id: string) => void
  onCancel: () => void
}

/**
 * 기안 작성 — 양식 선택 → 그 양식이 정한 필드 입력 → 결재선·참조 지정 → 상신.
 *
 * 양식을 고르는 것이 첫 걸음인 이유는, 이 화면이 무엇을 입력받을지 화면이 아니라 양식이
 * 정하기 때문이다. 양식을 바꾸면 입력 값을 초기화한다 — 필드 키가 달라 이전 값을 그대로
 * 옮기면 어느 칸에 들어가야 할지 알 수 없는 값이 남는다.
 *
 * 문서 번호·대표 금액·완료 일시는 DB 트리거가 채운다. 화면은 값만 보내고 계산하지 않는다.
 */
export function ApprovalEditor({ onSaved, onCancel }: ApprovalEditorProps) {
  const toast = useToast()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: forms, isLoading } = useApprovalForms()
  const { data: employees } = useEmployees()
  const create = useCreateApproval()
  const pending = usePendingMaterials()

  const activeForms = useMemo(() => (forms ?? []).filter((f) => f.is_active), [forms])
  const [formId, setFormId] = useState('')
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<FieldValues>({})
  const [approverIds, setApproverIds] = useState<string[]>([])
  const [recipientIds, setRecipientIds] = useState<string[]>([])

  const form = activeForms.find((f) => f.id === formId) ?? null
  const fields = useMemo(() => parseFields(form?.current_version?.fields), [form])

  const myDeptId = useMemo(
    () => (employees ?? []).find((e) => e.id === uid)?.department_id ?? null,
    [employees, uid],
  )

  const selectForm = (id: string) => {
    setFormId(id)
    const next = activeForms.find((f) => f.id === id)
    setValues(emptyValues(parseFields(next?.current_version?.fields)))
  }

  const amount = primaryAmount(fields, values)
  const amountLabel = primaryAmountLabel(fields)

  const submit = async (asDraft: boolean) => {
    if (!form || !form.current_version_id) {
      toast.show('문서 양식을 고르세요.', 'warning')
      return
    }
    if (!title.trim()) {
      toast.show('제목을 입력하세요.', 'warning')
      return
    }
    // 임시저장은 아직 조직에 내보내는 문서가 아니라 필수값·결재선을 강제하지 않는다.
    if (!asDraft) {
      const missing = missingRequired(fields, values)
      if (missing.length > 0) {
        toast.show(`필수 항목을 입력하세요: ${missing.join(', ')}`, 'warning')
        return
      }
      if (approverIds.length === 0) {
        toast.show('결재선을 한 명 이상 지정하세요.', 'warning')
        return
      }
    }

    try {
      const id = await create.mutateAsync({
        title: title.trim(),
        formId: form.id,
        formVersionId: form.current_version_id,
        fieldValues: pruneValues(fields, values),
        departmentId: myDeptId,
        approverIds,
        recipientIds,
        asDraft,
      })
      // 첨부는 문서가 생긴 뒤에야 붙일 수 있다(attachments.target_id NOT NULL).
      if (pending.count > 0) await pending.flush(id, () => APPROVAL_ATTACHMENT_TYPE)
      toast.show(asDraft ? '임시저장했습니다.' : '문서를 상신했습니다.', 'success')
      onSaved(id)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  if (isLoading && !forms) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton onClick={onCancel}>문서함</BackButton>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void submit(true)} disabled={create.isPending}>
            임시저장
          </Button>
          <Button onClick={() => void submit(false)} disabled={create.isPending}>
            상신
          </Button>
        </div>
      </div>

      <PageHeader title="기안 작성" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="문서 정보">
            <div className="space-y-4">
              <Field label="문서 양식" required>
                <Select value={formId} onChange={(e) => selectForm(e.target.value)}>
                  <option value="">양식 선택</option>
                  {activeForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="제목" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </div>
          </Card>

          {form && (
            <Card
              title={form.name}
              subtitle={
                amountLabel
                  ? `${amountLabel}이(가) 이 문서의 금액으로 집계됩니다 — 현재 ${formatMoney(amount)}`
                  : undefined
              }
            >
              {fields.length === 0 ? (
                <p className="py-6 text-center text-body text-gray-500">
                  이 양식에 정의된 필드가 없습니다. ADMIN 결재 양식 관리에서 필드를 추가하세요.
                </p>
              ) : (
                <ApprovalFieldsForm fields={fields} values={values} onChange={setValues} />
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-1">
          <Card title="결재선">
            <ApprovalLinePicker
              approverIds={approverIds}
              onApproversChange={setApproverIds}
              recipientIds={recipientIds}
              onRecipientsChange={setRecipientIds}
              excludeId={uid}
            />
          </Card>
          <PendingMaterialPanel
            slot={APPROVAL_ATTACHMENT_TYPE}
            pending={pending}
            title="첨부 파일"
          />
        </div>
      </div>
    </div>
  )
}
