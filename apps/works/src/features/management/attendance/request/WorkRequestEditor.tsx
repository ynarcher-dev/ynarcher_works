import {
  BackButton,
  Banner,
  Button,
  Card,
  DetailTopBar,
  Spinner,
  TextArea,
  useToast,
} from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ApprovalBasicsCard } from '@/features/approval/ApprovalBasicsCard'
import { ApprovalLinePicker } from '@/features/approval/ApprovalLinePicker'
import {
  EMPTY_LINES,
  useApprovalForms,
  useCreateApproval,
  type ApprovalLineInput,
} from '@/features/approval/approvalApi'
import { useSaveApprovalDraft } from '@/features/approval/approvalDraftApi'
import { APPROVAL_ATTACHMENT_TYPE } from '@/features/approval/config'
import { errorText } from '@/features/approval/errorText'
import { missingRequired, parseFields, pruneValues } from '@/features/approval/fields'
import {
  WORK_REQUEST_META,
  findWorkRequestForm,
  workRequestFieldValues,
  workRequestMinutes,
  workRequestTitle,
  type WorkRequestKind,
} from '@/features/approval/workRequestForm'
import { useMyAttendancePolicy } from '@/features/management/attendance/attendanceConfigApi'
import {
  WorkRequestFieldsCard,
  type WorkRequestInput,
} from '@/features/management/attendance/request/WorkRequestFieldsCard'
import { useEmployees } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'
import { useDepartments } from '@/features/management/orgHooks'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'

interface WorkRequestEditorProps {
  kind: WorkRequestKind
  /** 근태현황으로 돌아간다. */
  onCancel: () => void
  /** 문서가 만들어진 뒤 갈 곳(전자결재 상세). */
  onSaved: (documentId: string) => void
}

/**
 * 연장·휴일 근무 신청 — 마이오피스 `근태현황`에서 여는 전용 기안 화면.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * **휴가 신청과 같은 골격이다**(`LeaveRequestEditor`). 기본 설정과 결재선은 기안 화면과 같은
 * 부품을 쓰고(`ApprovalBasicsCard`·`ApprovalLinePicker`), 본문 자리만 그 신청이 묻는 것으로
 * 바뀐다 — 결재선 규칙이 화면마다 갈리면 같은 조직도가 다른 결재선을 만든다.
 *
 * 양식은 고를 수 없다 — 이 화면의 주소가 곧 양식이다. 제목도 손으로 적지 않는다
 * (`workRequestTitle`이 소유한다).
 */
export function WorkRequestEditor({ kind, onCancel, onSaved }: WorkRequestEditorProps) {
  const meta = WORK_REQUEST_META[kind]
  const toast = useToast()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: forms, isLoading: formsLoading } = useApprovalForms()
  const { data: employees } = useEmployees()
  const { data: departments } = useDepartments()
  const { data: policy } = useMyAttendancePolicy()
  const jobTitle = useJobTitleLabel()
  const create = useCreateApproval()
  const saveDraft = useSaveApprovalDraft()
  const pending = usePendingMaterials()

  const [input, setInput] = useState<WorkRequestInput>(() => ({
    date: dayjs().format('YYYY-MM-DD'),
    start: '',
    end: '',
    breakMinutes: 0,
  }))
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<ApprovalLineInput>(EMPTY_LINES)
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  // 이 화면이 만든 임시저장 문서. 재시도는 새 문서를 만들지 않고 이것을 다시 쓴다.
  const draftId = useRef<string | null>(null)

  const form = useMemo(() => findWorkRequestForm(forms ?? [], kind), [forms, kind])
  const fields = useMemo(() => parseFields(form?.current_version?.fields), [form])

  const me = useMemo(() => (employees ?? []).find((e) => e.id === uid) ?? null, [employees, uid])
  const myDeptId = me?.department_id ?? null
  const myDeptName = useMemo(
    () => (departments ?? []).find((d) => d.id === myDeptId)?.name ?? '',
    [departments, myDeptId],
  )
  const drafterParts = useMemo(() => {
    const profile = (me?.profile ?? {}) as Record<string, unknown>
    const rank = typeof profile.rank === 'string' ? profile.rank : ''
    const position = typeof profile.position === 'string' ? profile.position : ''
    return { name: me?.name ?? '', jobTitle: me ? jobTitle(rank, position) : '' }
  }, [me, jobTitle])

  const submit = async (asDraft: boolean) => {
    if (saving) return
    if (!form || !form.current_version_id) {
      toast.show(
        meta.formName + ' 양식을 찾지 못했습니다. ADMIN 결재 양식 관리를 확인하세요.',
        'danger',
      )
      return
    }
    const values = workRequestFieldValues({ kind, ...input, reason })
    // 임시저장은 아직 조직에 내보내는 문서가 아니라 필수값·결재선을 강제하지 않는다
    // (기안 화면·휴가 신청과 같은 규약).
    if (!asDraft) {
      if (!input.date) {
        toast.show('근무일을 고르세요.', 'warning')
        return
      }
      if (!input.start || !input.end) {
        toast.show(meta.startLabel + '·' + meta.endLabel + ' 시각을 적으세요.', 'warning')
        return
      }
      // 시각 두 개가 같으면 하루 전체가 되는데, 그것을 이 신청으로 올리는 일은 없다.
      if (workRequestMinutes(input.start, input.end, input.breakMinutes) === null) {
        toast.show('신청 시간이 0분입니다. 시각과 휴게시간을 확인하세요.', 'warning')
        return
      }
      const missing = missingRequired(fields, values)
      if (missing.length > 0) {
        toast.show('필수 항목을 입력하세요: ' + missing.join(', '), 'warning')
        return
      }
      if (lines.APPROVAL.length === 0) {
        toast.show('결재자를 한 명 이상 지정하세요.', 'warning')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        title: workRequestTitle({ kind, date: input.date, start: input.start, end: input.end }),
        formId: form.id,
        formVersionId: form.current_version_id,
        fieldValues: pruneValues(fields, values),
        departmentId: myDeptId,
        budgetDocumentId: null,
        lines,
        recipientIds,
        asDraft,
      }
      // 상신은 언제나 마지막이다 — 첨부는 문서 id를 참조하므로 문서가 생긴 뒤에야 붙는데,
      // 먼저 상신해 두면 붙이다 실패했을 때 첨부 없는 문서가 이미 결재선에 올라가 있다.
      let id = draftId.current
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
      if (pending.count > 0) await pending.flush(id, () => APPROVAL_ATTACHMENT_TYPE)
      if (!asDraft) await saveDraft.mutateAsync({ ...payload, documentId: id, asDraft: false })
      toast.show(asDraft ? '임시저장했습니다.' : meta.label + '을 상신했습니다.', 'success')
      onSaved(id)
    } catch (e) {
      toast.show(errorText(e) ?? '저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  if (formsLoading && !forms) return <Spinner />

  const busy = saving || create.isPending || saveDraft.isPending

  return (
    <div className="space-y-5">
      <DetailTopBar
        back={<BackButton onClick={onCancel}>근태현황</BackButton>}
        actions={
          <>
            <Button variant="secondary" onClick={() => void submit(true)} disabled={busy}>
              임시저장
            </Button>
            <Button onClick={() => void submit(false)} disabled={busy}>
              기안하기
            </Button>
          </>
        }
      />

      {!form && (
        <Banner tone="warning">
          쓸 수 있는 {meta.formName} 양식이 없습니다. ADMIN 결재 양식 관리에서 양식을 켠 뒤 다시
          열어 주세요.
        </Banner>
      )}

      {/* 기안 화면과 같은 2:1 배치 — 왼쪽이 문서 본체이고, 오른쪽에는 문서에 곁들이는 것만 선다. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ApprovalBasicsCard
            groups={form ? [{ category: form.category || '공통', forms: [form] }] : []}
            categoryForms={form ? [form] : []}
            category={form?.category || ''}
            onCategoryChange={() => undefined}
            formId={form?.id ?? ''}
            onFormChange={() => undefined}
            form={form}
            // 이 화면의 양식은 주소가 정한다 — 고르는 칸이 아니라 무엇으로 올라가는지 보이는 칸이다.
            locked
            docNo={null}
            deptName={myDeptName}
            drafter={drafterParts}
            amount="-"
            createdAt={null}
          />

          <ApprovalLinePicker
            lines={lines}
            onLinesChange={setLines}
            recipientIds={recipientIds}
            onRecipientsChange={setRecipientIds}
            drafterId={uid}
          />

          <WorkRequestFieldsCard
            meta={meta}
            value={input}
            onChange={setInput}
            policy={policy ?? null}
          />

          {/* 카드 제목이 곧 이 칸의 라벨이다 — 상자 안에 같은 말을 한 번 더 적지 않는다. */}
          <Card title="사유">
            <TextArea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={meta.label + ' 사유를 적습니다(선택).'}
            />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-1">
          {/* 참조 화면의 `별첨`이 서는 자리(기안 화면·휴가 신청과 같은 부품). */}
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
