import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyValue,
  Select,
  SegmentedToggle,
  Skeleton,
  cardText,
  type Column,
} from '@ynarcher/ui'
import {
  assignmentProgressRows,
  collectionSummary,
  fileCollectionStatusLabel,
  fileCollectionStatusTone,
  fractionText,
  nodePath,
  questionNodes,
  questionProgressRows,
  roundLabel,
  type AssignmentProgressRow,
  type FileCollectionAssignmentDto,
  type FileCollectionNodeDto,
  type FileCollectionResponseDto,
  type FileCollectionStatus,
  type QuestionProgressRow,
} from '@ynarcher/master-data'
import { useMemo, useState } from 'react'
import { ResponseDetailModal } from '@/features/program/fileCollection/ResponseDetailModal'
import type { MonitorResponseRow as ResponseRow } from '@/features/program/fileCollection/monitorRow'

type MonitorView = 'targets' | 'questions'

/** 제출 내역 표에 한 번에 그리는 줄 수의 상한. 넘치면 화면이 그 사실을 적는다. */
const RESPONSE_ROW_LIMIT = 500

/**
 * 제출 관제 탭 — 들어온 것과 **안 들어온 것**을 함께 본다.
 *
 * 미제출을 목록에서 빼지 않는 것이 이 화면의 핵심이다. 제출된 것만 세우면 관제 화면이 언제나
 * '할 일 없음'으로 보이고, 정작 독촉할 대상이 화면에 존재하지 않는다. 그래서 응답 행이 아직
 * 서지 않은 조합(배정 직후)까지 미제출 줄로 만들어 세운다.
 */
export function CollectionMonitorTab({
  moduleId,
  nodes,
  assignments,
  responses,
  loading,
  canWrite,
}: {
  moduleId: string
  nodes: FileCollectionNodeDto[]
  assignments: FileCollectionAssignmentDto[]
  responses: FileCollectionResponseDto[]
  loading: boolean
  canWrite: boolean
}) {
  const [view, setView] = useState<MonitorView>('targets')
  const [assignmentFilter, setAssignmentFilter] = useState('')
  const [nodeFilter, setNodeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [openResponseId, setOpenResponseId] = useState<string | null>(null)

  const questions = useMemo(() => questionNodes(nodes), [nodes])
  const summary = useMemo(
    () => collectionSummary(nodes, assignments, responses),
    [nodes, assignments, responses],
  )
  const targetRows = useMemo(
    () => assignmentProgressRows(nodes, assignments, responses),
    [nodes, assignments, responses],
  )
  const questionRows = useMemo(
    () => questionProgressRows(nodes, assignments, responses),
    [nodes, assignments, responses],
  )

  const pathOf = (nodeId: string) => nodePath(nodes, nodeId).join(' / ')

  const responseRows = useMemo<ResponseRow[]>(() => {
    const byPair = new Map<string, FileCollectionResponseDto>()
    for (const r of responses) byPair.set(`${r.assignment_id}:${r.node_id}`, r)
    const out: ResponseRow[] = []
    for (const assignment of assignments) {
      for (const node of questions) {
        const found = byPair.get(`${assignment.id}:${node.id}`)
        out.push({
          key: `${assignment.id}:${node.id}`,
          responseId: found?.id ?? null,
          assignment,
          node,
          status: found?.status ?? 'NOT_SUBMITTED',
          round: found?.round ?? 1,
          submittedAt: found?.submitted_at ?? null,
        })
      }
    }
    return out
  }, [assignments, questions, responses])

  const filteredRows = useMemo(
    () =>
      responseRows.filter(
        (row) =>
          (!assignmentFilter || row.assignment.id === assignmentFilter) &&
          (!nodeFilter || row.node.id === nodeFilter) &&
          (!statusFilter || row.status === statusFilter),
      ),
    [responseRows, assignmentFilter, nodeFilter, statusFilter],
  )
  /**
   * 화면에 실제로 그리는 줄 수의 상한.
   *
   * 이 표의 줄 수는 대상 × 문항이라 대상 200명 · 문항 50개만으로 1만 줄이 된다 — 전부
   * 그리면 브라우저가 멈추고, 멈춘 화면은 못 읽는 화면이다. **자르는 대신 자른 사실을
   * 적는다**(위쪽 요약 숫자는 상한과 무관하게 전체를 센다).
   */
  const shownRows = filteredRows.slice(0, RESPONSE_ROW_LIMIT)
  const rowsClipped = filteredRows.length - shownRows.length

  const targetColumns: Column<AssignmentProgressRow>[] = [
    {
      key: 'name',
      header: '대상',
      type: 'name',
      primary: true,
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">
          {row.assignment.guest_name || <EmptyValue />}
        </span>
      ),
    },
    {
      key: 'state',
      header: '배정',
      type: 'badge',
      render: (row) =>
        row.assignment.revoked_at ? (
          <Badge tone="neutral">회수</Badge>
        ) : row.untouched ? (
          <Badge tone="warning">미착수</Badge>
        ) : (
          <Badge tone="success">배정</Badge>
        ),
    },
    {
      key: 'pending',
      header: '검토 대기',
      type: 'count',
      render: (row) => row.progress.submitted,
    },
    { key: 'rework', header: '보완', type: 'count', render: (row) => row.progress.rework },
    { key: 'approved', header: '완료', type: 'count', render: (row) => row.progress.approved },
    { key: 'draft', header: '작성 중', type: 'count', render: (row) => row.progress.draft },
    {
      key: 'not',
      header: '미제출',
      type: 'count',
      render: (row) => row.progress.notSubmitted,
    },
    {
      key: 'required',
      header: '필수 완료',
      type: 'count',
      render: (row) => fractionText(row.progress.requiredApproved, row.progress.requiredTotal),
    },
  ]

  const questionColumns: Column<QuestionProgressRow>[] = [
    {
      key: 'title',
      header: '문항',
      type: 'name',
      primary: true,
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">{pathOf(row.node.id)}</span>
      ),
    },
    {
      key: 'required',
      header: '필수',
      type: 'badge',
      render: (row) => (row.node.is_required ? <Badge tone="warning">필수</Badge> : <EmptyValue />),
    },
    { key: 'pending', header: '검토 대기', type: 'count', render: (row) => row.progress.submitted },
    { key: 'rework', header: '보완', type: 'count', render: (row) => row.progress.rework },
    { key: 'approved', header: '완료', type: 'count', render: (row) => row.progress.approved },
    { key: 'draft', header: '작성 중', type: 'count', render: (row) => row.progress.draft },
    { key: 'not', header: '미제출', type: 'count', render: (row) => row.progress.notSubmitted },
  ]

  const responseColumns: Column<ResponseRow>[] = [
    {
      key: 'target',
      header: '대상',
      type: 'name',
      primary: true,
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">
          {row.assignment.guest_name || <EmptyValue />}
        </span>
      ),
    },
    {
      key: 'question',
      header: '문항',
      type: 'text',
      render: (row) => (
        <span className="break-words [overflow-wrap:anywhere]">{pathOf(row.node.id)}</span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      render: (row) => (
        <Badge tone={fileCollectionStatusTone(row.status)}>
          {fileCollectionStatusLabel(row.status)}
        </Badge>
      ),
    },
    { key: 'round', header: '회차', type: 'count', render: (row) => roundLabel(row.round) },
    {
      key: 'submitted',
      header: '제출일',
      type: 'datetime',
      render: (row) => (row.submittedAt ? row.submittedAt.slice(0, 10) : <EmptyValue />),
    },
  ]

  return (
    <div className="space-y-4">
      <Card
        title="요약"
        help="검토 대기는 지금 내가 볼 차례인 문항 수이고, 작성 중은 게스트가 손은 댔지만 아직 내지 않은 문항 수입니다."
      >
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="대상" value={`${summary.targets}명`} />
          <Stat label="문항" value={`${summary.questions}개`} />
          <Stat label="검토 대기" value={`${summary.pendingReview}건`} />
          <Stat label="보완 요청" value={`${summary.rework}건`} />
          <Stat label="완료" value={`${summary.approved}건`} />
          {/* 작성 중과 미제출을 나란히 둔다 — 둘을 합치면 독촉할 대상과 기다릴 대상이 섞인다. */}
          <Stat label="작성 중" value={`${summary.draft}건`} />
          <Stat label="미제출" value={`${summary.notSubmitted}건`} />
        </dl>
        <p className={`mt-3 ${cardText.meta}`}>
          필수 문항을 모두 마친 대상 {summary.completedTargets}명
          {summary.revokedTargets > 0 && ` · 회수된 대상 ${summary.revokedTargets}명(자료 보존)`}
        </p>
      </Card>

      <Card
        title="진행 현황"
        actions={
          <SegmentedToggle
            label="현황 보기 기준"
            value={view}
            onChange={setView}
            options={[
              { key: 'targets', label: '대상별' },
              { key: 'questions', label: '문항별' },
            ]}
          />
        }
      >
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : view === 'targets' ? (
          <DataTable
            columns={targetColumns}
            rows={targetRows}
            rowKey={(row) => row.assignment.id}
            emptyText="배정한 대상이 없습니다."
            numbered={false}
            standardColumns={false}
            selectable={false}
            onRowClick={(row) => {
              setAssignmentFilter(row.assignment.id)
              setNodeFilter('')
            }}
          />
        ) : (
          <DataTable
            columns={questionColumns}
            rows={questionRows}
            rowKey={(row) => row.node.id}
            emptyText="문항이 없습니다."
            numbered={false}
            standardColumns={false}
            selectable={false}
            onRowClick={(row) => {
              setNodeFilter(row.node.id)
              setAssignmentFilter('')
            }}
          />
        )}
      </Card>

      <Card
        title="제출 내역"
        count={filteredRows.length}
        help="대상과 문항을 조합해 좁힐 수 있습니다. 줄을 누르면 파일·피드백을 열고 검토합니다."
      >
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Select
              aria-label="대상 필터"
              value={assignmentFilter}
              onChange={(e) => setAssignmentFilter(e.target.value)}
            >
              <option value="">대상 전체</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.guest_name ?? '(이름 없음)'}
                  {a.revoked_at ? ' (회수)' : ''}
                </option>
              ))}
            </Select>
            <Select
              aria-label="문항 필터"
              value={nodeFilter}
              onChange={(e) => setNodeFilter(e.target.value)}
            >
              <option value="">문항 전체</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {pathOf(q.id)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="상태 필터"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">상태 전체</option>
              {(
                [
                  'NOT_SUBMITTED',
                  'DRAFT',
                  'SUBMITTED',
                  'REWORK_REQUESTED',
                  'APPROVED',
                ] as FileCollectionStatus[]
              ).map((status) => (
                <option key={status} value={status}>
                  {fileCollectionStatusLabel(status)}
                </option>
              ))}
            </Select>
          </div>

          {rowsClipped > 0 && (
            <Banner tone="warning">
              조건에 맞는 {filteredRows.length}줄 가운데 {RESPONSE_ROW_LIMIT}줄만 표시했습니다.
              위쪽 요약과 진행 현황은 전체를 셈하니, 나머지는 대상·문항·상태로 좁혀 확인해
              주세요.
            </Banner>
          )}

          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={responseColumns}
              rows={shownRows}
              rowKey={(row) => row.key}
              emptyText="조건에 맞는 제출 내역이 없습니다."
              numbered={false}
              standardColumns={false}
              selectable={false}
              onRowClick={(row) => {
                // 응답 칸이 아직 없는 줄(미제출)에는 열 것이 없다 — 빈 창을 띄우지 않는다.
                if (row.responseId) setOpenResponseId(row.responseId)
              }}
            />
          )}
        </div>
      </Card>

      {openResponseId && (
        <ResponseDetailModal
          open
          moduleId={moduleId}
          responseId={openResponseId}
          row={filteredRows.find((r) => r.responseId === openResponseId) ?? null}
          path={
            filteredRows.find((r) => r.responseId === openResponseId)
              ? pathOf(
                  (filteredRows.find((r) => r.responseId === openResponseId) as ResponseRow).node.id,
                )
              : ''
          }
          canWrite={canWrite}
          onClose={() => setOpenResponseId(null)}
        />
      )}
    </div>
  )
}

/** 요약 한 칸. 크기로 위계를 만들지 않고 라벨·값의 색 위계를 그대로 쓴다. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-radius-md bg-gray-25 px-3 py-2">
      <dt className={cardText.label}>{label}</dt>
      <dd className={`${cardText.value} tabular-nums`}>{value}</dd>
    </div>
  )
}
