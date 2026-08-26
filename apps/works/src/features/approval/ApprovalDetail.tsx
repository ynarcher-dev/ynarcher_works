import { BackButton, Badge, Card, EmptyState, Spinner, cardText } from '@ynarcher/ui'
import { useEffect, useMemo } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { ApprovalDecideBar } from '@/features/approval/ApprovalDecideBar'
import { ApprovalFieldsView } from '@/features/approval/ApprovalFieldsView'
import { ApprovalInfoTable } from '@/features/approval/ApprovalInfoTable'
import { ApprovalStampRows } from '@/features/approval/ApprovalStampRows'
import { useApprovalDocument, useMarkApprovalRead } from '@/features/approval/approvalApi'
import {
  APPROVAL_ATTACHMENT_TYPE,
  APPROVAL_FEEDBACK_TYPE,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
} from '@/features/approval/config'
import { formatMoney, parseFields } from '@/features/approval/fields'
import { isMyTurn } from '@/features/approval/model'
import { useEmployees } from '@/features/management/hooks'
import { useDepartments } from '@/features/management/orgHooks'

interface ApprovalDetailProps {
  documentId: string
  onBack: () => void
}

function dateTime(v: string | null): string {
  return v ? v.slice(0, 19).replace('T', ' ') : '-'
}

/**
 * 결재 문서 상세 — 좌 2/3는 문서 자체(표준 머리 → 결재선 도장 → 제목·본문), 우 1/3은
 * 문서에 붙는 것들(결재 처리·첨부·의견).
 *
 * 하이웍스는 별첨과 의견을 본문 아래에 세로로 쌓았지만, 이 서비스의 상세 화면은 본문과
 * 부속을 좌우로 가르는 문법을 이미 갖고 있다(회의록·스타트업·사업). 첨부·의견은 그 문법
 * 그대로 우측 패널로 옮기고, 공용 부품(MaterialPanel·FeedbackPanel)을 다형 키 'approval'로
 * 주입해 쓴다 — 결재 전용 첨부·댓글 원장을 새로 만들면 같은 기능이 두 벌이 된다.
 */
export function ApprovalDetail({ documentId, onBack }: ApprovalDetailProps) {
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data: doc, isLoading } = useApprovalDocument(documentId)
  const { data: employees } = useEmployees()
  const { data: departments } = useDepartments(true)
  const markRead = useMarkApprovalRead()

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees ?? []) m.set(e.id, e.name)
    return m
  }, [employees])
  const nameOf = (id: string | null) => (id ? (nameById.get(id) ?? '-') : '-')

  const deptName = useMemo(() => {
    if (!doc?.department_id) return '-'
    return (departments ?? []).find((d) => d.id === doc.department_id)?.name ?? '-'
  }, [departments, doc?.department_id])

  // 문서를 연 순간 열람 확인을 남긴다(확인함 뱃지·참조자 체크마크의 원천).
  // 이미 읽은 문서는 다시 찍지 않는다 — 열 때마다 쓰면 읽은 시각이 계속 밀린다.
  const alreadyRead = Boolean(uid && doc?.approval_reads.some((r) => r.user_id === uid))
  useEffect(() => {
    if (!uid || !doc || alreadyRead) return
    markRead.mutate({ documentId, userId: uid })
    // markRead는 매 렌더 새 객체라 의존성에 넣으면 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, doc?.id, alreadyRead, documentId])

  if (isLoading && !doc) return <Spinner />
  if (!doc) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack}>문서함</BackButton>
        <EmptyState
          title="문서를 열 수 없습니다"
          description="삭제되었거나 열람 권한이 없는 문서입니다."
        />
      </div>
    )
  }

  const fields = parseFields(doc.version?.fields)
  const lines = doc.approval_lines
  const myLine = uid
    ? lines.find((l) => l.approver_id === uid && l.decision === 'PENDING')
    : undefined
  const canDecide =
    Boolean(myLine) &&
    (doc.status === 'PENDING' || doc.status === 'IN_REVIEW') &&
    isMyTurn(lines, uid ?? '')
  // 내가 마지막 결재자인가 — 나보다 뒤 순번에 아직 처리 안 된 결재선이 없으면 최종이다.
  const isFinal =
    !!myLine && !lines.some((l) => l.step_order > myLine.step_order && l.decision === 'PENDING')

  return (
    <div className="space-y-5">
      <BackButton onClick={onBack}>문서함</BackButton>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 표준 머리 — 모든 문서가 공유한다(양식이 정의하지 않는 부분).
              양식 이름을 문서 제목처럼 가운데에 세우고 그 아래 한 표 안에서 정보·결재선·참조가
              이어진다 — 결재 문서가 종이와 기존 시스템에서 갖던 모양이다. */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-title-md font-bold text-gray-900">
                  {doc.form?.name ?? '결재 문서'}
                </h2>
                <Badge tone={DOC_STATUS_TONE[doc.status]}>{DOC_STATUS_LABEL[doc.status]}</Badge>
              </div>

              <ApprovalInfoTable
                pairs={[
                  { label: '문서 종류', value: doc.form?.name ?? '-' },
                  { label: '문서 번호', value: doc.doc_no ?? '미채번' },
                  { label: '기안 부서', value: deptName },
                  { label: '기안자', value: nameOf(doc.drafter_id) },
                  {
                    label: '보존 연한 / 보안 등급',
                    value: doc.form ? `${doc.form.retention} / ${doc.form.security_grade}` : '-',
                  },
                  { label: '문서 금액', value: formatMoney(doc.amount) },
                  { label: '기안 일시', value: dateTime(doc.created_at) },
                  { label: '완료 일시', value: dateTime(doc.completed_at) },
                ]}
              >
                <ApprovalStampRows
                  lines={lines.map((l) => ({
                    id: l.id,
                    approverId: l.approver_id,
                    stepOrder: l.step_order,
                    decision: l.decision,
                    decidedAt: l.decided_at,
                  }))}
                  recipients={doc.approval_recipients.map((r) => ({
                    userId: r.user_id,
                    read: doc.approval_reads.some((rd) => rd.user_id === r.user_id),
                  }))}
                  nameOf={nameOf}
                />
              </ApprovalInfoTable>
            </div>
          </Card>

          <Card title={doc.title}>
            <ApprovalFieldsView fields={fields} values={doc.field_values ?? {}} />
            {/* 양식 도입 전 문서(구 body 단일 텍스트)도 그대로 읽힌다. */}
            {fields.length === 0 && doc.body && (
              <p className={`whitespace-pre-wrap ${cardText.value}`}>{doc.body}</p>
            )}
          </Card>

          {/* 결재 의견 — 승인·반려에 붙은 기록. 코멘트(우측)와는 축이 다르다. */}
          {lines.some((l) => l.comment) && (
            <Card title="결재 의견">
              <ul className="space-y-2">
                {lines
                  .filter((l) => l.comment)
                  .sort((a, b) => a.step_order - b.step_order)
                  .map((l) => (
                    <li key={l.id} className="border-b border-gray-100 pb-2 last:border-b-0">
                      <p className={cardText.meta}>
                        {l.step_order}차 {nameOf(l.approver_id)} ·{' '}
                        {l.decision === 'APPROVED' ? '승인' : '반려'} · {dateTime(l.decided_at)}
                      </p>
                      <p className={`mt-1 whitespace-pre-wrap ${cardText.value}`}>{l.comment}</p>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:col-span-1">
          {canDecide && myLine && (
            <ApprovalDecideBar documentId={doc.id} lineId={myLine.id} isFinal={isFinal} />
          )}
          <MaterialPanel
            targetType={APPROVAL_ATTACHMENT_TYPE}
            targetId={doc.id}
            title="첨부 파일"
            readOnly={doc.drafter_id !== uid}
          />
          <FeedbackPanel targetType={APPROVAL_FEEDBACK_TYPE} targetId={doc.id} />
        </div>
      </div>
    </div>
  )
}
