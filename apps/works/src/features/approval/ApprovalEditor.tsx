import { BackButton, Button, Card, Field, Input, Select, Spinner, useToast } from '@ynarcher/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { ApprovalDocLinkField, type DocLinkDraft } from '@/features/approval/ApprovalDocLinkField'
import { ApprovalFieldsForm } from '@/features/approval/ApprovalFieldsForm'
import { ApprovalInfoTable } from '@/features/approval/ApprovalInfoTable'
import { approvalHeaderPairs } from '@/features/approval/approvalHeader'
import { ApprovalLinePicker } from '@/features/approval/ApprovalLinePicker'
import {
  ApprovalProgramField,
  type ProgramLinkDraft,
} from '@/features/approval/ApprovalProgramField'
import { useDocumentLinks, useSyncDocumentLinks } from '@/features/approval/documentLinkApi'
import { useApprovalProgramLinks, useSyncProgramLinks } from '@/features/approval/programLinkApi'
import {
  EMPTY_LINES,
  groupFormsByCategory,
  useApprovalDocument,
  useApprovalForms,
  useCreateApproval,
  useSaveApprovalDraft,
  type ApprovalLineInput,
} from '@/features/approval/approvalApi'
import { LINE_KIND_ORDER } from '@/features/approval/config'
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

function dateTime(v: string | null): string {
  return v ? v.slice(0, 19).replace('T', ' ') : '-'
}

interface ApprovalEditorProps {
  /** 고칠 임시저장 문서. 없으면 새 기안을 쓴다. */
  documentId?: string
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
 *
 * 임시저장 문서를 고칠 때도 이 화면을 그대로 쓴다(`documentId`) — 기안과 수정은 같은 일이라
 * 화면을 따로 두면 양식·결재선 규칙이 두 벌로 갈린다. 다른 것은 저장 경로뿐이다.
 */
export function ApprovalEditor({ documentId, onSaved, onCancel }: ApprovalEditorProps) {
  const toast = useToast()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: forms, isLoading } = useApprovalForms()
  const { data: employees } = useEmployees()
  const { data: editing, isLoading: loadingDoc } = useApprovalDocument(documentId)
  const create = useCreateApproval()
  const saveDraft = useSaveApprovalDraft()
  const pending = usePendingMaterials()
  // 고치는 문서라면 이미 걸린 연동·참조를 실어 와야 한다(새 기안이면 빈 배열).
  const { data: savedPrograms } = useApprovalProgramLinks(documentId)
  const { data: savedDocLinks } = useDocumentLinks(documentId)
  const syncPrograms = useSyncProgramLinks()
  const syncDocLinks = useSyncDocumentLinks()

  const activeForms = useMemo(() => (forms ?? []).filter((f) => f.is_active), [forms])
  const groups = useMemo(() => groupFormsByCategory(activeForms), [activeForms])

  const [category, setCategory] = useState('')
  const [formId, setFormId] = useState('')
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<FieldValues>({})
  const [lines, setLines] = useState<ApprovalLineInput>(EMPTY_LINES)
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [programLinks, setProgramLinks] = useState<ProgramLinkDraft[]>([])
  const [docLinks, setDocLinks] = useState<DocLinkDraft[]>([])

  // 고칠 문서를 한 번만 입력 칸에 싣는다 — 다시 실으면 사용자가 고치던 값이 되돌아간다.
  const seeded = useRef(false)
  useEffect(() => {
    if (!editing || seeded.current) return
    seeded.current = true
    setCategory(editing.form?.category || '공통')
    setFormId(editing.form_id ?? '')
    setTitle(editing.title)
    setValues((editing.field_values ?? {}) as FieldValues)
    setRecipientIds(
      [...editing.approval_recipients]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => r.user_id),
    )
    // 결재는 순번이 곧 차례라 정렬해서 싣는다(합의는 병렬이라 적힌 차례 그대로).
    const next = { ...EMPTY_LINES }
    for (const kind of LINE_KIND_ORDER) {
      next[kind] = editing.approval_lines
        .filter((l) => (l.kind ?? 'APPROVAL') === kind)
        .sort((a, b) => a.step_order - b.step_order)
        .map((l) => l.approver_id)
        .filter((id): id is string => Boolean(id))
    }
    setLines(next)
  }, [editing])

  // 연동·참조는 문서와 별개 원장이라 조회가 따로 도착한다 — 각자 한 번만 싣는다.
  const seededPrograms = useRef(false)
  useEffect(() => {
    if (!savedPrograms || seededPrograms.current) return
    seededPrograms.current = true
    setProgramLinks(
      savedPrograms.map((l) => ({
        targetType: l.targetType,
        targetId: l.targetId,
        // 열람 권한이 없어 제목이 비어 있어도 명단에서 빠뜨리지 않는다 —
        // 안 보인다고 지워 버리면 저장할 때 남의 연동을 떼는 셈이 된다.
        label: l.title ?? '접근 권한 없음',
        code: l.code,
      })),
    )
  }, [savedPrograms])

  const seededDocLinks = useRef(false)
  useEffect(() => {
    if (!savedDocLinks || seededDocLinks.current) return
    seededDocLinks.current = true
    setDocLinks(
      savedDocLinks.map((d) => ({
        id: d.id,
        title: d.title,
        docNo: d.docNo,
        status: d.status,
      })),
    )
  }, [savedDocLinks])

  const categoryForms = groups.find((g) => g.category === category)?.forms ?? []
  const form = activeForms.find((f) => f.id === formId) ?? null
  const fields = useMemo(() => parseFields(form?.current_version?.fields), [form])

  const me = useMemo(() => (employees ?? []).find((e) => e.id === uid) ?? null, [employees, uid])
  const myDeptId = me?.department_id ?? null

  // 기안자 표기의 형식(이름 / 소속 / 직책)은 approvalDrafterLabel이 정한다 — 여기서는
  // 조각만 모은다. 상세 화면과 같은 함수를 거치므로 두 화면의 표기가 갈리지 않는다.
  const { data: departments } = useDepartments()
  const jobTitle = useJobTitleLabel()
  const myDeptName = useMemo(
    () => (departments ?? []).find((d) => d.id === myDeptId)?.name ?? '',
    [departments, myDeptId],
  )
  const drafterParts = useMemo(() => {
    const profile = (me?.profile ?? {}) as Record<string, unknown>
    const rank = typeof profile.rank === 'string' ? profile.rank : ''
    const position = typeof profile.position === 'string' ? profile.position : ''
    return {
      name: me?.name ?? '',
      deptName: myDeptName,
      jobTitle: me ? jobTitle(rank, position) : '',
    }
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
      const payload = {
        title: title.trim(),
        formId: form.id,
        formVersionId: form.current_version_id,
        fieldValues: pruneValues(fields, values),
        departmentId: myDeptId,
        lines,
        recipientIds,
        asDraft,
      }
      const id = documentId
        ? await saveDraft.mutateAsync({ ...payload, documentId })
        : await create.mutateAsync(payload)
      // 첨부·연동·참조는 문서가 생긴 뒤에야 붙일 수 있다(모두 문서 id를 참조한다).
      if (pending.count > 0) await pending.flush(id, () => APPROVAL_ATTACHMENT_TYPE)
      await syncPrograms.mutateAsync({
        documentId: id,
        refs: programLinks.map((l) => ({
          targetType: l.targetType,
          targetId: l.targetId,
        })),
        userId: uid,
      })
      await syncDocLinks.mutateAsync({
        documentId: id,
        targetIds: docLinks.map((d) => d.id),
        userId: uid,
      })
      toast.show(asDraft ? '임시저장했습니다.' : '문서를 상신했습니다.', 'success')
      onSaved(id)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  if ((isLoading && !forms) || (loadingDoc && !editing)) return <Spinner />

  const busy = create.isPending || saveDraft.isPending

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton onClick={onCancel}>문서함</BackButton>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void submit(true)} disabled={busy}>
            임시저장
          </Button>
          {/* 버튼은 이 화면에서 하는 일의 이름으로 적는다 — '상신'은 문서가 결재선을 타고
              올라가는 결과 쪽 용어라, 지금 기안서를 쓰고 있는 손에게는 '기안하기'가 자기가
              누르는 일의 이름이다(임시저장과 짝이 맞는다). 결과를 알리는 토스트·상태 표기는
              도메인 용어인 '상신'을 그대로 쓴다. */}
          <Button onClick={() => void submit(false)} disabled={busy}>
            기안하기
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
                pairs={approvalHeaderPairs({
                  // 문서 종류는 두 단이다 — 대분류를 고른 뒤 그 안의 양식을 고른다.
                  // 양식이 늘어날수록 한 줄짜리 목록은 훑기 어려워진다.
                  formPath: (
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
                  // 채번·완료 일시는 아직 없다. 자리는 그대로 두고 값만 비운다.
                  docNo: editing?.doc_no ?? null,
                  deptName: myDeptName,
                  drafter: drafterParts,
                  retentionGrade: form ? `${form.retention} / ${form.security_grade}` : null,
                  // 금액은 지금 입력 중인 값에서 곧바로 파생한다(상신 후 집계될 값과 같은 셈).
                  amount: formatMoney(amount),
                  createdAt: editing ? dateTime(editing.created_at) : null,
                  completedAt: null,
                })}
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
            drafterId={uid}
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

        {/* 우측에는 문서에 곁들이는 것만 남는다(상세 화면의 우측 패널과 같은 성격).
            **붙이는 일은 전부 여기서 끝난다** — 첨부·연동·참조는 상세에서 읽기만 하며,
            도장이 찍히기 시작한 문서에 나중에 무언가가 붙으면 결재자가 무엇을 보고 승인했는지
            판정할 근거가 사라진다. 순서는 상세 화면의 패널 순서와 같다. */}
        <div className="space-y-4 lg:col-span-1">
          <PendingMaterialPanel
            slot={APPROVAL_ATTACHMENT_TYPE}
            pending={pending}
            title="첨부 파일"
          />
          <ApprovalProgramField value={programLinks} onChange={setProgramLinks} />
          <ApprovalDocLinkField
            documentId={documentId}
            userId={uid}
            value={docLinks}
            onChange={setDocLinks}
          />
        </div>
      </div>
    </div>
  )
}
