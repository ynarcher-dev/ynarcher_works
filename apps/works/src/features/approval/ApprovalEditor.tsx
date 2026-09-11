import {
  BackButton,
  Button,
  Card,
  DetailTopBar,
  Field,
  Input,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { ApprovalDocLinkField, type DocLinkDraft } from '@/features/approval/ApprovalDocLinkField'
import { ApprovalLinkPanel } from '@/features/approval/ApprovalLinkPanel'
import { ApprovalFieldsForm } from '@/features/approval/ApprovalFieldsForm'
import { ApprovalBasicsCard } from '@/features/approval/ApprovalBasicsCard'
import { ApprovalRevisionNotice } from '@/features/approval/ApprovalRevisionNotice'
import { ApprovalLinePicker } from '@/features/approval/ApprovalLinePicker'
import { BudgetSourceField } from '@/features/approval/BudgetSourceField'
import { BudgetTreeInput } from '@/features/approval/BudgetTreeInput'
import { BudgetRefContext } from '@/features/approval/budgetRefContext'
import { budgetFormIds } from '@/features/approval/budgetApi'
import { useBudgetSourceState } from '@/features/approval/budgetSourceHooks'
import {
  ApprovalProgramField,
  type ProgramLinkDraft,
} from '@/features/approval/ApprovalProgramField'
import { ApprovalProgramPanel } from '@/features/approval/ApprovalProgramPanel'
import { useDocumentLinks, useSyncDocumentLinks } from '@/features/approval/documentLinkApi'
import { useApprovalProgramLinks, useSyncProgramLinks } from '@/features/approval/programLinkApi'
import {
  EMPTY_LINES,
  groupFormsByCategory,
  useApprovalDocument,
  useApprovalForms,
  useCreateApproval,
  useResubmitApproval,
  useSaveApprovalDraft,
  usesBudgetSource,
  type ApprovalLineInput,
} from '@/features/approval/approvalApi'
import { LINE_KIND_ORDER } from '@/features/approval/config'
import { APPROVAL_ATTACHMENT_TYPE } from '@/features/approval/config'
import {
  emptyValues,
  budgetValue,
  formatMoney,
  missingRequired,
  parseFields,
  primaryAmount,
  primaryAmountLabel,
  pruneValues,
  type FieldValues,
} from '@/features/approval/fields'
import { maxRound, stampLinesForRound } from '@/features/approval/stampRounds'
import { isFinalApprovalReset } from '@/features/approval/approvalRecall'
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
  const resubmit = useResubmitApproval()
  const pending = usePendingMaterials()
  // 보완 요청 문서를 고치러 온 자리인가 — 임시저장 수정과 화면은 같고 저장 경로만 다르다.
  const isResubmit = Boolean(
    editing &&
      (editing.status === 'REVISION_REQUIRED' ||
        isFinalApprovalReset(editing.status, editing.approval_lines)),
  )
  // 고치는 문서라면 이미 걸린 연동·참조를 실어 와야 한다(새 기안이면 빈 배열).
  const { data: savedPrograms } = useApprovalProgramLinks(documentId)
  const { data: savedDocLinks } = useDocumentLinks(documentId)
  const syncPrograms = useSyncProgramLinks()
  const syncDocLinks = useSyncDocumentLinks()

  // 보완 중에는 기안 당시 양식을 그대로 써야 한다. 이후 비활성화된 양식도 이 문서에서는
  // 사라지면 안 되므로 현재 문서의 양식 한 건은 선택 목록에 남긴다.
  const availableForms = useMemo(
    () => (forms ?? []).filter((f) => f.is_active || f.id === editing?.form_id),
    [forms, editing?.form_id],
  )
  const groups = useMemo(() => groupFormsByCategory(availableForms), [availableForms])

  const [category, setCategory] = useState('')
  const [formId, setFormId] = useState('')
  const [title, setTitle] = useState('')
  const [values, setValues] = useState<FieldValues>({})
  const [lines, setLines] = useState<ApprovalLineInput>(EMPTY_LINES)
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [programLinks, setProgramLinks] = useState<ProgramLinkDraft[]>([])
  const [docLinks, setDocLinks] = useState<DocLinkDraft[]>([])
  // 근거 품의(지출결의) 또는 변경 대상 품의(예산 변경 품의). 문서 단위의 값이라 필드가 아니라
  // 여기서 든다 — 표 칸마다 들면 한 문서 안에서 서로 다른 품의를 가리키는 줄이 생긴다.
  const [budgetDocumentId, setBudgetDocumentId] = useState<string | null>(null)

  // 고칠 문서를 한 번만 입력 칸에 싣는다 — 다시 실으면 사용자가 고치던 값이 되돌아간다.
  const seeded = useRef(false)
  useEffect(() => {
    if (!editing || seeded.current) return
    seeded.current = true
    setCategory(editing.form?.category || '공통')
    setFormId(editing.form_id ?? '')
    setTitle(editing.title)
    setValues((editing.field_values ?? {}) as FieldValues)
    setBudgetDocumentId(editing.budget_document_id ?? null)
    setRecipientIds(
      [...editing.approval_recipients]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => r.user_id),
    )
    // 현재 회차의 자리와 앞 회차에서 유지된 승인 도장을 합친 결재선만 싣는다. 회차 원장을
    // 그대로 펴면 재상신 횟수만큼 같은 자리가 중복된다.
    const visibleLines = stampLinesForRound(
      editing.approval_lines,
      maxRound(editing.approval_lines),
    )
    const next = { ...EMPTY_LINES }
    for (const kind of LINE_KIND_ORDER) {
      next[kind] = visibleLines
        .filter((l) => l.kind === kind)
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((l) => l.approverId)
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
  const form = availableForms.find((f) => f.id === formId) ?? null
  const fields = useMemo(() => {
    const parsed = parseFields(form?.current_version?.fields)
    if (!parsed.some((field) => field.type === 'BUDGET_TREE')) return parsed
    // 예산표가 도입되기 전 품의 양식의 별도 금액 칸. 새 양식 버전에서는 DB에서도 빠지지만,
    // 그 전 버전으로 만든 임시저장을 고칠 때도 같은 돈을 두 번 입력하게 두지 않는다.
    return parsed.filter(
      (field) =>
        !(
          field.key === 'amount' &&
          field.label === '품의 금액' &&
          (field.type === 'MONEY' || field.type === 'NUMBER')
        ),
    )
  }, [form])
  const budgetFields = useMemo(() => fields.filter((field) => field.type === 'BUDGET_TREE'), [fields])
  const documentFields = useMemo(() => fields.filter((field) => field.type !== 'BUDGET_TREE'), [fields])

  const me = useMemo(() => (employees ?? []).find((e) => e.id === uid) ?? null, [employees, uid])
  const myDeptId = me?.department_id ?? null

  // 기안자 표기의 형식(이름 / 직책)은 approvalDrafterLabel이 정한다 — 여기서는 조각만
  // 모은다. 상세 화면과 같은 함수를 거치므로 두 화면의 표기가 갈리지 않는다.
  // 소속은 넘기지 않는다 — 같은 표의 '기안 부서' 칸이 이미 그 사실을 말한다.
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
      jobTitle: me ? jobTitle(rank, position) : '',
    }
  }, [me, jobTitle])

  const selectForm = (id: string) => {
    setFormId(id)
    const next = availableForms.find((f) => f.id === id)
    setValues(emptyValues(parseFields(next?.current_version?.fields)))
    // 양식이 바뀌면 근거 품의도 비운다 — 값을 비우면서 근거만 남기면 지출 내역이 비었는데
    // 어느 품의에 걸린 문서로 남는다.
    setBudgetDocumentId(null)
  }

  // 대분류를 바꾸면 그 아래 양식 선택과 입력 값을 함께 비운다 — 필드 키가 달라
  // 이전 값을 그대로 옮기면 어느 칸에 들어가야 할지 알 수 없는 값이 남는다.
  const selectCategory = (next: string) => {
    setCategory(next)
    setFormId('')
    setValues({})
    setBudgetDocumentId(null)
  }

  /**
   * 근거 품의가 정하는 것들 — 고를 대상, 지금 고른 문서, 그 문서의 예산 줄과 사용 현황.
   *
   * "예산표를 가진 양식인가"는 `budget_link`가 아니라 **필드에 예산표가 있는가**가 답한다
   * (같은 사실을 두 곳에 적지 않는다 — 서버 `app.approval_budget_keys`도 같은 규칙이다).
   */
  const sourceFormIds = useMemo(() => budgetFormIds(availableForms), [availableForms])
  const budgetLink = form?.budget_link ?? 'NONE'
  const needsSource = usesBudgetSource(budgetLink)
  const { sourceDoc, refSource: budgetRefSource } = useBudgetSourceState(
    needsSource ? budgetDocumentId : null,
    budgetDocumentId ? '근거 품의에 예산 줄이 없습니다.' : '근거 품의를 먼저 고르세요.',
  )

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

    // 재상신은 값만 고쳐 같은 문서를 다시 올린다. 결재선·참조자·양식은 그대로이고,
    // 서버가 보완 요청 자리와 아직 처리하지 않은 자리만 다음 회차에 세운다.
    if (isResubmit && editing) {
      const missing = missingRequired(fields, values)
      if (missing.length > 0) {
        toast.show(`필수 항목을 입력하세요: ${missing.join(', ')}`, 'warning')
        return
      }
      try {
        await resubmit.mutateAsync({
          documentId: editing.id,
          title: title.trim(),
          fieldValues: pruneValues(fields, values),
        })
        toast.show('문서를 재상신했습니다.', 'success')
        onSaved(editing.id)
      } catch {
        toast.show('재상신에 실패했습니다. 권한을 확인하세요.', 'danger')
      }
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
      // 근거 품의는 화면에서만 막고 끝내지 않는다 — 서버가 다시 판정한다.
      if (!budgetDocumentId && (budgetLink === 'SPEND_REQUIRED' || budgetLink === 'REVISE')) {
        toast.show(
          budgetLink === 'REVISE' ? '변경 대상 품의를 고르세요.' : '근거 품의를 고르세요.',
          'warning',
        )
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
        budgetDocumentId: needsSource ? budgetDocumentId : null,
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

  const busy = create.isPending || saveDraft.isPending || resubmit.isPending

  return (
    <div className="space-y-5">
      <DetailTopBar
        back={<BackButton onClick={onCancel}>문서함</BackButton>}
        actions={
          <>
          {/* 보완 중 문서에는 임시저장이 없다 — 이미 조직에 나갔던 문서라 되돌릴 '아직
              안 낸 상태'가 없고, 고치다 말면 그냥 보완 중인 채로 남는다. */}
          {!isResubmit && (
            <Button variant="secondary" onClick={() => void submit(true)} disabled={busy}>
              임시저장
            </Button>
          )}
          {/* 버튼은 이 화면에서 하는 일의 이름으로 적는다 — '상신'은 문서가 결재선을 타고
              올라가는 결과 쪽 용어라, 지금 기안서를 쓰고 있는 손에게는 '기안하기'가 자기가
              누르는 일의 이름이다(임시저장과 짝이 맞는다). 결과를 알리는 토스트·상태 표기는
              도메인 용어인 '상신'을 그대로 쓴다. 보완 중 문서만은 '재상신'이 그대로 손이
              하는 일의 이름이다 — 새로 쓰는 것이 아니라 같은 문서를 다시 올린다. */}
          <Button onClick={() => void submit(false)} disabled={busy}>
            {isResubmit ? '재상신' : '기안하기'}
          </Button>
          </>
        }
      />

      <ApprovalRevisionNotice document={editing} active={isResubmit} employees={employees} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 기본 설정 — 상세 화면과 같은 격자 표. 무엇을 적고 있는지와 무엇이 적혔는지가
              같은 모양으로 읽히도록 기안·상세가 같은 머리를 쓴다. 보존 연한·보안 등급은
              양식이 정하므로 여기서는 고르지 않고 고른 양식의 값을 그대로 보인다. */}
          <ApprovalBasicsCard
            groups={groups}
            categoryForms={categoryForms}
            category={category}
            onCategoryChange={selectCategory}
            formId={formId}
            onFormChange={selectForm}
            form={form}
            locked={isResubmit}
            docNo={editing?.doc_no ?? null}
            deptName={myDeptName}
            drafter={drafterParts}
            amount={formatMoney(amount)}
            createdAt={editing ? dateTime(editing.created_at) : null}
          />

          {/* 결재선은 기본 설정 바로 아래, 본문과 같은 흐름에 둔다 — 문서를 누가 어떤 순서로
              보게 될지는 첨부처럼 곁들이는 정보가 아니라 기안의 본체다.
              (카드와 [결재선 설정] 창은 ApprovalLinePicker가 스스로 갖는다.) */}
          <ApprovalLinePicker
            lines={lines}
            onLinesChange={setLines}
            recipientIds={recipientIds}
            onRecipientsChange={setRecipientIds}
            drafterId={uid}
            readOnly={isResubmit}
            help={
              isResubmit
                ? '보완은 문서 내용만 고치는 단계입니다. 기존 도장과 이어질 순서를 보존하기 위해 결재선은 변경할 수 없습니다.'
                : undefined
            }
          />

          {/* 근거 품의는 본문보다 앞에 선다 — 품의를 골라야 지출 내역에서 예산 줄을 고를 수
              있으므로, 뒤에 두면 내역을 적다가 위로 되돌아와야 한다. 보완 중에는 고르지 못한다
              (결재자가 무엇을 근거로 승인했는지가 바뀌면 이미 찍힌 도장의 뜻이 달라진다). */}
          {form && needsSource && (
            <BudgetSourceField
              formIds={sourceFormIds}
              value={budgetDocumentId}
              onChange={setBudgetDocumentId}
              picked={
                sourceDoc
                  ? { title: sourceDoc.title, docNo: sourceDoc.docNo, amount: sourceDoc.amount }
                  : null
              }
              required={budgetLink === 'SPEND_REQUIRED' || budgetLink === 'REVISE'}
              revise={budgetLink === 'REVISE'}
              readOnly={isResubmit}
            />
          )}

          {form && (
            <Card
              title={form.name}
              subtitle={
                budgetFields.length === 0 && amountLabel
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
                ) : documentFields.length > 0 ? (
                  <BudgetRefContext.Provider value={budgetRefSource}>
                    <ApprovalFieldsForm
                      fields={documentFields}
                      values={values}
                      onChange={setValues}
                      documentContext={{ title, docNo: editing?.doc_no ?? null }}
                    />
                  </BudgetRefContext.Provider>
                ) : null}
              </div>
            </Card>
          )}

          {/* 예산은 품의서 본문과 독립된 카드다. 분류 설정부터 합계까지 한 카드 안에서
              끝나므로 사용자가 일반 본문 필드와 예산 구조를 같은 입력 묶음으로 오해하지 않는다. */}
          {budgetFields.map((budget) => (
            <Card key={budget.key} title={budget.label} help={budget.help}>
              <BudgetTreeInput
                field={budget}
                value={budgetValue(values, budget.key)}
                onChange={(next) => setValues({ ...values, [budget.key]: next })}
              />
            </Card>
          ))}

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
          {isResubmit && editing ? (
            <>
              {/* 보완 중인 문서는 이미 id가 있으므로 첨부를 즉시 고칠 수 있다. 연동·상호
                  참조는 결재선과 마찬가지로 기존 판단의 범위를 바꾸므로 읽기만 한다. */}
              <MaterialPanel
                targetType={APPROVAL_ATTACHMENT_TYPE}
                targetId={editing.id}
                title="첨부 파일"
              />
              <ApprovalProgramPanel documentId={editing.id} />
              <ApprovalLinkPanel documentId={editing.id} />
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
