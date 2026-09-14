import {
  Badge,
  Banner,
  Card,
  DataTable,
  EmptyValue,
  Select,
  SegmentedToggle,
  Skeleton,
  SummaryTile,
  cardText,
  type Column,
} from '@ynarcher/ui'
import { CircleCheckBig, CircleDashed, CircleDotDashed, Users } from 'lucide-react'
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
 * 제출 현황 탭 — 들어온 것과 **안 들어온 것**을 함께 본다.
 *
 * 미제출을 목록에서 빼지 않는 것이 이 화면의 핵심이다. 제출된 것만 세우면 이 화면이 언제나
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
      header: '상태',
      type: 'badge',
      render: (row) =>
        row.assignment.revoked_at ? (
          <Badge tone="neutral">회수</Badge>
        ) : row.untouched ? (
          <Badge tone="warning">미착수</Badge>
        ) : (
          <Badge tone="success">착수</Badge>
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
        help="이 카드는 사람을 셉니다. 미제출은 한 문항도 내지 않은 사람, 진행 중은 일부만 낸 사람, 제출 완료는 모든 문항을 낸 사람이며 세 수의 합은 대상 수와 같습니다. 보완 요청을 받은 문항은 이미 낸 것으로 셈합니다."
      >
        {/* **이 카드보드의 단위는 사람(명)이다**(2026-09-14 사용자 확정).
            종전에는 `대상 …명`·`문항 …개`·`검토 대기 …건`이 한 줄에 같은 모양으로 서 있었는데,
            뒤의 다섯 칸은 응답 칸(대상 × 문항)을 센 값이라 대상이 한 명일 때만 우연히 사람 수처럼
            읽혔다. 이제 타일은 사람만 세고, 칸(건) 단위 숫자는 아래 메타줄과 진행 현황 표가 답한다.

            가르는 기준은 **낸 적이 있는가** 하나다 — 검토 대기·보완 요청은 이미 낸 것이고,
            작성 중은 아직 낸 것이 아니다. 표현은 게스트의 `내 진행 상태`와 같은 규격(SummaryTile)이라
            두 화면이 같은 색으로 같은 말을 한다. */}
        <section
          aria-label="대상별 제출 요약"
          className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3"
        >
          {/* 머리말(eyebrow)은 장식이 아니라 **셈의 기준**이다 — '미제출·진행 중·제출 완료'라는
              이름만으로는 무엇을 낸 것으로 치는지 갈리지 않아서, 각 칸이 자기 기준을 스스로 적는다. */}
          <SummaryTile
            title="대상"
            eyebrow="제출해야 할 사람"
            value={summary.targets}
            unit="명"
            tone="primary"
            compact
            icon={<Users aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="미제출"
            eyebrow="한 번도 내지 않음"
            value={summary.notStartedTargets}
            unit="명"
            tone="slate"
            compact
            icon={<CircleDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="진행 중"
            eyebrow="일부만 냄"
            value={summary.inProgressTargets}
            unit="명"
            tone="amber"
            compact
            icon={<CircleDotDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="제출 완료"
            eyebrow="모든 문항을 냄"
            value={summary.completedSubmissionTargets}
            unit="명"
            tone="mint"
            compact
            icon={<CircleCheckBig aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
        </section>
        {/* 문항 수·검토 대기 건수 같은 **칸(건) 단위 숫자는 여기 적지 않는다**(2026-09-14 사용자 결정).
            이 카드는 사람만 세며, 칸 단위는 아래 진행 현황·제출 내역 표가 답한다 — 한 카드에 두
            단위를 섞어 두면 방금 없앤 혼동이 메타줄로 되돌아온다.
            회수된 대상만 예외로 남긴다: 대상 수에서 빠진 사람이 있다는 사실은 이 카드가 아니면
            어디에도 적히지 않는다. */}
        {summary.revokedTargets > 0 && (
          <p className={`mt-3 ${cardText.meta}`}>
            회수된 대상 {summary.revokedTargets}명(자료 보존) — 위 대상 수에서 빠져 있습니다.
          </p>
        )}
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
            emptyText="받는 사람이 없습니다. 개요의 게스트 설정에서 명부에 게스트를 올리고 로그인을 열어 주세요."
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
