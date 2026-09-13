// @vitest-environment jsdom
import { createElement as h, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestContextSwitcher } from '@/app/GuestContextSwitcher'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestMe } from '@/features/meHooks'
import { queryClient } from '@/lib/queryClient'

/**
 * 참여 전환기 **통합** 회귀 테스트 — 서비스 단위 테스트가 닿지 못하는 자리를 본다.
 *
 * `guestAuthService.test.ts`는 순수 함수의 입출력을 본다: 응답을 주면 스토어에 무엇이 남는가.
 * 그러나 2026-09-13에 고친 결함들은 전부 **화면이 붙어 있는 동안의 수명주기**에 있었다 —
 * 방금 로그인해 들어온 세션에는 목록을 받아 오는 효과가 다시 돌지 않아 `▾`조차 서지 않았고,
 * 갈아탄 뒤에도 옛 맥락의 응답이 캐시에 남아 사이드바와 본문이 서로 다른 사업을 말했다.
 * 둘 다 서비스만 불러서는 재현되지 않는다(붙어 있는 관찰자가 없으므로). 그래서 실제 컴포넌트를
 * 실제 스토어·실제 queryClient 위에 얹고, 경계는 `fetch` 하나만 가짜로 세운다.
 *
 * 서버는 흉내만 내는 것이 아니라 **상태를 가진다** — 어느 맥락으로 들어와 있는지를 서버가
 * 기억해야, 갈아탄 뒤의 새로고침이 옛 사업을 돌려주는 가짜 통과를 막을 수 있다.
 */

/** base64url JWT 흉내. 이 층은 서명을 검증하지 않고 만료만 읽는다. */
function jwt(expMs: number): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return [part({ alg: 'HS256', typ: 'JWT' }), part({ sub: 'u-1', exp: Math.floor(expMs / 1000) }), 'sig'].join('.')
}

/** 이 테스트가 다루는 두 맥락. 키를 좁혀 두면 표 조회가 `undefined`를 흘리지 않는다. */
type Pid = 'pp-1' | 'pp-2'

/** 맥락마다 다른 토큰이어야 refreshSession의 '늦게 온 응답' 판정이 실제로 돈다. */
const TOKEN = {
  'pp-1': jwt(Date.now() + 60 * 60 * 1000),
  'pp-2': jwt(Date.now() + 2 * 60 * 60 * 1000),
}

/** 앞머리가 길게 겹치는 두 이름 — 꼬리를 자르면 화면에서 갈리지 않는 바로 그 경우다. */
const TITLE = {
  'pp-1': '2026 예비창업패키지 액셀러레이팅 지원사업',
  'pp-2': '2026 예비창업패키지 액셀러레이팅 투자조합',
}

const CONTEXTS = [
  {
    participantId: 'pp-1',
    programId: 'pg-1',
    entityKey: 'program',
    code: 'AC-2026',
    title: TITLE['pp-1'],
    persona: 'startups',
  },
  {
    participantId: 'pp-2',
    programId: 'pg-2',
    entityKey: 'fund',
    code: 'FUND-01',
    title: TITLE['pp-2'],
    persona: 'networks',
  },
]

/** 서버가 기억하는 것 — 지금 이 계정이 들어와 있는 맥락. */
let current: Pid
/** 다음 전환 요청 한 번을 거절시킨다(담당자가 문을 닫은 경우). */
let rejectNextEnter: Pid | null
let fetchMock: ReturnType<typeof vi.fn>
const g = globalThis as unknown as { fetch: typeof fetch; IS_REACT_ACT_ENVIRONMENT?: boolean }
let realFetch: typeof fetch

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sessionBody(participantId: Pid) {
  const c = CONTEXTS.find((x) => x.participantId === participantId)!
  return {
    accessToken: TOKEN[participantId],
    user: { id: 'u-1', name: '김참여', user_type: 'external_startup' },
    context: {
      participant_id: c.participantId,
      program_id: c.programId,
      entity_key: c.entityKey,
      code: c.code,
      title: c.title,
      persona: c.persona,
    },
  }
}

function meBody(participantId: Pid) {
  const c = CONTEXTS.find((x) => x.participantId === participantId)!
  return {
    user: { id: 'u-1', name: '김참여', user_type: 'external_startup', email: 'a@b.com' },
    program: {
      id: c.programId,
      title: c.title,
      code: c.code,
      status: null,
      start_date: null,
      end_date: null,
      entity_key: c.entityKey,
    },
    participation: { persona: c.persona, joined_at: null },
    company: null,
    currentParticipantId: c.participantId,
    contexts: CONTEXTS,
  }
}

/** 상태를 가진 가짜 Edge Function. 경로로만 갈린다. */
function server(url: string, init: RequestInit): Response {
  const body = JSON.parse(String(init.body ?? '{}')) as { participantId?: Pid }
  if (url.endsWith('/guest-auth-refresh')) return json(meBody(current))
  if (url.endsWith('/guest-auth-context')) {
    const target = body.participantId as Pid
    if (rejectNextEnter === target) {
      rejectNextEnter = null
      return json({ message: '그곳으로 들어갈 수 없습니다.' }, 403)
    }
    current = target
    return json(sessionBody(target))
  }
  throw new Error(`예상하지 못한 호출: ${url}`)
}

// ---------------------------------------------------------------- 렌더 도구

let container: HTMLDivElement
let root: Root

/**
 * 같은 질의 키를 구독하는 두 번째 화면. 사이드바만 새 사업으로 바뀌고 본문은 옛 사업으로
 * 남는 상태를 잡으려면, 전환기 **밖에서** 같은 값을 그리는 자리가 함께 떠 있어야 한다
 * (실제로는 개요 요약·마이페이지가 이 자리에 선다).
 */
function MeProbe() {
  const { data } = useGuestMe()
  return h('p', { id: 'me-probe' }, data?.program.title ?? '—')
}

/**
 * `withProbe`가 기본으로 꺼져 있는 것이 중요하다. 같은 질의 키를 구독하는 화면이 하나라도 더
 * 떠 있으면 **전환기 자신이 구독하지 않아도 목록이 채워진다** — 그 상태로 확인하면 전환기의
 * 구독을 걷어내도 초록이 나오는 가짜 통과가 된다(실제로 그랬다). 목록을 받는 일은 전환기 혼자
 * 떠 있을 때 확인하고, 공유 캐시가 함께 갈리는 일만 관찰자를 붙여 확인한다.
 */
async function mount(withProbe = false) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(
          MemoryRouter,
          { initialEntries: ['/notice'] },
          h(
            'div',
            null,
            h(GuestContextSwitcher, null),
            withProbe ? h(MeProbe, null) : null,
          ),
        ),
      ),
    )
  })
  await flush()
}

/** 떠 있는 약속과 React 갱신을 함께 흘려보낸다. */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

async function click(el: Element | null) {
  expect(el).not.toBeNull()
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush()
}

async function press(el: Element | null, key: string) {
  expect(el).not.toBeNull()
  await act(async () => {
    el!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const trigger = () => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')
const items = () => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
/** i번째 줄. 없으면 그 자리에서 터뜨린다 — 뒤따르는 단언이 조용히 건너뛰지 않게 한다. */
function item(i: number): HTMLButtonElement {
  const el = items()[i]
  if (!el) throw new Error(`목록에 ${i}번 줄이 없습니다(현재 ${items().length}줄).`)
  return el
}
const currentLabel = () => trigger()?.textContent ?? ''
const probe = () => container.querySelector('#me-probe')?.textContent ?? ''

// ---------------------------------------------------------------- 준비/정리

beforeEach(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true
  current = 'pp-1'
  rejectNextEnter = null
  realFetch = g.fetch
  fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(server(url, init)))
  g.fetch = fetchMock as unknown as typeof fetch
  localStorage.clear()
  queryClient.clear()
  // 방금 로그인해 들어온 세션 — 맥락은 있으나 **전환 목록은 아직 없다.** 종전 구조에서
  // 이 상태가 영영 풀리지 않았다(앱 구동 효과가 이미 지나갔으므로).
  useGuestStore.setState({
    status: 'authenticated',
    user: { id: 'u-1', name: '김참여', role: 'external_startup' },
    program: {
      id: 'pg-1',
      title: TITLE['pp-1'],
      code: 'AC-2026',
      entityKey: 'program',
      participantId: 'pp-1',
      persona: 'startups',
    },
    contexts: [],
    accessToken: TOKEN['pp-1'],
  })
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  container?.remove()
  g.fetch = realFetch
  queryClient.clear()
  vi.restoreAllMocks()
})

describe('GuestContextSwitcher (통합)', () => {
  it('방금 로그인해 들어온 세션이 스스로 참여 목록을 받아 전환 가능해진다', async () => {
    await mount()

    expect(useGuestStore.getState().contexts).toHaveLength(2)
    expect(trigger()).not.toBeNull()
    expect(currentLabel()).toContain(TITLE['pp-1'])

    await click(trigger())
    expect(items()).toHaveLength(2)
    // 두 이름은 앞머리가 같다 — 잘리지 않은 전문이 서야 서로 갈린다.
    expect(item(0).textContent).toContain(TITLE['pp-1'])
    expect(item(1).textContent).toContain(TITLE['pp-2'])
    // 지금 들어와 있는 줄만 '현재'로 표시된다(배지가 아니라 글자).
    expect(item(0).getAttribute('aria-current')).toBe('true')
    expect(item(1).getAttribute('aria-current')).toBeNull()
  })

  it('둘째 줄을 고르면 전환기와 같은 키를 구독하는 화면이 함께 새 맥락으로 바뀐다', async () => {
    await mount(true)
    expect(probe()).toBe(TITLE['pp-1'])

    await click(trigger())
    await click(item(1))

    // 세션이 갈렸고
    expect(useGuestStore.getState().program?.participantId).toBe('pp-2')
    expect(useGuestStore.getState().accessToken).toBe(TOKEN['pp-2'])
    // 사이드바 표시와
    expect(currentLabel()).toContain(TITLE['pp-2'])
    // 같은 질의를 구독하는 다른 화면이 **함께** 바뀐다(캐시가 버려지고 다시 받았다는 뜻).
    expect(probe()).toBe(TITLE['pp-2'])
    // 목록은 닫힌다.
    expect(items()).toHaveLength(0)
    // 초점은 문서 맨 앞이 아니라 트리거로 돌아온다(요청 중에는 비활성이었다).
    expect(document.activeElement).toBe(trigger())
  })

  it('되돌아오는 전환도 같은 경로로 돈다', async () => {
    await mount(true)
    await click(trigger())
    await click(item(1))
    expect(probe()).toBe(TITLE['pp-2'])

    await click(trigger())
    await click(item(0))

    expect(useGuestStore.getState().program?.participantId).toBe('pp-1')
    expect(currentLabel()).toContain(TITLE['pp-1'])
    expect(probe()).toBe(TITLE['pp-1'])
  })

  it('전환이 거절되면 사유를 알리고 들어와 있던 맥락은 그대로 둔다', async () => {
    await mount(true)
    rejectNextEnter = 'pp-2'

    await click(trigger())
    await click(item(1))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '들어갈 수 없습니다',
    )
    // 실패한 요청은 세션을 건드리지 않는다 — 사이드바도 본문도 원래 자리다.
    expect(useGuestStore.getState().program?.participantId).toBe('pp-1')
    expect(useGuestStore.getState().accessToken).toBe(TOKEN['pp-1'])
    expect(currentLabel()).toContain(TITLE['pp-1'])
    expect(probe()).toBe(TITLE['pp-1'])
    // 목록은 열린 채로 남고, 초점은 방금 누른 줄에 있다(다시 누를 자리).
    expect(items()).toHaveLength(2)
    expect(document.activeElement).toBe(item(1))

    // 같은 줄을 다시 고르면 이번에는 들어간다.
    await click(item(1))
    expect(useGuestStore.getState().program?.participantId).toBe('pp-2')
    expect(probe()).toBe(TITLE['pp-2'])
  })

  it('키보드로 열고 오르내리고 닫는다', async () => {
    await mount()

    // 키보드로 열면 지금 들어와 있는 줄에 초점이 얹힌다.
    await click(trigger())
    expect(document.activeElement).toBe(item(0))

    await press(document.activeElement, 'ArrowDown')
    expect(document.activeElement).toBe(item(1))
    // 끝에서 한 번 더 내려가면 처음으로 돈다.
    await press(document.activeElement, 'ArrowDown')
    expect(document.activeElement).toBe(item(0))
    await press(document.activeElement, 'ArrowUp')
    expect(document.activeElement).toBe(item(1))

    await press(document.activeElement, 'Escape')
    expect(items()).toHaveLength(0)
    expect(document.activeElement).toBe(trigger())
  })
})
