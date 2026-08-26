import { BackButton, Button, Card, Field, Input, Select, Spinner, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { ApprovalFieldsForm } from '@/features/approval/ApprovalFieldsForm'
import { ApprovalInfoTable } from '@/features/approval/ApprovalInfoTable'
import { ApprovalLinePicker } from '@/features/approval/ApprovalLinePicker'
import {
  EMPTY_LINES,
  groupFormsByCategory,
  useApprovalForms,
  useCreateApproval,
  type ApprovalLineInput,
} from '@/features/approval/approvalApi'
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
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'
import { useDepartments } from '@/features/management/orgHooks'

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
  const groups = useMemo(() => groupFormsByCategory(activeForms), [activeForms])

  const [category, setCategory] = useState('')
  const [formId, setFormId] = useState('')
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<FieldValues>({})
  const [lines, setLines] = useState<ApprovalLineInput>(EMPTY_LINES)
  const [recipientIds, setRecipientIds] = useState<string[]>([])

  const categoryForms = groups.find((g) => g.category === category)?.forms ?? []
  const form = activeForms.find((f) => f.id === formId) ?? null
  const fields = useMemo(() => parseFields(form?.current_version?.fields), [form])

  const me = useMemo(() => (employees ?? []).find((e) => e.id === uid) ?? null, [employees, uid])
  const myDeptId = me?.department_id ?? null

  // 작성자 표기 = 소속 + 직급·직책 + 이름(기존 결재 시스템의 기안자 표기와 같은 순서).
  const { data: departments } = useDepartments()
  const jobTitle = useJobTitleLabel()
  const myDeptName = useMemo(
    () => (departments ?? []).find((d) => d.id === myDeptId)?.name ?? '',
    [departments, myDeptId],
  )
  const drafterLabel = useMemo(() => {
    if (!me) return '-'
    const profile = (me.profile ?? {}) as Record<string, unknown>
    const rank = typeof profile.rank === 'string' ? profile.rank : ''
    const position = typeof profile.position === 'string' ? profile.position : ''
    return [myDeptName, jobTitle(rank, position), me.name].filter(Boolean).join(' ')
  }, [me, myDeptName, jobTitle])

  const selectForm = (id: string) => {
    setFormId(id)
    const next = activeForms.find((f) => f.id === id)
    setValues(emptyValues(parseFields(next?.current_version?.fields)))
  }

  // 대분류를 바꾸면 그 아래 양식 선택과 입력 값을 함께 비운다 — 필드 키가 달라
  // 이전 값을 그대로 옮기면 어느 칸에 들어가야 할지 알 수 없는 값이 남는다.
  const selectCategory = (next: string) => {
    setCategory(next)
    setFormId('')
    setValues({})
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
      if (lines.APPROVAL.length === 0) {
        toast.show('결재자를 한 명 이상 지정하세요.', 'warning')
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
        lines,
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

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 기본 설정 — 상세 화면과 같은 격자 표. 무엇을 적고 있는지와 무엇이 적혔는지가
              같은 모양으로 읽히도록 기안·상세가 같은 머리를 쓴다. 보존 연한·보안 등급은
              양식이 정하므로 여기서는 고르지 않고 고른 양식의 값을 그대로 보인다. */}
          <Card title="기본 설정">
            <div className="space-y-4">
              <ApprovalInfoTable
                pairs={[
                  {
                    // 문서 종류는 두 단이다 — 대분류를 고른 뒤 그 안의 양식을 고른다.
                    // 양식이 늘어날수록 한 줄짜리 목록은 훑기 어려워진다.
                    label: '문서 종류',
                    value: (
                      // 대분류와 양식은 한 줄에 나란히 선다(`대분류 > 양식`을 읽는 순서 그대로).
                      // 줄바꿈을 허용하면 좁은 칸에서 둘이 위아래로 갈려 두 단 관계가 흐려진다.
                      <div className="flex items-center gap-2">
                        <Select
                          density="table"
                          className="min-w-0 flex-1"
                          value={category}
                          onChange={(e) => selectCategory(e.target.value)}
                        >
                          <option value="">분류 선택</option>
                          {groups.map((g) => (
                            <option key={g.category} value={g.category}>
                              {g.category}
                            </option>
                          ))}
                        </Select>
                        <Select
                          density="table"
                          className="min-w-0 flex-1"
                          value={formId}
                          onChange={(e) => selectForm(e.target.value)}
                          disabled={!category}
                        >
                          <option value="">양식 선택</option>
                          {categoryForms.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ),
                  },
                  { label: '작성자', value: drafterLabel },
                  {
                    label: '보존 연한 / 보안 등급',
                    value: form ? `${form.retention} / ${form.security_grade}` : '-',
                  },
                  { label: '기안 부서', value: myDeptName || '-' },
                ]}
              />
            </div>
          </Card>

          {/* 결재선은 기본 설정 바로 아래, 본문과 같은 흐름에 둔다 — 문서를 누가 어떤 순서로
              보게 될지는 첨부처럼 곁들이는 정보가 아니라 기안의 본체다.
              (카드와 [결재선 설정] 창은 ApprovalLinePicker가 스스로 갖는다.) */}
          <ApprovalLinePicker
            lines={lines}
            onLinesChange={setLines}
            recipientIds={recipientIds}
            onRecipientsChange={setRecipientIds}
            excludeId={uid}
          />

          {form && (
            <Card
              title={form.name}
              subtitle={
                amountLabel
                  ? `${amountLabel}이(가) 이 문서의 금액으로 집계됩니다 — 현재 ${formatMoney(amount)}`
                  : undefined
              }
            >
              <div className="space-y-4">
                <Field label="제목" required>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                {fields.length === 0 ? (
                  <p className="py-6 text-center text-body text-gray-500">
                    이 양식에 정의된 필드가 없습니다. ADMIN 결재 양식 관리에서 필드를 추가하세요.
                  </p>
                ) : (
                  <ApprovalFieldsForm fields={fields} values={values} onChange={setValues} />
                )}
              </div>
            </Card>
          )}

          {/* 양식을 고르기 전에도 제목은 적어 둘 수 있게 한다(임시저장 경로). */}
          {!form && (
            <Card title="제목">
              <Field label="제목" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
            </Card>
          )}
        </div>

        {/* 우측에는 문서에 곁들이는 것만 남는다(상세 화면의 우측 패널과 같은 성격). */}
        <div className="space-y-4 lg:col-span-1">
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
