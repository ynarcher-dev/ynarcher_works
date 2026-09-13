// @vitest-environment jsdom
//
// 제출 칸의 화면 규칙 회귀. 실제로 그려서 **무엇이 서고 무엇이 잠기는지**와 누른 결과가
// 어디로 가는지를 본다 — 순수 판정(fileCollectionView.test.ts)만으로는 그 판정이 화면에
// 연결되어 있는지가 남기 때문이다. 브라우저 통합(실제 업로드)은 이 파일의 몫이 아니다.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { FileCollectionFileDto } from '@ynarcher/master-data'
import { questionControls, writeStateOfModule } from '@/features/fileCollectionView'
import {
  QuestionPanel,
  type QuestionPanelProps,
} from '@/pages/modules/fileCollection/QuestionPanel'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

const mounted: { root: Root; container: HTMLElement }[] = []

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount())
    item.container.remove()
  }
})

function fileRow(over: Partial<FileCollectionFileDto> = {}): FileCollectionFileDto {
  return {
    id: 'f1',
    response_id: 'resp-1',
    round: 1,
    original_name: 'a.pdf',
    content_type: 'application/pdf',
    byte_size: 1024,
    status: 'READY',
    uploaded_by: 'me',
    created_at: '2026-09-13T01:00:00Z',
    ...over,
  }
}

function baseProps(over: Partial<QuestionPanelProps> = {}): QuestionPanelProps {
  return {
    path: ['재무', '최근 3개년 재무제표'],
    guide: '국세청 발급본을 올려 주십시오.',
    isRequired: true,
    controls: questionControls({
      response: {
        id: 'resp-1',
        assignment_id: 'as-1',
        node_id: 'q1',
        status: 'DRAFT',
        round: 1,
        submitted_at: null,
        reviewed_at: null,
      },
      files: [fileRow()],
      write: writeStateOfModule('OPEN'),
    }),
    comments: [],
    canRemove: () => true,
    busy: { any: false, upload: false, submit: false, comment: false, fileId: null },
    notes: [],
    commentDraft: '',
    onCommentDraftChange: () => {},
    onPickFiles: () => {},
    onDownload: () => {},
    onRemove: () => {},
    onRetryPending: () => {},
    onAddComment: () => {},
    onSubmit: () => {},
    ...over,
  }
}

function render(props: QuestionPanelProps) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(QuestionPanel, props)))
  mounted.push({ root, container })
  return container
}

const buttons = (container: HTMLElement) => [...container.querySelectorAll('button')]
const byText = (container: HTMLElement, text: string) =>
  buttons(container).find((b) => (b.textContent ?? '').includes(text))
const byLabel = (container: HTMLElement, label: string) =>
  buttons(container).find((b) => (b.getAttribute('aria-label') ?? '').includes(label))

describe('제출 칸 화면', () => {
  it('경로·안내·파일 이름을 감추지 않고 세운다', () => {
    const longName = `${'매우긴파일이름'.repeat(20)}.pdf`
    const container = render(
      baseProps({
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status: 'DRAFT',
            round: 1,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow({ original_name: longName })],
          write: writeStateOfModule('OPEN'),
        }),
      }),
    )

    expect(container.textContent).toContain('재무')
    expect(container.textContent).toContain('국세청 발급본을 올려 주십시오.')
    expect(container.textContent).toContain(longName)
    // 이름은 말줄임으로 감추지 않는다(좁은 화면에서 무엇을 올렸는지가 사라진다).
    expect(container.innerHTML).not.toContain('truncate')

    // 이름은 크기·버튼과 줄을 나눠 쓰지 않는다 — 같은 가로줄에 두면 320px에서 이름 칸이
    // 서너 글자로 눌린다. 이름이 선 줄 안에는 버튼도 크기도 없어야 한다.
    const nameSpan = [...container.querySelectorAll('span')].find(
      (el) => el.textContent === longName,
    )
    const nameRow = nameSpan?.parentElement
    expect(nameRow).toBeDefined()
    expect(nameRow?.querySelector('button')).toBeNull()
    expect(nameRow?.textContent).toBe(longName)
  })

  it('제출을 누르면 그 문항의 제출만 부른다', () => {
    const onSubmit = vi.fn()
    const container = render(baseProps({ onSubmit }))
    const submit = byText(container, '제출하기')

    expect(submit?.disabled).toBe(false)
    act(() => submit?.click())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('낼 파일이 없으면 제출 버튼이 잠기고 이유를 적는다', () => {
    const container = render(
      baseProps({
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status: 'DRAFT',
            round: 1,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow({ status: 'PENDING' })],
          write: writeStateOfModule('OPEN'),
        }),
      }),
    )

    expect(byText(container, '제출하기')?.disabled).toBe(true)
    expect(container.textContent).toContain('확인되지 않은 파일')
  })

  it('마감된 요청에서는 올리기·제출·메모 칸이 서지 않고 이유만 남는다', () => {
    const closed = writeStateOfModule('CLOSED')
    const container = render(
      baseProps({
        canRemove: () => false,
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status: 'DRAFT',
            round: 1,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow()],
          write: closed,
        }),
      }),
    )

    expect(byText(container, '파일 선택')).toBeUndefined()
    expect(byText(container, '메모 남기기')).toBeUndefined()
    expect(byText(container, '제출하기')?.disabled).toBe(true)
    expect(byLabel(container, '내리기')).toBeUndefined()
    // 내려받기는 남는다 — 마감은 '더 못 낸다'는 뜻이지 '못 본다'는 뜻이 아니다.
    expect(byLabel(container, '다운로드')).toBeDefined()
    expect(container.textContent).toContain(closed.writable === false ? closed.reason : '')
  })

  it('지난 회차 파일은 내려받기만 남고 그 회차임을 적는다', () => {
    const container = render(
      baseProps({
        canRemove: (file) => file.round === 2,
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status: 'REWORK_REQUESTED',
            round: 2,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow({ id: 'old', original_name: '이전.pdf', round: 1 })],
          write: writeStateOfModule('OPEN'),
        }),
      }),
    )

    expect(container.textContent).toContain('지난 회차')
    expect(container.textContent).toContain('1회차')
    expect(byLabel(container, '이전.pdf 다운로드')).toBeDefined()
    expect(byLabel(container, '이전.pdf 내리기')).toBeUndefined()
  })

  it('실패한 업로드는 성공과 섞이지 않고 파일별로 남는다', () => {
    const container = render(
      baseProps({
        notes: [
          { fileName: '1.pdf', ok: true },
          { fileName: '2.pdf', ok: false, message: '파일을 올리지 못했습니다.' },
        ],
      }),
    )

    expect(container.textContent).toContain('1.pdf')
    expect(container.textContent).toContain('2.pdf — 파일을 올리지 못했습니다.')
  })

  it('올라가다 만 파일은 다시 확인·지우기를 걸 수 있다', () => {
    const onRetryPending = vi.fn()
    const container = render(
      baseProps({
        onRetryPending,
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status: 'DRAFT',
            round: 1,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow({ id: 'p1', original_name: '끊긴.pdf', status: 'PENDING' })],
          write: writeStateOfModule('OPEN'),
        }),
      }),
    )

    const retry = byLabel(container, '끊긴.pdf 다시 확인')
    expect(retry).toBeDefined()
    act(() => retry?.click())
    expect(onRetryPending).toHaveBeenCalledWith('p1')
  })

  it.each([
    ['마감된 요청', writeStateOfModule('CLOSED'), 'DRAFT' as const],
    ['제출한 뒤', writeStateOfModule('OPEN'), 'SUBMITTED' as const],
    ['승인된 뒤', writeStateOfModule('OPEN'), 'APPROVED' as const],
  ])('%s에는 확인되지 않은 파일에 쓰기 버튼이 아예 서지 않는다', (_name, write, status) => {
    const container = render(
      baseProps({
        canRemove: () => false,
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status,
            round: 1,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow({ id: 'p1', original_name: '끊긴.pdf', status: 'PENDING' })],
          write,
        }),
      }),
    )

    // 줄은 남는다 — 무엇이 전달되지 않았는지는 여전히 읽을 수 있어야 한다.
    expect(container.textContent).toContain('끊긴.pdf')
    expect(container.textContent).toContain('확인되지 않은 파일')
    // 다시 확인은 확정을 다시 보내는 쓰기다. 잠그는 데 그치지 않고 세우지 않는다.
    expect(byLabel(container, '끊긴.pdf 다시 확인')).toBeUndefined()
    expect(byLabel(container, '끊긴.pdf 지우기')).toBeUndefined()
  })

  it('저장 중에는 같은 버튼을 다시 누를 수 없다', () => {
    const container = render(
      // `any`는 "지금 이 문항에서 무언가 돌고 있다"는 한 칸이다. 올리는 중·제출 중이면
      // 그 문항의 다른 쓰기 버튼까지 함께 잠기므로 여기서도 함께 켠다.
      baseProps({ busy: { any: true, upload: true, submit: true, comment: false, fileId: 'f1' } }),
    )

    expect(byText(container, '올리는 중…')?.disabled).toBe(true)
    expect(byText(container, '제출 중…')?.disabled).toBe(true)
    expect(byLabel(container, 'a.pdf 다운로드')?.disabled).toBe(true)
  })
})
