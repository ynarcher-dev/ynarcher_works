import { BackButton, Badge, Button, Card, EmptyState, Spinner, cardText } from '@ynarcher/ui'
import { useEffect, useMemo } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { ApprovalDecideBar } from '@/features/approval/ApprovalDecideBar'
import { ApprovalFieldsView } from '@/features/approval/ApprovalFieldsView'
import { ApprovalInfoTable } from '@/features/approval/ApprovalInfoTable'
import { approvalHeaderPairs } from '@/features/approval/approvalHeader'
import { ApprovalLinkPanel } from '@/features/approval/ApprovalLinkPanel'
import { ApprovalProgramPanel } from '@/features/approval/ApprovalProgramPanel'
import { ApprovalStampTable } from '@/features/approval/ApprovalStampTable'
import { useApprovalDocument, useMarkApprovalRead } from '@/features/approval/approvalApi'
import {
  APPROVAL_ATTACHMENT_TYPE,
  APPROVAL_FEEDBACK_TYPE,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  LINE_KIND_LABEL,
} from '@/features/approval/config'
import { formatMoney, parseFields } from '@/features/approval/fields'
import { isLastPending, isMyTurn } from '@/features/approval/model'
import { useEmployees } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'
import { useDepartments } from '@/features/management/orgHooks'

interface ApprovalDetailProps {
  documentId: string
  onBack: () => void
  /** 임시저장 문서를 고치러 간다(기안 화면 재사용). 기안자 본인에게만 열린다. */
  onEdit?: (id: string) => void
  /** 상호 참조로 걸린 다른 문서로 이동한다. */
  onOpenDocument?: (id: string) => void
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
export function ApprovalDetail({
  documentId,
  onBack,
  onEdit,
  onOpenDocument,
}: ApprovalDetailProps) {
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

  // 결재선 도장 위 칸의 직급·직책 — 기안 미리보기(ApprovalLinePicker)와 같은 표기 규칙.
  const jobTitle = useJobTitleLabel()
  const titleById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of employees ?? []) {
      const profile = (e.profile ?? {}) as Record<string, unknown>
      const rank = typeof profile.rank === 'string' ? profile.rank : ''
      const position = typeof profile.position === 'string' ? profile.position : ''
      m.set(e.id, jobTitle(rank, position))
    }
    return m
  }, [employees, jobTitle])
  const titleOf = (id: string | null) => (id ? (titleById.get(id) ?? '') : '')

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
  // 내가 문서를 끝낼 마지막 한 표인가 — 구분(결재·합의)에 상관없이 나 말고 남은 미처리 결재선이
  // 없으면 최종이다. 합의가 병렬이라 "순번이 뒤인가"로는 답할 수 없다.
  const isFinal = !!myLine && isLastPending(lines, myLine.id)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack}>문서함</BackButton>
        {/* 임시저장은 아직 조직에 내보내지 않은 문서라 기안자 본인이 고칠 수 있다.
            상신된 뒤에는 이 길을 닫는다 — 결재가 돌기 시작한 문서의 내용이 바뀌면
            이미 찍힌 도장이 무엇에 대한 것이었는지 판정할 근거가 사라진다.
            (같은 조건을 서버 RPC가 다시 확인한다 — 화면에서 숨기는 것은 보안이 아니다.) */}
        {onEdit && doc.status === 'DRAFT' && doc.drafter_id === uid && (
          <Button variant="outline" onClick={() => onEdit(doc.id)}>
            수정
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 표준 머리 — 모든 문서가 공유한다(양식이 정의하지 않는 부분).
              기안 화면과 같은 카드 구성을 쓴다(기본 설정 / 결재선) — 무엇을 적고 있는지와
              무엇이 적혔는지가 같은 자리에서 읽혀야 한다. */}
          <Card>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-title-md font-bold text-gray-900">
                  {doc.form?.name ?? '결재 문서'}
                </h2>
                <Badge tone={DOC_STATUS_TONE[doc.status]}>{DOC_STATUS_LABEL[doc.status]}</Badge>
              </div>

              <ApprovalInfoTable
                pairs={approvalHeaderPairs({
                  // 문서 종류는 두 단으로 적는다(대분류 > 양식) — 기안 화면에서 고른 경로 그대로.
                  formPath: doc.form ? `${doc.form.category || '공통'} > ${doc.form.name}` : '-',
                  docNo: doc.doc_no,
                  deptName,
                  drafter: {
                    name: nameOf(doc.drafter_id),
                    deptName: deptName === '-' ? '' : deptName,
                    jobTitle: titleOf(doc.drafter_id),
                  },
                  retentionGrade: doc.form
                    ? `${doc.form.retention} / ${doc.form.security_grade}`
                    : null,
                  amount: formatMoney(doc.amount),
                  createdAt: dateTime(doc.created_at),
                  completedAt: dateTime(doc.completed_at),
                })}
              />
            </div>
          </Card>

          <Card title="결재선">
            <ApprovalStampTable
              drafterId={doc.drafter_id}
              draftedAt={doc.created_at}
              lines={lines.map((l) => ({
                id: l.id,
                approverId: l.approver_id,
                stepOrder: l.step_order,
                decision: l.decision,
                kind: l.kind ?? 'APPROVAL',
                decidedAt: l.decided_at,
              }))}
              recipients={doc.approval_recipients.map((r) => ({
                userId: r.user_id,
                read: doc.approval_reads.some((rd) => rd.user_id === r.user_id),
              }))}
              nameOf={nameOf}
              titleOf={titleOf}
            />
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
                        {LINE_KIND_LABEL[l.kind ?? 'APPROVAL']}
                        {(l.kind ?? 'APPROVAL') === 'APPROVAL' ? ` ${l.step_order}차` : ''} ·{' '}
                        {nameOf(l.approver_id)} · {l.decision === 'APPROVED' ? '승인' : '반려'} ·{' '}
                        {dateTime(l.decided_at)}
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
            <ApprovalDecideBar
              documentId={doc.id}
              lineId={myLine.id}
              kind={myLine.kind ?? 'APPROVAL'}
              isFinal={isFinal}
            />
          )}
          {/* 첨부·연동·참조는 **읽기 전용**이다 — 붙이는 일은 기안·수정 화면에서 끝난다.
              도장이 찍히기 시작한 문서에 나중에 파일이나 연동이 붙으면, 결재자가 무엇을 보고
              승인했는지 판정할 근거가 사라진다. 고칠 길은 임시저장 문서의 [수정]뿐이다. */}
          <MaterialPanel
            targetType={APPROVAL_ATTACHMENT_TYPE}
            targetId={doc.id}
            title="첨부 파일"
            readOnly
          />
          {/* 워크스페이스 연동 — 이 결재가 어느 사업(AC·M&A·PROJECT)의 일인가.
              상호 참조보다 위에 둔다: 문서를 열고 처음 묻는 것이 소속이기 때문이다. */}
          <ApprovalProgramPanel documentId={doc.id} />
          {/* 상호 참조 — 기안 때 건 문서의 상세에도 이 문서가 나타난다(원장 행이 쌍마다 하나). */}
          <ApprovalLinkPanel documentId={doc.id} onOpen={onOpenDocument} />
          <FeedbackPanel targetType={APPROVAL_FEEDBACK_TYPE} targetId={doc.id} />
        </div>
      </div>
    </div>
  )
}
