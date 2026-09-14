import { describe, expect, it } from 'vitest'
import type {
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
} from '@ynarcher/master-data'
import {
  canRemoveFile,
  filterCollectionNodes,
  pageCollectionNodes,
  guestProgressSummary,
  guestStatusLabel,
  questionControls,
  responsesByNode,
  statusOfNode,
  writeStateOfModule,
} from '@/features/fileCollectionView'

/**
 * 화면이 무엇을 열고 잠그는지에 대한 회귀. 서버가 거절하는 조건과 **같은 선**을 그어야
 * 누를 수 있는데 언제나 실패하는 버튼이 서지 않는다.
 */

function node(id: string, over: Partial<FileCollectionNodeDto> = {}): FileCollectionNodeDto {
  return {
    id,
    collection_id: 'col-1',
    parent_id: null,
    node_type: 'QUESTION',
    title: id,
    guide: null,
    is_required: false,
    sort_order: 1,
    updated_at: '2026-09-13T00:00:00Z',
    ...over,
  }
}

function response(
  over: Partial<FileCollectionResponseDto> = {},
): FileCollectionResponseDto {
  return {
    id: 'resp-1',
    assignment_id: 'as-1',
    node_id: 'q1',
    status: 'NOT_SUBMITTED',
    round: 1,
    submitted_at: null,
    reviewed_at: null,
    ...over,
  }
}

function fileRow(over: Partial<FileCollectionFileDto> = {}): FileCollectionFileDto {
  return {
    id: 'f1',
    response_id: 'resp-1',
    round: 1,
    original_name: 'a.pdf',
    content_type: 'application/pdf',
    byte_size: 100,
    status: 'READY',
    uploaded_by: 'me',
    created_at: '2026-09-13T01:00:00Z',
    ...over,
  }
}

const OPEN = writeStateOfModule('OPEN')
const CLOSED = writeStateOfModule('CLOSED')

describe('모듈 상태와 쓰기', () => {
  it('완료된 모듈은 읽기만 남고 이유를 말한다', () => {
    expect(OPEN).toEqual({ writable: true })
    expect(CLOSED.writable).toBe(false)
    expect(CLOSED.writable === false && CLOSED.reason.length > 0).toBe(true)
  })
})

describe('참여자에게 보이는 상태말', () => {
  it('작성 중은 미제출로 읽는다 — 참여자가 할 일이 같다', () => {
    expect(guestStatusLabel('DRAFT')).toBe('미제출')
    expect(guestStatusLabel('NOT_SUBMITTED')).toBe('미제출')
  })

  it('나머지 상태는 원장의 말 그대로다', () => {
    expect(guestStatusLabel('SUBMITTED')).toBe('검토 대기')
    expect(guestStatusLabel('REWORK_REQUESTED')).toBe('보완 요청')
    expect(guestStatusLabel('APPROVED')).toBe('완료')
  })
})

describe('문항 하나에서 할 수 있는 일', () => {
  it('올린 파일이 확인되기 전에는 제출이 열리지 않는다', () => {
    const controls = questionControls({
      response: response({ status: 'DRAFT' }),
      files: [fileRow({ status: 'PENDING' })],
      write: OPEN,
    })

    expect(controls.canUpload).toBe(true)
    expect(controls.canSubmit).toBe(false)
    expect(controls.pendingFiles).toHaveLength(1)
    expect(controls.currentFiles).toHaveLength(0)
    expect(controls.submitHint).toBeTruthy()
  })

  it('아직 아무것도 올리지 않았으면 안내를 세우지 않는다', () => {
    // 받는 상자와 빈 '제출 파일' 목록이 이미 같은 말을 한다(2026-09-14 사용자 지정).
    const controls = questionControls({
      response: response({ status: 'NOT_SUBMITTED' }),
      files: [],
      write: OPEN,
    })

    expect(controls.canSubmit).toBe(false)
    expect(controls.submitHint).toBeNull()
  })

  it('이번 회차의 확인된 파일이 하나라도 있으면 제출할 수 있다', () => {
    const controls = questionControls({
      response: response({ status: 'DRAFT' }),
      files: [fileRow()],
      write: OPEN,
    })

    expect(controls.canSubmit).toBe(true)
    expect(controls.submitHint).toBeNull()
  })

  it('제출한 문항은 파일을 더하지 못한다', () => {
    const controls = questionControls({
      response: response({ status: 'SUBMITTED' }),
      files: [fileRow()],
      write: OPEN,
    })

    expect(controls.canUpload).toBe(false)
    expect(controls.canSubmit).toBe(false)
  })

  it('보완 요청은 새 회차에서 다시 열리고 지난 회차는 이력으로 남는다', () => {
    const controls = questionControls({
      response: response({ status: 'REWORK_REQUESTED', round: 2 }),
      files: [fileRow({ id: 'old', round: 1 }), fileRow({ id: 'new', round: 2 })],
      write: OPEN,
    })

    expect(controls.canUpload).toBe(true)
    expect(controls.currentFiles.map((f) => f.id)).toEqual(['new'])
    expect(controls.history).toEqual([
      expect.objectContaining({ round: 1, files: [expect.objectContaining({ id: 'old' })] }),
    ])
  })

  it('마감된 모듈에서는 올리기·제출·코멘트가 모두 닫힌다', () => {
    const controls = questionControls({
      response: response({ status: 'DRAFT' }),
      files: [fileRow()],
      write: CLOSED,
    })

    expect([controls.canUpload, controls.canSubmit, controls.canComment]).toEqual([
      false,
      false,
      false,
    ])
  })

  it('응답 칸이 아직 없으면 아무것도 열지 않는다', () => {
    const controls = questionControls({ response: null, files: [fileRow()], write: OPEN })

    expect(controls.canUpload).toBe(false)
    expect(controls.canComment).toBe(false)
    expect(controls.currentFiles).toHaveLength(0)
  })

  it('검토 중에도 코멘트는 남길 수 있다', () => {
    const controls = questionControls({
      response: response({ status: 'SUBMITTED' }),
      files: [],
      write: OPEN,
    })
    expect(controls.canComment).toBe(true)
  })
})

describe('파일 내리기 조건', () => {
  const draft = response({ status: 'DRAFT', round: 2 })

  it('낼 수 있는 상태면 지난 회차 파일도 내릴 수 있다', () => {
    expect(canRemoveFile({ file: fileRow({ round: 2 }), response: draft, write: OPEN })).toBe(true)
    // 보완 요청은 회차를 올린다 — 회차로 가르면 보완을 받은 사람이 잘못 낸 자료를 못 치운다.
    expect(canRemoveFile({ file: fileRow({ round: 1 }), response: draft, write: OPEN })).toBe(true)
    expect(
      canRemoveFile({
        file: fileRow({ round: 1 }),
        response: response({ status: 'REWORK_REQUESTED', round: 2 }),
        write: OPEN,
      }),
    ).toBe(true)
  })

  it('제출·완료·마감 뒤에는 내리지 못한다', () => {
    expect(
      canRemoveFile({
        file: fileRow({ round: 2 }),
        response: response({ status: 'SUBMITTED', round: 2 }),
        write: OPEN,
      }),
    ).toBe(false)
    expect(
      canRemoveFile({
        file: fileRow({ round: 1 }),
        response: response({ status: 'APPROVED', round: 1 }),
        write: OPEN,
      }),
    ).toBe(false)
    expect(canRemoveFile({ file: fileRow({ round: 2 }), response: draft, write: CLOSED })).toBe(
      false,
    )
  })
})

describe('트리와 요약', () => {
  const nodes = [
    node('folder', { node_type: 'FOLDER', title: '재무' }),
    node('q1', { parent_id: 'folder', is_required: true }),
    node('q2', { parent_id: 'folder' }),
    node('q3'),
  ]
  const responses = [
    response({ id: 'r1', node_id: 'q1', status: 'APPROVED' }),
    response({ id: 'r2', node_id: 'q2', status: 'DRAFT' }),
  ]
  const byNode = responsesByNode(responses)

  it('응답 칸이 없는 문항은 미제출로 읽는다', () => {
    expect(statusOfNode(byNode, 'q3')).toBe('NOT_SUBMITTED')
  })

  it('내 진행 요약은 구성과 상태를 각각 건수로 답한다', () => {
    const summary = guestProgressSummary(nodes, responses, 'as-1')

    expect(summary.total).toBe(3)
    expect(summary.requiredTotal).toBe(1)
    // 응답 칸이 없는 q3와 파일만 올려 둔 q2가 함께 미제출이다(둘 다 아직 내지 않았다).
    expect(summary.notSubmitted).toBe(2)
    expect(summary.rework).toBe(0)
    expect(summary.submitted).toBe(0)
    expect(summary.approved).toBe(1)
  })
})

describe('목록 좁히기와 쪽 나눔', () => {
  const nodes = [
    node('f1', { node_type: 'FOLDER', title: '기본서류', sort_order: 1 }),
    node('q1', { parent_id: 'f1', title: '사업자등록증', guide: '국세청 발급본' }),
    node('q2', { parent_id: 'f1', title: '법인인감증명서' }),
    node('f2', { node_type: 'FOLDER', title: '재무', sort_order: 2 }),
    node('q3', { parent_id: 'f2', title: '재무제표' }),
    node('f3', { node_type: 'FOLDER', title: '기타', sort_order: 3 }),
  ]

  it('검색어가 없으면 그대로 둔다', () => {
    expect(filterCollectionNodes(nodes, '  ').map((n) => n.id)).toEqual(nodes.map((n) => n.id))
  })

  it('문항이 걸리면 그 묶음도 함께 남는다', () => {
    // 부모가 빠지면 화면 부품이 '상위 항목 없음'으로 읽는다 — 검색했을 뿐인데 원장이 망가진 모양.
    expect(filterCollectionNodes(nodes, '법인인감').map((n) => n.id)).toEqual(['f1', 'q2'])
  })

  it('안내 문구로도 찾는다', () => {
    expect(filterCollectionNodes(nodes, '국세청').map((n) => n.id)).toEqual(['f1', 'q1'])
  })

  it('묶음이 걸리면 그 아래를 통째로 남긴다', () => {
    expect(filterCollectionNodes(nodes, '기본서류').map((n) => n.id)).toEqual(['f1', 'q1', 'q2'])
  })

  it('쪽은 최상위 묶음 단위로 자른다 — 가지 중간을 자르지 않는다', () => {
    const first = pageCollectionNodes(nodes, 0, 2)

    expect(first.pageCount).toBe(2)
    expect(first.nodes.map((n) => n.id)).toEqual(['f1', 'q1', 'q2', 'f2', 'q3'])

    const second = pageCollectionNodes(nodes, 1, 2)
    expect(second.nodes.map((n) => n.id)).toEqual(['f3'])
  })

  it('범위를 벗어난 쪽은 마지막 쪽으로 당긴다', () => {
    const out = pageCollectionNodes(nodes, 9, 2)

    expect(out.page).toBe(1)
    expect(out.nodes.map((n) => n.id)).toEqual(['f3'])
  })
})
