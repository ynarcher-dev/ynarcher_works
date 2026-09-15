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
import { findLeaveForm, leaveFieldValues, leaveTypeOptions } from '@/features/approval/leaveForm'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { useAttendanceMonth } from '@/features/management/attendance/attendanceApi'
import { useAttendanceStatuses } from '@/features/management/attendance/attendanceConfigApi'
import { LeaveDaySelectCard } from '@/features/management/attendance/leave/LeaveDaySelectCard'
import {
  LEAVE_WINDOW_DAYS,
  LEAVE_WINDOW_STEP,
  buildLeaveDays,
  fillLeaveRange,
  leaveSummary,
  leaveTitle,
  leaveWindowStart,
  toggleLeaveDate,
  type LeaveSelectMode,
} from '@/features/management/attendance/leave/leaveSelection'
import { useDepartments } from '@/features/management/orgHooks'
import { useEmployees } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'

interface LeaveRequestEditorProps {
  /** 근태현황으로 돌아간다. */
  onCancel: () => void
  /** 문서가 만들어진 뒤 갈 곳(전자결재 상세). */
  onSaved: (documentId: string) => void
}

/**
 * 휴가 신청 — 마이오피스 `근태현황`에서 여는 전용 기안 화면.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * **만들어지는 것은 전자결재 문서다.** 휴가는 결재가 만드는 것이라는 규칙(캘린더의 휴가 행도
 * 결재만 만든다)은 그대로이고, 달라진 것은 입력 화면 하나다 — 기본 설정과 결재선은 기안
 * 화면과 **같은 부품**을 쓰고(`ApprovalBasicsCard`·`ApprovalLinePicker`), 본문 자리만 휴가가
 * 묻는 것(종류·사용일·사유)으로 바뀐다. 같은 부품을 쓰는 것이 요점이다 — 결재선 규칙이 두
 * 벌로 갈리면 같은 조직도가 화면마다 다른 결재선을 만든다.
 *
 * 양식은 고를 수 없다 — 이 화면의 주소가 곧 `휴가신청서`다. 그래서 기본 설정의 문서 종류는
 * 잠긴 채로 무엇으로 올라가는지만 보인다.
 *
 * 제목도 손으로 적지 않는다. 휴가 문서의 제목에 적을 것은 종류와 기간뿐이라, 손에 맡기면 같은
 * 신청이 사람마다 다른 이름으로 문서함에 선다(`leaveTitle`이 소유한다).
 */
export function LeaveRequestEditor({ onCancel, onSaved }: LeaveRequestEditorProps) {
  const toast = useToast()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: forms, isLoading: formsLoading } = useApprovalForms()
  const { data: employees } = useEmployees()
  const { data: departments } = useDepartments()
  const { data: statuses } = useAttendanceStatuses()
  const jobTitle = useJobTitleLabel()
  const create = useCreateApproval()
  const saveDraft = useSaveApprovalDraft()
  const pending = usePendingMaterials()

  const [type, setType] = useState('')
  const [mode, setMode] = useState<LeaveSelectMode>('DATES')
  const [selected, setSelected] = useState<string[]>([])
  // 기간 선택에서 먼저 집은 한쪽 끝. 두 번째를 집으면 그 사이가 채워지고 비워진다.
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<ApprovalLineInput>(EMPTY_LINES)
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  // 이 화면이 만든 임시저장 문서. 재시도는 새 문서를 만들지 않고 이것을 다시 쓴다.
  const draftId = useRef<string | null>(null)

  // 달력이 펴 보이는 창. 시작은 이번 주 월요일이고 화살표가 한 주씩 민다.
  const [windowStart, setWindowStart] = useState(() => leaveWindowStart(dayjs()))
  const from = windowStart.format('YYYY-MM-DD')
  const to = windowStart.add(LEAVE_WINDOW_DAYS - 1, 'day').format('YYYY-MM-DD')
  const today = dayjs().format('YYYY-MM-DD')
  // 창을 넘길 때 이전 창의 값을 든 채로 새 창을 받는다 — 그러지 않으면 화살표를 누를 때마다
  // 달력이 한 번 비고, 그 빈손이 화면에서 깜빡임으로 보인다.
  const { data: monthRows } = useAttendanceMonth(uid ?? undefined, from, to, {
    keepPrevious: true,
  })

  const leaveStatusLabels = useMemo(
    () => (statuses ?? []).filter((s) => s.kind === 'LEAVE' && s.isActive).map((s) => s.label),
    [statuses],
  )
  const form = useMemo(() => findLeaveForm(forms ?? []), [forms])
  const fields = useMemo(() => parseFields(form?.current_version?.fields), [form])
  const typeOptions = useMemo(
    () => leaveTypeOptions(fields, leaveStatusLabels),
    [fields, leaveStatusLabels],
  )
  const days = useMemo(() => buildLeaveDays(monthRows ?? [], statuses ?? []), [monthRows, statuses])
  const summary = useMemo(() => leaveSummary(selected, days), [selected, days])

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

  /**
   * 고르는 방식을 바꾸면 고른 것을 비운다.
   *
   * 남겨 두면 날짜로 집어 둔 흩어진 날들이 구간의 한쪽 끝으로 읽히거나 그 반대가 되어, 다음에
   * 집는 한 번이 무엇을 뜻하는지 화면과 사람이 다르게 안다. 그래서 두 번째 줄에 그 사실을 적어 둔다.
   */
  const changeMode = (next: LeaveSelectMode) => {
    if (next === mode) return
    setMode(next)
    setSelected([])
    setRangeAnchor(null)
  }

  const pick = (date: string) => {
    if (mode === 'DATES') {
      setSelected((prev) => toggleLeaveDate(prev, date))
      return
    }
    // 기간: 첫 번째는 한쪽 끝을 잡고, 두 번째에 그 사이의 고를 수 있는 날을 채운다.
    if (!rangeAnchor) {
      setRangeAnchor(date)
      setSelected([date])
      return
    }
    setSelected(fillLeaveRange(days, rangeAnchor, date))
    setRangeAnchor(null)
  }

  const submit = async (asDraft: boolean) => {
    if (saving) return
    if (!form || !form.current_version_id) {
      toast.show('휴가신청서 양식을 찾지 못했습니다. ADMIN 결재 양식 관리를 확인하세요.', 'danger')
      return
    }
    const values = leaveFieldValues({
      type,
      dates: selected,
      reason,
      listDates: summary.broken,
    })
    // 임시저장은 아직 조직에 내보내는 문서가 아니라 필수값·결재선을 강제하지 않는다
    // (기안 화면과 같은 규약).
    if (!asDraft) {
      if (!type) {
        toast.show('휴가 종류를 고르세요.', 'warning')
        return
      }
      if (selected.length === 0) {
        toast.show('휴가 사용일을 하루 이상 고르세요.', 'warning')
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
        title: leaveTitle(type, summary),
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
      toast.show(asDraft ? '임시저장했습니다.' : '휴가를 상신했습니다.', 'success')
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
          쓸 수 있는 휴가신청서 양식이 없습니다. ADMIN 결재 양식 관리에서 양식을 켠 뒤 다시 열어
          주세요.
        </Banner>
      )}

      {/* 기안 화면과 같은 2:1 배치 — 왼쪽이 문서 본체이고, 오른쪽에는 문서에 곁들이는 것만
          선다(붙이는 일은 전부 기안 시점에 끝난다). */}
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

          {/* 카드는 한 번 서면 자리를 지킨다 — 창을 넘기는 동안 달력 자리만 바뀐다. */}
          <LeaveDaySelectCard
            typeOptions={typeOptions}
            typeValue={type}
            onTypeChange={setType}
            mode={mode}
            onModeChange={changeMode}
            days={days}
            selected={selected}
            rangeAnchor={rangeAnchor}
            today={today}
            onPick={pick}
            onRemove={(date) => setSelected((prev) => prev.filter((d) => d !== date))}
            onClearAll={() => {
              setSelected([])
              setRangeAnchor(null)
            }}
            onPrev={() => setWindowStart(windowStart.subtract(LEAVE_WINDOW_STEP, 'day'))}
            onNext={() => setWindowStart(windowStart.add(LEAVE_WINDOW_STEP, 'day'))}
          />

          {/* 카드 제목이 곧 이 칸의 라벨이다 — 상자 안에 같은 말을 한 번 더 적지 않는다. */}
          <Card title="사유">
            <TextArea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="휴가 사유를 적습니다(선택)."
            />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-1">
          {/* 참조 화면의 `별첨`이 서는 자리. 2:1 배치에서는 문서에 곁들이는 것들이 오른쪽에
              모이므로, 기안 화면과 같은 자리·같은 부품을 쓴다. */}
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
