import { describe, expect, it } from 'vitest'
import {
  assignmentProgress,
  assignmentProgressRows,
  canReviewResponse,
  collectionSummary,
  fileCollectionStatusTone,
  formatFileSize,
  fractionText,
  filesByRound,
  isCollectionPublished,
  nextSortOrder,
  nodePath,
  parentFolderOptions,
  questionProgressRows,
  reorderSibling,
  toCollectionTreeNodes,
  type FileCollectionAssignmentDto,
  type FileCollectionFileDto,
  type FileCollectionNodeDto,
  type FileCollectionResponseDto,
  type FileCollectionStatus,
} from '@ynarcher/master-data'

/**
 * 파일받기 공통 어휘의 순수 계산부.
 *
 * 여기서 지키려는 것 셋이다 — (1) 트리 편집 보조가 서버 트리거와 **같은 조건**으로 거르는가,
 * (2) 관제 집계가 응답 칸이 없는 문항을 빠뜨리지 않는가, (3) 검토 버튼이 서버가 받는 상태에서만
 * 서는가. 셋 다 틀리면 화면이 조용히 거짓을 말하는 자리다.
 */

const node = (
  id: string,
  parent: string | null,
  type: 'FOLDER' | 'QUESTION',
  sort = 1,
  required = false,
): FileCollectionNodeDto => ({
  id,
  collection_id: 'c1',
  parent_id: parent,
  node_type: type,
  title: id,
  guide: null,
  is_required: required,
  sort_order: sort,
  updated_at: '2026-09-13T00:00:00Z',
})

const assignment = (id: string, revoked: string | null = null): FileCollectionAssignmentDto => ({
  id,
  collection_id: 'c1',
  participant_id: `p-${id}`,
  guest_user_id: `u-${id}`,
  assigned_at: '2026-09-13T00:00:00Z',
  revoked_at: revoked,
  guest_name: id,
})

const response = (
  assignmentId: string,
  nodeId: string,
  status: FileCollectionStatus,
  round = 1,
): FileCollectionResponseDto => ({
  id: `${assignmentId}:${nodeId}`,
  assignment_id: assignmentId,
  node_id: nodeId,
  status,
  round,
  submitted_at: null,
  reviewed_at: null,
})

describe('트리 편집 보조', () => {
  const tree = [
    node('root', null, 'FOLDER', 1),
    node('sub', 'root', 'FOLDER', 1),
    node('q1', 'sub', 'QUESTION', 1, true),
    node('q2', null, 'QUESTION', 2),
  ]

  it('원장의 node_type을 화면 부품의 node_kind로 옮긴다', () => {
    const mapped = toCollectionTreeNodes(tree)
    expect(mapped.find((n) => n.id === 'q1')).toMatchObject({
      node_kind: 'QUESTION',
      is_required: true,
      parent_id: 'sub',
    })
  })

  it('부모 후보에서 문항·자기 자신·자기 자손을 뺀다', () => {
    expect(parentFolderOptions(tree).map((o) => o.id)).toEqual(['root', 'sub'])
    // root를 옮기는 중이면 root와 그 아래 sub는 부모가 될 수 없다.
    expect(parentFolderOptions(tree, 'root')).toEqual([])
    expect(parentFolderOptions(tree, 'sub').map((o) => o.id)).toEqual(['root'])
  })

  it('부모 후보의 경로는 뿌리부터 적는다', () => {
    expect(parentFolderOptions(tree).find((o) => o.id === 'sub')?.path).toBe('root / sub')
    expect(nodePath(tree, 'q1')).toEqual(['root', 'sub', 'q1'])
  })

  it('새 항목은 형제 끝에 붙는다', () => {
    expect(nextSortOrder(tree, null)).toBe(3)
    expect(nextSortOrder(tree, 'sub')).toBe(2)
    expect(nextSortOrder(tree, 'none')).toBe(1)
  })

  it('맨 위에서 위로·맨 아래에서 아래로는 고칠 것이 없다', () => {
    expect(reorderSibling(tree, 'root', 'up')).toEqual([])
    expect(reorderSibling(tree, 'q2', 'down')).toEqual([])
  })

  it('순서가 겹쳐 있어도 한 번의 이동이 실제로 자리를 바꾼다', () => {
    const flat = [
      node('a', null, 'QUESTION', 1),
      node('b', null, 'QUESTION', 1),
      node('c', null, 'QUESTION', 1),
    ]
    // sort_order가 모두 같으면 제목 순(a·b·c)이며, c를 위로 올리면 b와 자리를 바꾼다.
    const moves = reorderSibling(flat, 'c', 'up')
    expect(moves).toEqual([
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 3 },
    ])
  })

  it('없는 마디를 옮기라고 하면 아무 일도 하지 않는다', () => {
    expect(reorderSibling(tree, 'ghost', 'up')).toEqual([])
  })
})

describe('관제 집계', () => {
  const nodes = [
    node('f', null, 'FOLDER', 1),
    node('q1', 'f', 'QUESTION', 1, true),
    node('q2', 'f', 'QUESTION', 2, true),
    node('q3', null, 'QUESTION', 3),
  ]
  const assignments = [assignment('a1'), assignment('a2'), assignment('a3', '2026-09-13T01:00:00Z')]
  const responses = [
    response('a1', 'q1', 'APPROVED'),
    response('a1', 'q2', 'SUBMITTED'),
    response('a2', 'q1', 'REWORK_REQUESTED', 2),
    response('a3', 'q1', 'APPROVED'),
  ]

  it('응답 칸이 없는 문항도 분모에서 빠지지 않는다', () => {
    const progress = assignmentProgress(
      nodes.filter((n) => n.node_type === 'QUESTION'),
      responses,
      'a1',
    )
    expect(progress.total).toBe(3)
    expect(progress.approved).toBe(1)
    expect(progress.submitted).toBe(1)
    // q3는 응답 행이 없으므로 미제출이다(빠뜨리면 "다 했다"로 읽힌다).
    expect(progress.notSubmitted).toBe(1)
    expect(progress.requiredTotal).toBe(2)
    expect(progress.requiredApproved).toBe(1)
  })

  it('문항별 현황의 분모는 살아 있는 배정 수다', () => {
    const rows = questionProgressRows(nodes, assignments, responses)
    const q1 = rows.find((r) => r.node.id === 'q1')
    // a3는 회수된 배정이라 셈에서 빠진다 — 그 대상의 APPROVED도 함께 빠진다.
    expect(q1?.progress.total).toBe(2)
    expect(q1?.progress.approved).toBe(1)
    expect(q1?.progress.rework).toBe(1)
    const q3 = rows.find((r) => r.node.id === 'q3')
    expect(q3?.progress.notSubmitted).toBe(2)
    expect(q3?.progress.requiredTotal).toBe(0)
  })

  it('요약은 살아 있는 대상만 세고 회수 수를 따로 답한다', () => {
    const summary = collectionSummary(nodes, assignments, responses)
    expect(summary.questions).toBe(3)
    expect(summary.requiredQuestions).toBe(2)
    expect(summary.targets).toBe(2)
    expect(summary.revokedTargets).toBe(1)
    expect(summary.pendingReview).toBe(1)
    expect(summary.rework).toBe(1)
    expect(summary.approved).toBe(1)
    // a1: q3 미제출, a2: q2·q3 미제출.
    expect(summary.notSubmitted).toBe(3)
    // 필수 두 문항을 모두 완료한 대상은 아직 없다.
    expect(summary.completedTargets).toBe(0)
  })

  it('요약의 다섯 상태 합은 살아 있는 대상 × 문항과 정확히 같다', () => {
    // a2의 q2를 작성 중으로 둔다 — 이 한 칸이 어느 숫자에도 들지 않으면 합이 어긋난다.
    const withDraft = [...responses, response('a2', 'q2', 'DRAFT')]
    const summary = collectionSummary(nodes, assignments, withDraft)
    expect(summary.draft).toBe(1)
    // 작성 중은 미제출에서 빠진다(a1: q3, a2: q3 둘만 남는다).
    expect(summary.notSubmitted).toBe(2)
    const covered =
      summary.pendingReview + summary.rework + summary.approved + summary.draft + summary.notSubmitted
    // 회수된 a3는 분모에도 분자에도 들지 않는다 — 대상 2명 × 문항 3개.
    expect(summary.targets).toBe(2)
    expect(covered).toBe(summary.targets * summary.questions)
    expect(covered).toBe(6)
  })

  it('요약 카드보드의 사람 3분류는 낸 적이 있는가로만 갈린다', () => {
    // a1: 낸 것 둘 + 미제출 하나, a2: 보완 요청 하나 + 작성 중 하나 + 미제출 하나,
    // a4: 한 문항도 내지 않음(작성 중만), a5: 세 문항을 모두 냄.
    const people = [...assignments, assignment('a4'), assignment('a5')]
    const rows = [
      ...responses,
      response('a2', 'q2', 'DRAFT'),
      response('a4', 'q1', 'DRAFT'),
      response('a5', 'q1', 'APPROVED'),
      response('a5', 'q2', 'REWORK_REQUESTED', 2),
      response('a5', 'q3', 'SUBMITTED'),
    ]
    const summary = collectionSummary(nodes, people, rows)
    expect(summary.targets).toBe(4)
    // 작성 중은 아직 낸 것이 아니다 — a4만 미제출이다.
    expect(summary.notStartedTargets).toBe(1)
    expect(summary.inProgressTargets).toBe(2)
    // 보완 요청·검토 대기도 이미 낸 것이라 a5는 제출 완료다(검토 결과와 무관하다).
    expect(summary.completedSubmissionTargets).toBe(1)
    expect(
      summary.notStartedTargets + summary.inProgressTargets + summary.completedSubmissionTargets,
    ).toBe(summary.targets)
  })

  it('문항이 하나도 없으면 아무도 제출 완료가 아니다', () => {
    // 낼 것이 없는 모듈에서 전원이 '제출 완료'로 읽히면 숫자가 거짓말을 한다.
    const summary = collectionSummary([node('f', null, 'FOLDER', 1)], assignments, [])
    expect(summary.completedSubmissionTargets).toBe(0)
    expect(summary.notStartedTargets).toBe(2)
    expect(summary.inProgressTargets).toBe(0)
  })

  it('대상별·문항별 줄도 다섯 상태가 칸을 남김없이 덮는다', () => {
    const withDraft = [...responses, response('a2', 'q2', 'DRAFT')]
    const cover = (p: {
      submitted: number
      rework: number
      approved: number
      draft: number
      notSubmitted: number
    }) => p.submitted + p.rework + p.approved + p.draft + p.notSubmitted

    for (const row of assignmentProgressRows(nodes, assignments, withDraft)) {
      expect(cover(row.progress)).toBe(row.progress.total)
    }
    const a2 = assignmentProgress(
      nodes.filter((n) => n.node_type === 'QUESTION'),
      withDraft,
      'a2',
    )
    expect(a2.draft).toBe(1)
    // 작성 중이어도 아직 손대지 않은 대상은 아니다.
    expect(assignmentProgressRows(nodes, assignments, withDraft).find((r) => r.assignment.id === 'a2')?.untouched).toBe(
      false,
    )

    const qRows = questionProgressRows(nodes, assignments, withDraft)
    for (const row of qRows) {
      // 문항별 분모는 살아 있는 배정 수(2)이며 회수된 a3는 어느 칸에도 남지 않는다.
      expect(row.progress.total).toBe(2)
      expect(cover(row.progress)).toBe(2)
    }
    expect(qRows.find((r) => r.node.id === 'q2')?.progress.draft).toBe(1)
  })

  it('문항이 없으면 진행률은 빈 값이다(0/0을 완료로 읽지 않는다)', () => {
    expect(assignmentProgress([], [], 'a1').total).toBe(0)
    expect(fractionText(0, 0)).toBe('-')
    expect(fractionText(1, 3)).toBe('1/3')
  })
})

describe('상태 전이와 표시 조건', () => {
  it('검토는 제출된 문항에서만 가능하다', () => {
    expect(canReviewResponse('SUBMITTED')).toBe(true)
    for (const status of ['NOT_SUBMITTED', 'DRAFT', 'REWORK_REQUESTED', 'APPROVED'] as const) {
      expect(canReviewResponse(status)).toBe(false)
    }
    expect(canReviewResponse(null)).toBe(false)
  })

  it('상태 톤은 대기·되돌아옴·끝을 가른다', () => {
    expect(fileCollectionStatusTone('SUBMITTED')).toBe('warning')
    expect(fileCollectionStatusTone('REWORK_REQUESTED')).toBe('danger')
    expect(fileCollectionStatusTone('APPROVED')).toBe('success')
    expect(fileCollectionStatusTone('알수없음')).toBe('neutral')
  })

  it('공개 여부는 published_at 하나가 답한다', () => {
    expect(isCollectionPublished(null)).toBe(false)
    expect(isCollectionPublished({ published_at: null })).toBe(false)
    expect(isCollectionPublished({ published_at: '2026-09-13T00:00:00Z' })).toBe(true)
  })
})

describe('파일 표기', () => {
  const file = (id: string, round: number, created: string): FileCollectionFileDto => ({
    id,
    response_id: 'r1',
    round,
    original_name: id,
    content_type: null,
    byte_size: 2048,
    status: 'READY',
    uploaded_by: 'u1',
    created_at: created,
  })

  it('회차는 최신이 위이고 지난 회차가 사라지지 않는다', () => {
    const groups = filesByRound([
      file('old', 1, '2026-09-11T00:00:00Z'),
      file('new', 2, '2026-09-12T00:00:00Z'),
      file('new2', 2, '2026-09-13T00:00:00Z'),
    ])
    expect(groups.map((g) => g.round)).toEqual([2, 1])
    expect(groups[0]?.files.map((f) => f.id)).toEqual(['new', 'new2'])
    expect(groups[1]?.files.map((f) => f.id)).toEqual(['old'])
  })

  it('크기를 모르면 빈 문자열이다(0B라고 적지 않는다)', () => {
    expect(formatFileSize(null)).toBe('')
    expect(formatFileSize(0)).toBe('')
    expect(formatFileSize(512)).toBe('512B')
    expect(formatFileSize(2048)).toBe('2.0KB')
  })
})
