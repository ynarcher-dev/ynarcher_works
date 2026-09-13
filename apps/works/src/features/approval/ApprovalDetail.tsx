import {
  BackButton,
  Badge,
  Banner,
  Card,
  DetailTopBar,
  EmptyState,
  Spinner,
  cardText,
  useToast,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { ApprovalDecideModal } from '@/features/approval/ApprovalDecideModal'
import { ApprovalFieldsView } from '@/features/approval/ApprovalFieldsView'
import { ApprovalInfoTable } from '@/features/approval/ApprovalInfoTable'
import { HiworksSourceMark } from '@/features/approval/HiworksSourceMark'
import { ApprovalDetailActions } from '@/features/approval/ApprovalDetailActions'
import { approvalHeaderPairs } from '@/features/approval/approvalHeader'
import { ApprovalLinkPanel } from '@/features/approval/ApprovalLinkPanel'
import { LegacyApprovalLineTable } from '@/features/approval/LegacyApprovalLineTable'
import { ApprovalProgramPanel } from '@/features/approval/ApprovalProgramPanel'
import { ApprovalStampTable } from '@/features/approval/ApprovalStampTable'
import { BudgetSummaryCard } from '@/features/approval/BudgetSummaryCard'
import { BudgetRefContext } from '@/features/approval/budgetRefContext'
import { budgetTotal as sumBudget } from '@/features/approval/budget'
import { useBudgetStatus } from '@/features/approval/budgetApi'
import { useBudgetSourceState } from '@/features/approval/budgetSourceHooks'
import { useApprovalDocument, useMarkApprovalRead } from '@/features/approval/approvalApi'
import {
  APPROVAL_ATTACHMENT_TYPE,
  APPROVAL_FEEDBACK_TYPE,
  LINE_KIND_LABEL,
} from '@/features/approval/config'
import {
  budgetAmountColumn,
  budgetField,
  budgetValue,
  formatMoney,
  parseFields,
  tableRows,
  type FieldValues,
} from '@/features/approval/fields'
import { ApprovalCommentModal } from '@/features/approval/ApprovalCommentModal'
import {
  actionableLineFor,
  approvalFormDisplayName,
  isLastPending,
} from '@/features/approval/model'
import {
  approvalStatusLabel,
  approvalStatusTone,
} from '@/features/approval/approvalDraftActions'
import { maxRound, stampLinesForRound } from '@/features/approval/stampRounds'
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
 * 문서에 붙는 것들(첨부·연동·참조·의견).
 *
 * **결재 처리는 우측에 두지 않는다**(2026-08-26). 승인·반려 칸이 문서 옆에 상시로 펼쳐져
 * 있으면 다 읽기 전에 손이 먼저 나가므로, 상단 [○○ 처리] 버튼 → 창(ApprovalDecideModal)으로
 * 옮겼다.
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
  const toast = useToast()
  // 결재 처리 창의 열림 여부. 문서를 다 읽고 [○○ 처리]를 누른 사람만 결정 앞에 선다.
  const [deciding, setDeciding] = useState(false)
  // 지금 열어 읽고 있는 결재 의견의 결재선 행. 의견은 도장을 눌러야 열린다.
  const [commentLineId, setCommentLineId] = useState<string | null>(null)
  // 지난 회차 이력의 펼침 상태. 기본은 접힘 — 대부분의 문서는 1차이고, 되돌아온 문서도
  // 지금 할 일은 현재 회차가 답한다.
  const [showHistory, setShowHistory] = useState(false)

  // 이 문서가 가리키는 품의(지출결의의 근거 / 변경 품의의 대상)와 이 문서 자신의 예산 사용 현황.
  // 훅은 문서를 못 읽는 경우의 조기 반환보다 앞에 둔다 — 렌더마다 훅 순서가 같아야 한다.
  // 지출 내역의 '예산 줄' 값을 이름으로 펴려면 근거 품의의 예산표가 필요하다(기안 화면과
  // 같은 파생을 쓴다 — 고르는 자리와 읽는 자리가 다른 규칙으로 줄을 세우면 안 된다).
  const {
    sourceDoc,
    usage: sourceUsage,
    usageError: sourceUsageError,
    refSource: budgetRefSource,
  } = useBudgetSourceState(doc?.budget_document_id ?? null, '근거 품의를 읽을 수 없습니다.')
  const { data: ownUsage } = useBudgetStatus(doc?.id ?? null)
  // 변경 품의의 예산표는 **남의 예산을 바꾸자는 안**이다. 지출은 대상 품의에 걸려 있으므로
  // 자기 사용 현황(늘 0)을 붙이면 "아무도 안 썼으니 전액 쓸 수 있다"고 읽힌다. 대상 품의의
  // 사용·결재 중을 붙여야 변경 후 예산이 이미 나간 돈에 못 미치는지가 그 자리에서 보인다.
  const isRevise = doc?.form?.budget_link === 'REVISE'
  const budgetUsage = isRevise ? sourceUsage : ownUsage

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
  // 이 문서가 예산표를 가졌는가 = 이 문서가 품의서인가. 양식 설정이 아니라 필드가 답한다
  // (같은 사실을 두 곳에 적지 않는다 — 서버 app.approval_budget_keys도 같은 규칙이다).
  const ownBudgetField = budgetField(fields)
  const ownBudgetAmountColumn = ownBudgetField ? budgetAmountColumn(ownBudgetField) : null
  const ownBudgetTotal =
    ownBudgetField && ownBudgetAmountColumn
      ? sumBudget(
          budgetValue((doc.field_values ?? {}) as FieldValues, ownBudgetField.key).rows,
          ownBudgetAmountColumn.key,
        )
      : null
  const paymentFields = doc.legacy ? fields.filter((field) => field.key === 'payments') : []
  const bodyFields = fields.filter(
    (field) =>
      field.type !== 'BUDGET_TREE' &&
      (!paymentFields.length || field.key !== 'payments') &&
      !(
        ownBudgetField &&
        field.key === 'amount' &&
        field.label === '품의 금액' &&
        (field.type === 'MONEY' || field.type === 'NUMBER')
      ),
  )
  const hasPayments = paymentFields.some(
    (field) => field.type === 'TABLE' && tableRows(doc.field_values ?? {}, field.key).length > 0,
  )
  const lines = doc.approval_lines
  // 회차 — 보완 재상신이 새 회차를 쌓고, 모든 진행 판정은 현재 회차 안에서만 이뤄진다.
  const round = maxRound(lines)
  // 같은 사람이 여러 자리에 설 수 있으므로 배열에서 그 사람의 첫 PENDING을 고르지 않는다.
  // 구분별 현재 순번을 먼저 계산한 뒤 그중 내 자리를 고른다.
  const myLine = uid ? actionableLineFor(lines, uid) : undefined
  const canDecide =
    Boolean(myLine) &&
    (doc.status === 'PENDING' || doc.status === 'IN_REVIEW')
  // 내가 문서를 끝낼 마지막 한 표인가 — 구분(결재·합의)에 상관없이 나 말고 남은 미처리 결재선이
  // 없으면 최종이다. 구분이 셋으로 나뉜 뒤로는 "순번이 뒤인가"로 답할 수 없다.
  const isFinal = !!myLine && isLastPending(lines, myLine.id)
  /**
   * 결재선 표에 세울 도장 행 — 현재 회차 + 보완 뒤에도 유지되는 지난 회차 승인(stampRounds).
   * 순번을 원장 값이 아니라 정렬 후의 자리로 매기는 이유는 의견 창이 **표에 선 것과 같은
   * 숫자**를 적어야 하기 때문이다(저장된 step_order를 그대로 쓰면 임시저장을 고치며 중간이
   * 빠졌을 때 표는 1·2인데 창은 2·4를 말한다).
   */
  const stampLines = stampLinesForRound(lines, round)
  // 지난 회차는 접어 둔다 — 지금 무엇을 해야 하는지는 현재 회차가 답하고, 옛 회차는
  // "그때 누가 무엇을 했나"를 되짚을 때만 필요하다.
  const pastRounds = Array.from({ length: round - 1 }, (_, i) => round - 1 - i)
  const openedComment = stampLines.find((l) => l.id === commentLineId)
  const isHiworks = doc.legacy?.source_system === 'HIWORKS'
  const canConfirmRecipient = Boolean(
    uid &&
      doc.approval_recipients.some((r) => r.user_id === uid) &&
      !doc.approval_reads.some((r) => r.user_id === uid),
  )
  const confirmRecipient = () => {
    if (!uid || !canConfirmRecipient || markRead.isPending) return
    markRead.mutate(
      { documentIds: [doc.id], userId: uid },
      {
        onSuccess: () => toast.show('문서를 확인했습니다.', 'success'),
        onError: () => toast.show('확인 처리에 실패했습니다.', 'danger'),
      },
    )
  }
  return (
    <div className="space-y-5">
      <DetailTopBar
        back={<BackButton onClick={onBack}>문서함</BackButton>}
        actions={
          // 이 문서에서 내가 할 수 있는 일 — 기안자 축과 결재자 축의 판정이 한 자리에 모인다.
          <ApprovalDetailActions
            doc={doc}
            uid={uid}
            onEdit={onEdit}
            onDeleted={onBack}
            onDecide={() => setDeciding(true)}
            decideKindLabel={
              canDecide && myLine ? LINE_KIND_LABEL[myLine.kind ?? 'APPROVAL'] : null
            }
          />
        }
      />

      {canDecide && myLine && (
        <ApprovalDecideModal
          open={deciding}
          onClose={() => setDeciding(false)}
          documentId={doc.id}
          lineId={myLine.id}
          kind={myLine.kind ?? 'APPROVAL'}
          isFinal={isFinal}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">

          {/* 표준 머리 — 모든 문서가 공유한다(양식이 정의하지 않는 부분).
              기안 화면과 같은 카드 구성을 쓴다(기본 설정 / 결재선) — 무엇을 적고 있는지와
              무엇이 적혔는지가 같은 자리에서 읽혀야 한다. */}
          <Card className={isHiworks ? 'border-info' : undefined}>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
                <h2 className="inline-flex items-center gap-1 text-title-md font-bold text-gray-900">
                  {isHiworks && <HiworksSourceMark />}
                  <span>{doc.form ? approvalFormDisplayName(doc.form.name) : '결재 문서'}</span>
                </h2>
                {/* 취소된 문서는 '임시저장'이 아니라 '기안 취소'로 선다 — 도장을 찍었던
                    결재자가 이 배지만 보고도 무슨 일이 있었는지 알아야 한다. */}
                <Badge tone={approvalStatusTone(doc.status, lines)}>
                  {approvalStatusLabel(doc.status, lines)}
                </Badge>
                {/* 회차는 1차일 때 적지 않는다 — 대부분의 문서가 1차이고, 늘 붙어 있으면
                    '2차'라는 사실이 눈에 걸리지 않는다. 예외일 때만 말하는 표식이다. */}
                {round > 1 && <Badge tone="neutral">{round}차 상신</Badge>}
              </div>

              <ApprovalInfoTable
                pairs={approvalHeaderPairs({
                  // 문서 종류는 두 단으로 적는다(대분류 > 양식) — 기안 화면에서 고른 경로 그대로.
                  formPath: doc.form
                    ? `${doc.form.category || '공통'} > ${approvalFormDisplayName(doc.form.name)}`
                    : '-',
                  docNo: doc.doc_no,
                  deptName,
                  drafter: {
                    name: nameOf(doc.drafter_id),
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

          {doc.budget_document_id && (
            <Card title={doc.form?.budget_link === 'REVISE' ? '변경 대상 품의' : '근거 품의'}>
              {sourceDoc ? (
                <button
                  type="button"
                  onClick={() => onOpenDocument?.(sourceDoc.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <Badge tone="neutral">{sourceDoc.docNo ?? '번호 없음'}</Badge>
                  <span className="min-w-0 flex-1 truncate text-body text-gray-900 hover:underline">
                    {sourceDoc.title}
                  </span>
                  <span className="tabular-nums text-body text-gray-700">
                    {formatMoney(sourceDoc.amount)}
                  </span>
                </button>
              ) : (
                // 열람 권한이 없어도 **걸려 있다는 사실은 감추지 않는다** — 그 사실이 곧
                // 이 지출이 어딘가의 예산을 쓰고 있다는 뜻이라 결재 판단에 든다.
                <p className={cardText.meta}>연결된 품의를 열람할 권한이 없습니다.</p>
              )}
            </Card>
          )}

          <Card title="결재선">
            {doc.legacy ? (
              <LegacyApprovalLineTable
                participants={doc.legacy.participants ?? []}
                drafterId={doc.drafter_id}
                draftedAt={doc.created_at}
                nameOf={nameOf}
                titleOf={titleOf}
              />
            ) : (
              <ApprovalStampTable
                drafterId={doc.drafter_id}
                draftedAt={doc.created_at}
                lines={stampLines}
                recipients={doc.approval_recipients.map((r) => ({
                  key: r.user_id,
                  userId: r.user_id,
                  read: doc.approval_reads.some((rd) => rd.user_id === r.user_id),
                }))}
                nameOf={nameOf}
                titleOf={titleOf}
                // 내 차례의 도장 칸은 '대기'가 아니라 누를 수 있는 [처리] 자리가 된다 —
                // 상단 버튼과 같은 창을 연다. 결재선을 보다가 자기 칸에서 바로 손이 가는 것이
                // 자연스럽고, 어느 칸이 내 차례인지도 그 자리에서 답한다.
                actionableLineId={canDecide && myLine ? myLine.id : null}
                onAction={() => setDeciding(true)}
                confirmableRecipientId={uid}
                onConfirmRecipient={canConfirmRecipient ? confirmRecipient : undefined}
                confirmingRecipient={markRead.isPending}
                // 의견이 남은 도장은 눌러 읽는다 — 특히 보완은 사유가 곧 다음에 할 일이라,
                // 본문 아래까지 내려가지 않고 그 칸에서 바로 열리는 편이 맞다.
                onOpenComment={setCommentLineId}
              />
            )}

            {/* 지난 회차는 접어 둔다 — 지금 무엇을 해야 하는지는 현재 회차가 답하고, 옛 회차는
                "그때 누가 무엇을 했나"를 되짚을 때만 필요하다. 펼친 표는 누를 수 없다(처리도
                의견 열기도 없다) — 끝난 회차에서 할 수 있는 일은 읽는 것뿐이다. */}
            {!doc.legacy && pastRounds.length > 0 && (
              <div className="mt-3 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-body-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  {showHistory ? '지난 회차 접기' : `지난 회차 결재 이력 (${pastRounds.length}건)`}
                </button>
                {showHistory && (
                  <div className="mt-3 space-y-4">
                    {pastRounds.map((r) => (
                      <div key={r} className="space-y-1.5">
                        <p className={cardText.meta}>{r}차</p>
                        <ApprovalStampTable
                          drafterId={doc.drafter_id}
                          draftedAt={doc.created_at}
                          lines={stampLinesForRound(lines, r)}
                          recipients={[]}
                          nameOf={nameOf}
                          titleOf={titleOf}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {openedComment && (
            <ApprovalCommentModal
              view={{
                kind: openedComment.kind,
                seq: openedComment.seq,
                name: nameOf(openedComment.approverId),
                title: titleOf(openedComment.approverId),
                // 의견이 있는 도장만 눌리므로 여기 오는 행은 반드시 처리된 행이다.
                decision:
                  openedComment.decision === 'REVISION_REQUESTED'
                    ? 'REVISION_REQUESTED'
                    : openedComment.decision === 'REJECTED'
                      ? 'REJECTED'
                      : 'APPROVED',
                decidedAt: openedComment.decidedAt,
                comment: openedComment.comment ?? '',
              }}
              onClose={() => setCommentLineId(null)}
            />
          )}

          <Card title={doc.title}>
            {/* 지출 내역의 '예산 줄' 칸은 줄 id 하나를 저장하고 이름은 근거 품의가 갖는다.
                이름을 지출 문서에 복사해 두지 않는 이유는 예산 변경으로 항목명이 바뀌는 날
                그 지출만 옛 이름으로 남기 때문이다. */}
            <BudgetRefContext.Provider value={budgetRefSource}>
              <ApprovalFieldsView
                fields={bodyFields}
                values={doc.field_values ?? {}}
                hideEmpty={Boolean(doc.legacy)}
                documentContext={{ title: doc.title, docNo: doc.doc_no }}
                // 예산표에는 지금까지 나간 돈이 함께 선다 — 예산만 보이는 표는 "얼마 남았나"
                // 라는 실제 물음에 답하지 못한다(변경 품의는 대상 품의의 사용 현황이 답한다).
                budgetUsage={budgetUsage}
              />
            </BudgetRefContext.Provider>
            {/* 양식 도입 전 문서(구 body 단일 텍스트)도 그대로 읽힌다. */}
            {fields.length === 0 && doc.body && (
              <p className={`whitespace-pre-wrap ${cardText.value}`}>{doc.body}</p>
            )}
          </Card>

          {/* 예산표는 품의서 본문과 독립된 카드로 읽는다. 작성 화면과 같은 카드 경계라
              단계별 분류·수량·금액이 일반 본문 필드에 딸린 표로 오해되지 않는다. */}
          {ownBudgetField && (
            <Card title={ownBudgetField.label}>
              {isRevise && sourceUsageError && (
                // 0으로 채우지 않는다 — 모르는 것을 숫자로 적으면 초과가 숨는다.
                <Banner tone="danger" className="mb-2">
                  변경 대상 품의의 사용 현황을 읽지 못했습니다. 아래 표의 사용·남음 칸은 서지
                  않습니다.
                </Banner>
              )}
              <ApprovalFieldsView
                fields={[ownBudgetField]}
                values={doc.field_values ?? {}}
                hideSectionLabels
                budgetUsage={budgetUsage}
              />
            </Card>
          )}

          {/* 예산 현황(품의 금액·사용·결재 중·남음·이익률)과 예산 변경 이력.
              예산표를 가진 문서, 곧 품의서에만 선다 — 지출결의서에는 자기 예산이 없다. */}
          {ownBudgetField && (
            <BudgetSummaryCard
              // 변경 품의에서는 이력도 대상 품의의 것이다(이 문서는 아직 이력이 없다).
              documentId={isRevise ? (doc.budget_document_id ?? doc.id) : doc.id}
              budgetTotal={ownBudgetTotal}
              usage={budgetUsage}
              nameOf={nameOf}
              title={isRevise ? '변경 후 예산 현황(대상 품의 기준)' : undefined}
              help={
                isRevise
                  ? '사용·결재 중 금액은 변경 대상 품의에 이미 걸린 지출입니다. 사용 가능액이 음수이면 변경 후 예산이 이미 나간 돈에 못 미친다는 뜻이며, 상신은 막지 않습니다.'
                  : undefined
              }
              totalLabel={isRevise ? '변경 후 예산' : undefined}
            />
          )}

          {hasPayments && (
            <Card title="지급표">
              <ApprovalFieldsView
                fields={paymentFields}
                values={doc.field_values ?? {}}
                hideEmpty
                hideSectionLabels
              />
            </Card>
          )}

        </div>

        <div className="space-y-4 lg:col-span-1">
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
