import { describe, expect, it } from 'vitest'
import type {
  FileCollectionFileDto,
  FileCollectionNodeDto,
  FileCollectionResponseDto,
} from '@ynarcher/master-data'
import {
  canRemoveFile,
  folderProgressText,
  guestProgressSummary,
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

  it('이번 회차의 확인된 파일이 하나라도 있으면 제출할 수 있다', () => {
    const controls = questionControls({
      response: response({ status: 'DRAFT' }),
      files: [fileRow()],
      write: OPEN,
    })

    expect(controls.canSubmit).toBe(true)
    expect(controls.submitHint).toBeNull()
  })

  it('제출한 문항은 파일을 더하지 못하고 대기 상태임을 말한다', () => {
    const controls = questionControls({
      response: response({ status: 'SUBMITTED' }),
      files: [fileRow()],
      write: OPEN,
    })

    expect(controls.canUpload).toBe(false)
    expect(controls.canSubmit).toBe(false)
    expect(controls.blockedReason).toContain('검토')
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
    expect(controls.blockedReason).toBe(CLOSED.writable === false ? CLOSED.reason : null)
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

  it('현재 회차의 미제출 파일만 내릴 수 있다', () => {
    expect(canRemoveFile({ file: fileRow({ round: 2 }), response: draft, write: OPEN })).toBe(true)
    expect(canRemoveFile({ file: fileRow({ round: 1 }), response: draft, write: OPEN })).toBe(false)
  })

  it('제출·완료·마감 뒤에는 내리지 못한다', () => {
    expect(
      canRemoveFile({
        file: fileRow({ round: 2 }),
        response: response({ status: 'SUBMITTED', round: 2 }),
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

  it('폴더 줄은 그 아래 문항 중 낸 것의 비율을 말한다', () => {
    expect(folderProgressText(nodes, byNode, 'folder')).toBe('1/2')
  })

  it('응답 칸이 없는 문항은 미제출로 읽는다', () => {
    expect(statusOfNode(byNode, 'q3')).toBe('NOT_SUBMITTED')
  })

  it('내 진행 요약의 분모는 언제나 문항 수다', () => {
    const summary = guestProgressSummary(nodes, responses, 'as-1')

    expect(summary.total).toBe(3)
    expect(summary.submittedText).toBe('1/3')
    expect(summary.requiredText).toBe('1/1')
    expect(summary.notSubmitted).toBe(1)
  })
})
