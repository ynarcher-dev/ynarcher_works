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
  QuestionSubmitButton,
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
    // 첨부파일이 붙어 있지 않은 문항이 기본이다 — 그때 그 카드가 서지 않는 것도 규칙이다.
    providedFiles: [],
    onDownloadProvided: () => {},
    notes: [],
    commentDraft: '',
    onCommentDraftChange: () => {},
    onPickFiles: () => {},
    onDownload: () => {},
    onRemove: () => {},
    onRetryPending: () => {},
    onAddComment: () => {},
    ...over,
  }
}

/**
 * 내는 버튼은 패널 **머리**에 서므로(2026-09-14) 이 부품만 따로 그린다 — 본문과 같은 판정
 * (`controls`·`busy`)을 보면서 자리만 다르다.
 */
function renderSubmit(props: QuestionPanelProps, onSubmit = () => {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() =>
    root.render(
      createElement(QuestionSubmitButton, {
        controls: props.controls,
        busy: props.busy,
        onSubmit,
      }),
    ),
  )
  mounted.push({ root, container })
  return container
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
  it('문항명 아래에 요청 문구가 서고 대분류·회차는 서지 않는다', () => {
    const longName = `${"매우긴파일이름".repeat(20)}.pdf`
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

    // 담당자가 적은 요청 문구는 문항명 카드 안, 이름 바로 아래에 선다(2026-09-14).
    const firstCard = container.querySelector('section.shadow-soft')
    expect(firstCard?.textContent).toContain('최근 3개년 재무제표')
    expect(firstCard?.textContent).toContain('국세청 발급본을 올려 주십시오.')
    // 상위 폴더(대분류) 이름과 회차는 세우지 않는다.
    expect([...container.querySelectorAll('p')].some((el) => el.textContent === '재무')).toBe(false)
    expect(container.textContent).not.toContain('1회차')
    expect(container.textContent).toContain(longName)
    // 행이 좁아 이름이 잘려도 전체 이름은 남는다 — 무엇을 올렸는지 확인할 길을 없애지 않는다.
    expect(container.querySelector('span[title]')?.getAttribute('title')).toBe(longName)
  })

  it('세 덩이(문항명·파일 업로드·코멘트)가 각각 카드 한 장으로 선다', () => {
    const container = render(baseProps())
    const heads = [...container.querySelectorAll('h4')].map((el) => el.textContent)

    // 코멘트 칸은 제목 옆에 오간 말의 건수를 함께 세운다(카드 제목 규격 [n]).
    expect(heads).toEqual(['파일 업로드', '코멘트[0]'])
    // 문항명 카드에는 제목 줄이 따로 없다 — 이름 자체가 그 카드의 내용이다.
    expect(container.querySelector('h3')?.textContent).toContain('최근 3개년 재무제표')
    // 카드 상자는 공용 셸(CardShell)이 그린다. 손으로 쓴 흰 div는 밀도 맥락을 내려주지 못한다.
    expect(container.querySelectorAll('section.shadow-soft')).toHaveLength(3)
    // 제출 버튼은 본문에 없다 — 패널 머리가 갖는다(2026-09-14 사용자 지정). 본문에 남은 '제출하기'는
    // 그 버튼을 가리키는 안내 문구뿐이라 버튼으로 찾는다.
    expect(byText(container, '제출하기')).toBeUndefined()
  })

  it('첨부파일 카드는 붙어 있을 때만 카드로 서고, 올리는 상자보다 위에 선다', () => {
    const onDownloadProvided = vi.fn()
    const container = render(
      baseProps({
        onDownloadProvided,
        providedFiles: [
          {
            id: 'att-1',
            file_name: '재무제표_양식.xlsx',
            content_type: null,
            byte_size: 2048,
            created_at: '2026-09-14T01:00:00Z',
          },
        ],
      }),
    )

    const heads = [...container.querySelectorAll('h4')].map((el) => el.textContent)
    // 받아 갈 것이 먼저 읽혀야 하므로 '파일 업로드' 앞에 선다.
    expect(heads).toEqual(['첨부파일[1]', '파일 업로드', '코멘트[0]'])
    expect(container.textContent).toContain('재무제표_양식.xlsx')

    // 내려받기는 내 제출물과 다른 통로를 타므로 콜백도 따로다 — 같은 것으로 묶으면 제출물
    // 다운로드가 이 줄의 id를 들고 나간다.
    act(() => byLabel(container, '재무제표_양식.xlsx 다운로드')?.click())
    expect(onDownloadProvided).toHaveBeenCalledTimes(1)
  })

  it('내는 버튼은 본문 카드가 아니라 패널 머리가 갖는다', () => {
    // 본문에는 서지 않는다 — 같은 버튼이 두 자리에 서면 어느 것이 도는지 화면이 답하지 못한다.
    expect(byText(render(baseProps()), '제출하기')).toBeUndefined()
  })

  it('제출을 누르면 그 문항의 제출만 부른다', () => {
    const onSubmit = vi.fn()
    const container = renderSubmit(baseProps(), onSubmit)
    const submit = byText(container, '제출하기')

    expect(submit?.disabled).toBe(false)
    act(() => submit?.click())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('낼 파일이 없으면 제출 버튼이 잠기고 이유를 적는다', () => {
    const props = baseProps({
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
    })

    // 잠기는 것은 머리의 버튼이고, 그 이유는 파일을 다루는 본문 칸이 적는다.
    expect(byText(renderSubmit(props), '제출하기')?.disabled).toBe(true)
    expect(render(props).textContent).toContain('확인되지 않은 파일')
  })

  it('마감된 요청에서는 받는 상자·메모 칸이 서지 않는다', () => {
    const closed = writeStateOfModule('CLOSED')
    const props = baseProps({
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
    })
    const container = render(props)

    expect(byText(container, '끌어다')).toBeUndefined()
    expect(byText(container, '메모 남기기')).toBeUndefined()
    // 머리의 내는 버튼도 함께 잠긴다 — 마감은 '더 못 낸다'는 뜻이다.
    expect(byText(renderSubmit(props), '제출하기')?.disabled).toBe(true)
    expect(byLabel(container, '내리기')).toBeUndefined()
    // 내려받기는 남는다 — 마감은 '더 못 낸다'는 뜻이지 '못 본다'는 뜻이 아니다.
    expect(byLabel(container, '다운로드')).toBeDefined()
    // 마감 사유는 이 패널이 되풀이하지 않는다 — 모듈 화면 위쪽이 한 번 말한다(2026-09-14).
    expect(container.textContent).not.toContain(closed.writable === false ? closed.reason : 'x')
  })

  it('지난 제출 파일도 낼 수 있는 상태에서는 내릴 수 있고, 언제 낸 것인지 적는다', () => {
    const container = render(
      baseProps({
        // 보완 요청을 받은 문항은 아직 이쪽 손에 있다 — 회차로 가르지 않는다(2026-09-14).
        canRemove: () => true,
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

    expect(container.textContent).toContain('지난 제출')
    // 묶음을 가르는 것은 회차 번호가 아니라 그 제출의 날짜다.
    expect(container.textContent).toContain('지난 제출 (2026. 9. 13.)')
    expect(container.textContent).not.toContain('1회차')
    expect(byLabel(container, '이전.pdf 다운로드')).toBeDefined()
    expect(byLabel(container, '이전.pdf 내리기')).toBeDefined()
  })

  it('낼 수 없는 상태에서는 지난 제출 파일에 내리기가 서지 않는다', () => {
    const container = render(
      baseProps({
        // 검토 중·완료·마감에서는 서버도 거절한다 — 눌러도 언제나 실패하는 버튼을 세우지 않는다.
        canRemove: () => false,
        controls: questionControls({
          response: {
            id: 'resp-1',
            assignment_id: 'as-1',
            node_id: 'q1',
            status: 'SUBMITTED',
            round: 2,
            submitted_at: null,
            reviewed_at: null,
          },
          files: [fileRow({ id: 'old', original_name: '이전.pdf', round: 1 })],
          write: writeStateOfModule('OPEN'),
        }),
      }),
    )

    expect(byLabel(container, '이전.pdf 다운로드')).toBeDefined()
    expect(byLabel(container, '이전.pdf 내리기')).toBeUndefined()
  })

  it('올린 결과는 실패만 남고 성공은 목록이 대신 말한다', () => {
    const container = render(
      baseProps({
        notes: [
          { fileName: '1.pdf', ok: true },
          { fileName: '2.pdf', ok: false, message: '파일을 올리지 못했습니다.' },
        ],
      }),
    )

    // 성공한 줄은 아래 '제출 파일'이 답하므로 문장으로 다시 적지 않는다.
    expect(container.textContent).not.toContain('1.pdf')
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
    // `any`는 "지금 이 문항에서 무언가 돌고 있다"는 한 칸이다. 올리는 중·제출 중이면
    // 그 문항의 다른 쓰기 버튼까지 함께 잠기므로 여기서도 함께 켠다.
    const props = baseProps({
      busy: { any: true, upload: true, submit: true, comment: false, fileId: 'f1' },
    })
    const container = render(props)

    expect(byText(container, '올리는 중…')?.disabled).toBe(true)
    expect(byLabel(container, 'a.pdf 다운로드')?.disabled).toBe(true)
    // 머리의 버튼은 도는 중임을 제 글자로 말한다.
    expect(byText(renderSubmit(props), '제출 중…')?.disabled).toBe(true)
  })
})
