import {
  BackButton,
  Banner,
  Button,
  Card,
  DetailTopBar,
  Field,
  Input,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
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
import { ApprovalWorkspaceField } from '@/features/approval/ApprovalWorkspaceField'
import { BudgetSourceField } from '@/features/approval/BudgetSourceField'
import { BudgetExpandCard } from '@/features/approval/BudgetExpandCard'
import { BudgetTreeInput } from '@/features/approval/BudgetTreeInput'
import { BudgetTreeView } from '@/features/approval/BudgetTreeView'
import { ExpenseSectionCard } from '@/features/approval/ExpenseSectionCard'
import { FieldTableInput } from '@/features/approval/FieldTableInput'
import {
  expenseSectionTitle,
  expenseTableSections,
  expenseTotalsAgree,
  splitExpenseSections,
  usesSectionCards,
} from '@/features/approval/expenseSections'
import {
  budgetSeedDirty,
  remapBudgetColumns,
  vatIncompatible,
} from '@/features/approval/budgetRemap'
import { BudgetRefContext } from '@/features/approval/budgetRefContext'
import { budgetSourceForms, useInvalidateBudget } from '@/features/approval/budgetApi'
import { errorText } from '@/features/approval/errorText'
import { useBudgetSourceState } from '@/features/approval/budgetSourceHooks'
import { ApprovalProgramPanel } from '@/features/approval/ApprovalProgramPanel'
import { useDocumentLinks, useSyncDocumentLinks } from '@/features/approval/documentLinkApi'
import {
  useApprovalProgramLinks,
  useSyncProgramLinks,
  type ProgramLinkDraft,
} from '@/features/approval/programLinkApi'
import {
  EMPTY_LINES,
  groupFormsByCategory,
  useApprovalDocument,
  useApprovalForms,
  requiresBudgetSource,
  useCreateApproval,
  usesBudgetSource,
  type ApprovalLineInput,
} from '@/features/approval/approvalApi'
import {
  useResubmitApproval,
  useSaveApprovalDraft,
} from '@/features/approval/approvalDraftApi'
import { LINE_KIND_ORDER } from '@/features/approval/config'
import { APPROVAL_ATTACHMENT_TYPE } from '@/features/approval/config'
import {
  amountIssues,
  budgetField,
  emptyValues,
  budgetValue,
  formatMoney,
  missingRequired,
  parseFields,
  primaryAmount,
  primaryAmountLabel,
  pruneValues,
  tableRows,
  type FieldValues,
} from '@/features/approval/fields'
import { maxRound, stampLinesForRound } from '@/features/approval/stampRounds'
import { isFinalApprovalReset } from '@/features/approval/approvalRecall'
import { isAttendanceRequestForm } from '@/features/approval/workRequestForm'
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
  const invalidateBudget = useInvalidateBudget()

  // 보완 중에는 기안 당시 양식을 그대로 써야 한다. 이후 비활성화된 양식도 이 문서에서는
  // 사라지면 안 되므로 현재 문서의 양식 한 건은 선택 목록에 남긴다.
  //
  // **근태 신청 3종(휴가·연장근무·휴일근무)은 여기서 고르지 않는다**(2026-09-15 사용자 확정).
  // 신청은 마이오피스 `근태현황`의 전용 화면이 받는다 — 같은 신청을 두 화면에서 받으면 어느
  // 쪽이 정본인지 사람이 판단하게 되고, 전용 화면만이 그 신청에 필요한 것(휴가는 근무일과 이미
  // 쓴 휴가가 보이는 달력, 근무 신청은 시각 두 개가 낳는 신청 시간)을 함께 보여 준다.
  // 이미 만들어진 문서를 고치러 온 자리(`editing`)에서는 그대로 남는다 — 목록에서 빼면
  // 자기 양식을 잃은 문서가 된다.
  const availableForms = useMemo(
    () =>
      (forms ?? []).filter(
        (f) =>
          (f.is_active && !isAttendanceRequestForm(f)) || f.id === editing?.form_id,
      ),
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
  // 저장 한 덩어리가 도는 동안(문서·첨부·연동·상신) 버튼을 잠근다.
  const [saving, setSaving] = useState(false)
  // 이 화면이 만든 임시저장 문서. 재시도는 새 문서를 만들지 않고 이것을 다시 쓴다.
  const draftId = useRef<string | null>(null)

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
  /**
   * 본문을 카드(양식 이름 / 지출 내역 / 송금 요청)로 가른다 — **양식을 가리지 않는다.**
   * 지출 내역·송금 요청 표를 가진 양식이면 표준 지출결의서든 법인카드·인건비든 같은 배치로
   * 선다. 가를 표가 없는 양식은 split이 빈손으로 돌아와 지금까지와 같이 한 카드로 선다 —
   * 판정도 가르는 일도 expenseSections가 소유한다.
   */
  const expenseSections = useMemo(
    () => (usesSectionCards(form) ? splitExpenseSections(documentFields) : null),
    [form, documentFields],
  )
  const mainFields = expenseSections ? expenseSections.body : documentFields
  const expenseTables = expenseSections ? expenseTableSections(expenseSections) : []
  /**
   * 지출 내역과 송금 요청의 합계액이 맞는가 — 두 표를 함께 보는 자리가 여기뿐이다.
   * 어긋나도 상신은 막지 않는다(판단은 결재자의 몫). 화면은 색으로 알리기만 한다.
   */
  const expenseTotalsMatch = expenseSections ? expenseTotalsAgree(expenseSections, values) : null

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
    // 어느 품의에 걸린 문서로 남는다. 실어 둔 예산 씨앗도 함께 버린다(양식이 달라지면 열
    // 구성도 달라져, 그 씨앗과 같은지 비교하는 판정이 뜻을 잃는다).
    setBudgetDocumentId(null)
    seededBudget.current = null
    // 워크스페이스 연동도 함께 푼다. 연동을 고르는 자리는 예산표를 가진 양식에만 서므로,
    // 그 양식을 벗어난 뒤에도 값이 남으면 **화면 어디에도 보이지 않는 연동**이 저장된다.
    setProgramLinks([])
  }

  /**
   * 대분류를 바꾸면 그 아래 **첫 양식까지 함께 정한다.**
   *
   * 빈 '양식 선택'에 멈춰 세우던 것을 2026-09-15에 바꿨다 — 분류를 고른 사람은 어차피 그 안의
   * 양식 하나를 고르게 되고, 대부분의 분류는 양식이 한둘이다. 빈 칸은 그 한 번을 더 시킬 뿐
   * 아무것도 묻지 않는다.
   *
   * 입력 값·근거 품의·예산 씨앗·워크스페이스 연동을 비우는 일은 `selectForm`이 이미 한다 —
   * 필드 키가 양식마다 달라 이전 값을 그대로 옮기면 어느 칸에 들어가야 할지 알 수 없는 값이
   * 남는다는 이유도 그대로다.
   */
  const selectCategory = (next: string) => {
    setCategory(next)
    selectForm(groups.find((g) => g.category === next)?.forms[0]?.id ?? '')
  }

  /**
   * 새 기안은 **첫 분류의 첫 양식에서 시작한다.**
   *
   * 어느 분류인지를 글자로 못 박지 않는 이유는 그 순서의 주인이 양식 원장이기 때문이다
   * (`groupFormsByCategory` — 분류의 순서는 그 안에서 가장 앞선 양식의 `sort_order`가 정한다).
   * '공통'을 적어 두면 ADMIN이 순서를 바꾸거나 그 분류를 비운 날 화면만 옛 답을 든다.
   *
   * **한 번만** 싣는다. 사람이 분류를 도로 비웠을 때 이 효과가 다시 돌면 고른 것이 되돌아간다.
   * 고치러 온 문서(`documentId`)에는 아예 걸지 않는다 — 그 문서의 분류는 위의 실어 오기가
   * 답하고, 여기서 먼저 첫 분류를 넣으면 입력 값이 딸린 양식이 한 번 갈렸다 돌아온다.
   */
  const seededCategory = useRef(false)
  useEffect(() => {
    if (documentId || seededCategory.current) return
    const first = groups[0]
    if (!first) return
    seededCategory.current = true
    setCategory(first.category)
    selectForm(first.forms[0]?.id ?? '')
    // selectForm은 매 렌더 새로 만들어지는 함수라 의존성에 넣으면 효과가 렌더마다 돈다
    // (한 번만 싣는 일이므로 ref가 막지만, 도는 일 자체를 만들지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, groups])

  /**
   * 근거 품의가 정하는 것들 — 고를 대상, 지금 고른 문서, 그 문서의 예산 줄과 사용 현황.
   *
   * "예산표를 가진 양식인가"는 `budget_link`가 아니라 **필드에 예산표가 있는가**가 답한다
   * (같은 사실을 두 곳에 적지 않는다 — 서버 `app.approval_budget_keys`도 같은 규칙이다).
   */
  const sourceForms = useMemo(() => budgetSourceForms(availableForms), [availableForms])
  const budgetLink = form?.budget_link ?? 'NONE'
  const needsSource = usesBudgetSource(budgetLink)
  // 예산표를 가졌는가가 곧 "예산을 배정하는 품의인가"다 — budget_link가 아니라 필드가 답한다.
  // 다만 **변경 품의는 배정이 아니다** — 배정은 원 품의에 이미 걸려 있어, 여기서 워크스페이스를
  // 다시 고르게 하면 정상 기안이 막힌다(서버의 '한 곳만' 규칙은 그대로 지킨다).
  const isRevise = budgetLink === 'REVISE'
  const allocatesBudget = budgetFields.length > 0 && !isRevise
  const {
    sourceDoc,
    usage: sourceUsage,
    refSource: budgetRefSource,
  } = useBudgetSourceState(
    needsSource ? budgetDocumentId : null,
    budgetDocumentId ? '근거 품의에 예산 줄이 없습니다.' : '근거 품의를 먼저 고르세요.',
  )

  /**
   * 변경 품의는 **원 품의의 현재 예산에서 출발한다.** 빈 표에서 다시 적으면 줄 id가 새로 나고,
   * 그 순간 이미 나간 지출이 가리킬 자리가 사라진다(서버도 그런 변경을 거절한다). 층 이름과
   * 줄 id를 그대로 싣고, 금액 칸은 양식마다 key가 달라 역할끼리 옮긴다(budgetRemap).
   *
   * 한 번 실은 뒤에는 재조회로 덮지 않는다 — 사람이 고쳐 둔 변경안이 되돌아가면 안 된다.
   * 대상 품의를 바꿨을 때만, 그리고 아직 손대지 않은 표일 때만 다시 싣는다.
   */
  const seededBudget = useRef<{ sourceId: string; json: string } | null>(null)
  useEffect(() => {
    if (!isRevise || !sourceDoc) return
    const target = budgetField(sourceDoc.fields)
    const budget = budgetFields[0]
    if (!target || !budget || seededBudget.current?.sourceId === sourceDoc.id) return
    const loaded = remapBudgetColumns(
      budgetValue(sourceDoc.fieldValues as FieldValues, target.key),
      target,
      budget,
    )
    if (loaded.rows.length === 0) return
    const previous = seededBudget.current?.json ?? null
    seededBudget.current = { sourceId: sourceDoc.id, json: JSON.stringify(loaded) }
    setValues((prev) => {
      const current = budgetValue(prev, budget.key)
      return budgetSeedDirty(current, previous) ? prev : { ...prev, [budget.key]: loaded }
    })
  }, [isRevise, sourceDoc, budgetFields])

  /**
   * 대상 품의를 **사람이 바꾸는** 자리. 재조회(같은 문서)와 달리 여기서는 지금 표에 적힌
   * 줄들이 통째로 남의 예산 줄이 된다 — 줄 id가 옛 대상의 것이라 적용되지 않거나, 엉뚱한
   * 줄을 가리킨다. 그래서 씨앗을 버리고 표를 비워 새 대상의 현재 예산으로 다시 싣는다.
   * 적어 둔 것이 있으면 한 번 묻는다(묻지 않고 지우면 그것이 더 큰 사고다).
   */
  const changeBudgetSource = (next: string | null) => {
    if (next === budgetDocumentId) return
    const budget = budgetFields[0]
    if (isRevise && budget) {
      const dirty = budgetSeedDirty(
        budgetValue(values, budget.key),
        seededBudget.current?.json ?? null,
      )
      if (
        dirty &&
        !window.confirm(
          '지금 적은 변경안은 이전 대상 품의의 예산 줄입니다. 대상을 바꾸면 새 대상의 현재 예산을 다시 불러옵니다. 계속할까요?',
        )
      ) {
        return
      }
      seededBudget.current = null
      setValues((prev) => ({ ...prev, [budget.key]: { levels: [], rows: [] } }))
    }
    setBudgetDocumentId(next)
  }

  // 대상 품의는 공급가액·부가세를 쓰는데 이 변경 양식에는 그 칸이 없다 — 상신하면 서버가
  // 거절한다. 다 적고 나서 막히지 않도록 고른 즉시 말해 준다.
  const vatMismatch = useMemo(() => {
    if (!isRevise || !sourceDoc) return false
    const target = budgetField(sourceDoc.fields)
    const budget = budgetFields[0]
    return Boolean(target && budget && vatIncompatible(target, budget))
  }, [isRevise, sourceDoc, budgetFields])

  const amount = primaryAmount(fields, values)
  const amountLabel = primaryAmountLabel(fields)
  // 금액의 주인이 **표의 한 열**이면 그 표가 자기 맨 아랫줄에 합계를 이미 들고 있다.
  const amountFromTable = fields.some((f) => (f.columns ?? []).some((c) => c.primaryAmount))

  const submit = async (asDraft: boolean) => {
    if (saving) return
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
      setSaving(true)
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
      } finally {
        setSaving(false)
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
      const badAmounts = amountIssues(fields, values)
      if (badAmounts.length > 0) {
        toast.show(badAmounts[0]!, 'warning')
        return
      }
      // 예산을 배정하는 품의는 어느 워크스페이스의 예산인지 밝혀야 한다. 서버도 같은 규칙을
      // 강제하지만, 상신을 눌러 되돌아오는 것보다 여기서 말해 주는 편이 낫다.
      if (allocatesBudget && programLinks.length !== 1) {
        toast.show('예산을 배정할 워크스페이스를 한 곳 고르세요.', 'warning')
        return
      }
      // 변경 대상은 화면에서만 막고 끝내지 않는다. 서버가 다시 판정한다. 지출결의서의 근거 품의는
      // 비어 있어도 상신된다 — 품의 없이 나가는 지출이 있고, 문을 막으면 담당자가 상관없는 품의를
      // 골라 통과시킨다. 그 순간 예산은 실제로 쓴 곳이 아닌 줄에서 깎인다.
      if (!budgetDocumentId && requiresBudgetSource(budgetLink)) {
        toast.show('변경 대상 품의를 고르세요.', 'warning')
        return
      }
    }

    // 저장은 여러 요청이 이어진 한 덩어리다(문서 → 첨부 → 연동 → 상신). 문서 RPC 하나만
    // 잠그면 그 사이 버튼이 다시 눌려 문서가 둘 생긴다.
    setSaving(true)
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
      // **상신은 언제나 마지막이다.** 첨부·연동은 문서 id를 참조하므로 문서가 생긴 뒤에야
      // 붙는데, 먼저 상신해 두면 그 사이 한 건이라도 실패했을 때 연동 없는 문서가 이미
      // 결재선에 올라가 있다 — 예산 품의라면 어느 워크스페이스의 예산인지 말하지 못하는
      // 문서가 결재를 받는다. 그래서 새 문서도, 고치는 문서도 DRAFT로 먼저 저장하고
      // 딸린 것들이 모두 붙은 다음에 같은 RPC로 상신한다. 실패하면 문서는 기안함에 남는다.
      // 한 번 만들어 둔 임시저장은 재시도에서 **다시 쓴다**. 매번 새로 만들면 첨부에서 한 번
      // 실패할 때마다 같은 내용의 문서가 기안함에 쌓인다.
      // 새 문서는 **id부터** 받는다(빈 껍데기 DRAFT). 본문·결재선·참조자를 함께 INSERT하며
      // id를 맨 끝에 돌려받던 종전 경로는, 중간에 끊기면 화면이 id를 못 들어 재시도마다
      // 반쯤 채워진 문서를 새로 만들었다. 껍데기를 먼저 붙잡아 두면 재시도는 언제나 같은
      // 문서를 고쳐 쓴다.
      let id = documentId ?? draftId.current
      if (!id) {
        id = await create.mutateAsync({
          title: payload.title,
          formId: payload.formId,
          formVersionId: payload.formVersionId,
          departmentId: payload.departmentId,
        })
        draftId.current = id
      }
      await saveDraft.mutateAsync({ ...payload, documentId: id, asDraft: true })
      draftId.current = id
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
      if (!asDraft) await saveDraft.mutateAsync({ ...payload, documentId: id, asDraft: false })
      invalidateBudget(budgetDocumentId)
      toast.show(asDraft ? '임시저장했습니다.' : '문서를 상신했습니다.', 'success')
      onSaved(id)
    } catch (e) {
      // 서버가 사유를 적어 보낸 경우(예산 초과·워크스페이스 미지정 등) 그 문장을 그대로
      // 보인다 — '권한을 확인하세요'로 덮으면 고칠 수 있는 문제가 권한 문제로 읽힌다.
      toast.show(errorText(e) ?? '저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  if ((isLoading && !forms) || (loadingDoc && !editing)) return <Spinner />

  const busy =
    saving ||
    create.isPending ||
    saveDraft.isPending ||
    resubmit.isPending ||
    syncPrograms.isPending ||
    syncDocLinks.isPending

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


          {form && (
            // 예산 줄을 고르는 칸은 세 카드 어디에나 설 수 있으므로 묶음 전체를 근거 품의로 감싼다.
            <BudgetRefContext.Provider value={budgetRefSource}>
              <div className="space-y-4">
                {/* 금액 안내는 **그 금액을 적는 칸이 스스로 답하지 못할 때만** 선다.
                    지출 내역이 자기 카드로 떨어져 나간 지출결의서에서는 본문 카드가 담지도 않은
                    값을 두고 "현재 0원"이라 말하게 되는데, 그 카드에는 고칠 칸이 없어 읽는
                    사람이 할 수 있는 일이 없다. 금액의 주인이 표 열일 때(법인카드·인건비의
                    `사용 내역 > 금액`)도 마찬가지다 — 그 표가 바로 아래에서 합계를 이미 적고
                    있어, 같은 숫자를 카드 부제로 한 번 더 적으면 둘이 어긋난 순간 어느 쪽이
                    문서 금액인지 되레 헷갈린다. 남는 것은 금액이 **낱칸 하나**인 양식뿐이다. */}
                <Card
                  title={form.name}
                  subtitle={
                    budgetFields.length === 0 &&
                    amountLabel &&
                    expenseTables.length === 0 &&
                    !amountFromTable
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
                    ) : mainFields.length > 0 ? (
                      <ApprovalFieldsForm
                        fields={mainFields}
                        values={values}
                        onChange={setValues}
                        documentContext={{ title, docNo: editing?.doc_no ?? null }}
                      />
                    ) : null}
                  </div>
                </Card>

                {/* 근거 품의는 **본문 다음, 지출 내역 바로 앞**에 선다. 문서는 제목과 내용으로
                    시작하는 것이 읽는 순서이고, 근거 품의는 그 문서가 무엇을 적을지 정해진 뒤에
                    고르는 값이다. 그러면서 지출 내역보다는 앞이어야 한다 — 품의를 골라야 내역에서
                    예산 줄을 고를 수 있으므로, 뒤에 두면 내역을 적다가 위로 되돌아와야 한다.
                    보완 중에는 고르지 못한다(결재자가 무엇을 근거로 승인했는지가 바뀌면 이미 찍힌
                    도장의 뜻이 달라진다). */}
                {needsSource && (
                  <BudgetSourceField
                    forms={sourceForms}
                    value={budgetDocumentId}
                    onChange={changeBudgetSource}
                    picked={sourceDoc ?? null}
                    required={requiresBudgetSource(budgetLink)}
                    revise={budgetLink === 'REVISE'}
                    readOnly={isResubmit}
                  />
                )}

                {/* 지출 내역·송금 요청은 각자 카드로 선다 — 앞은 결재자가 판단할 근거이고 뒤는
                    승인 뒤 경영지원이 실행할 지시라, 한 상자에 세로로 이으면 어디서 판단이 끝나고
                    어디서 실행이 시작되는지 읽히지 않는다. 카드 제목이 곧 그 필드의 라벨이다. */}
                {expenseTables.map((table) => (
                  <ExpenseSectionCard key={table.key} field={table}>
                    <FieldTableInput
                      field={table}
                      // 두 표의 합계액이 맞는지는 둘을 함께 보는 이 화면만 알 수 있다.
                      totalsMatch={expenseTotalsMatch}
                      // 보이지 않는 표 이름은 카드 제목과 같은 문구여야 한다(같은 것을 두 번
                      // 적지 않도록 제목을 만드는 함수에서 받는다).
                      caption={expenseSectionTitle(table)}
                      rows={tableRows(values, table.key)}
                      onChange={(rows) => setValues({ ...values, [table.key]: rows })}
                    />
                  </ExpenseSectionCard>
                ))}
              </div>
            </BudgetRefContext.Provider>
          )}

          {/* 예산을 배정하는 품의에서는 워크스페이스가 **예산표 바로 위**에 선다. 아래 표에
              적히는 금액이 어느 사업의 예산인지를 그 표 앞에서 묻는 것이고, 고르지 않으면 서버가
              상신을 거절하는 값이라 우측 패널의 곁들이는 것들과 같은 층에 둘 수 없다.
              변경 품의는 빠진다 — 배정은 원 품의에 이미 걸려 있고, 여기서 다시 고르게 하면
              서버의 '한 곳만' 규칙과 부딪쳐 정상 기안이 막힌다. */}
          {allocatesBudget && (
            <ApprovalWorkspaceField
              value={programLinks}
              onChange={setProgramLinks}
              readOnly={isResubmit}
            />
          )}

          {/* 예산은 품의서 본문과 독립된 카드다. 분류 설정부터 합계까지 한 카드 안에서
              끝나므로 사용자가 일반 본문 필드와 예산 구조를 같은 입력 묶음으로 오해하지 않는다.
              카드 폭이 모자랄 때는 크게보기로 펼쳐서 적는다 — 읽는 화면과 같은 조작이다. */}
          {budgetFields.map((budget) => (
            <Fragment key={budget.key}>
              <BudgetExpandCard
                title={budget.label}
                help={budget.help}
                documentTitle={title}
                banner={
                  vatMismatch ? (
                    <Banner tone="warning" className="mb-3">
                      변경 대상 품의는 공급가액·부가세 칸을 쓰는 양식입니다. 이 양식에는 그 칸이
                      없어 상신할 수 없습니다 — 같은 칸을 가진 예산 변경 양식으로 다시 작성해
                      주세요.
                    </Banner>
                  ) : null
                }
              >
                <BudgetTreeInput
                  field={budget}
                  value={budgetValue(values, budget.key)}
                  onChange={(next) => setValues({ ...values, [budget.key]: next })}
                />
              </BudgetExpandCard>
              {/* 변경 품의에서만 선다 — 결재자가 판단할 것은 새 금액이 아니라 **이미 나간 돈에
                  견준 새 금액**이다. 부족해도 막지 않는다(사용자 확정): 음수로 보이고 결재자가
                  그것을 보고 정한다. */}
              {isRevise && sourceDoc && (
                <BudgetExpandCard
                  title="변경 후 예상"
                  help="원 품의에서 이미 나간 지출과 결재 중 금액을 이 변경안에 견줍니다. 사용 가능액이 음수여도 상신할 수 있습니다."
                  documentTitle={title}
                >
                  <BudgetTreeView
                    field={budget}
                    value={budgetValue(values, budget.key)}
                    usage={sourceUsage}
                  />
                </BudgetExpandCard>
              )}
            </Fragment>
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
              {/* 워크스페이스 연동은 우측에 패널로 서지 않는다(2026-09-15 사용자 확정).
                  예산을 배정하는 품의는 본문 흐름(예산표 위)에서 고르고, 그 밖의 결재는 걸지
                  않는다 — 같은 값을 두 자리에서 고치게 두면 한쪽만 바꾼 사람이 무엇이
                  저장됐는지 알 수 없다. 상세 화면의 읽기 전용 패널은 그대로 남는다. */}
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
