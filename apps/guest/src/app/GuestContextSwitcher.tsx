import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Dropdown } from '@ynarcher/ui'
import { ChevronDown, RotateCw } from 'lucide-react'
import { guestAuth } from '@/auth/guestAuthService'
import { accessEndLabel, contextTags, switcherState } from '@/auth/contextDisplay'
import { useGuestStore } from '@/auth/guestStore'
import { GUEST_HOME_PATH } from '@/config/navigation'
import { useGuestMe } from '@/features/meHooks'

/**
 * 사이드바 상단의 참여 전환기 — WORKS의 워크스페이스 스위처가 서는 자리.
 *
 * 2026-09-05 이전에는 전환할 수 없는 사업명 표시였다. 계정이 사업마다 갈려 있어 다른
 * 사업은 그 사업의 코드로 다시 들어와야 했기 때문이다. 계정이 하나가 된 지금은 **바뀌는
 * 것이 신원이 아니라 맥락**이므로 토큰만 다시 받으면 된다(재로그인 없음).
 *
 * 한 번에 보이는 것은 여전히 하나다 — 고른 순간 아래 메뉴가 통째로 갈린다. 그래서 전환
 * 직후 홈으로 보낸다: 지금 보고 있던 메뉴는 그 사업의 것이라 새 맥락에 존재하지 않는다.
 *
 * **목록을 이 컴포넌트가 구독한다**(2026-09-13). 종전에는 앱 구동 효과가 딱 한 번 받아 온
 * 값에 기대고 있었고, 그래서 방금 로그인해 들어온 사람은 목록이 빈 채로 남아 `▾`조차 서지
 * 않았다 — 참여가 셋이어도 새로고침하기 전까지는 갈아탈 수 없었다. 같은 질의 키를 여기서
 * 구독하면 로그인 직후·갈아탄 직후·새로고침이 모두 같은 경로를 타고, 왕복은 한 번이다.
 *
 * 갈 곳이 하나뿐이면 펼칠 것이 없으므로 `▾` 없이 이름만 세운다 — 고를 것이 없는데 열리는
 * 컨트롤을 두면 "고를 수 있다"고 말하는 셈이 된다. 다만 **아직 모르는 것을 하나라고 말하지도
 * 않는다**: 목록을 받는 중과 받지 못한 것은 각자 다른 모습으로 선다(`switcherState`).
 */
export function GuestContextSwitcher() {
  const navigate = useNavigate()
  const program = useGuestStore((s) => s.program)
  const contexts = useGuestStore((s) => s.contexts)
  const { isPending, isError, refetch } = useGuestMe()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const currentIndex = Math.max(
    contexts.findIndex((c) => c.participantId === program?.participantId),
    0,
  )

  // 키보드로 열었을 때 지금 들어와 있는 줄에 초점을 얹는다. 마우스로 열었을 때는
  // `focus-visible`이라 테두리가 보이지 않으므로 두 입력 방식이 서로를 방해하지 않는다.
  // **여는 순간에만** 얹는다 — 열어 둔 채로 목록이 갱신될 때마다 초점을 끌어오면, 아래
  // 줄을 고르려고 내려가던 사람이 매번 현재 줄로 되돌려진다.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) itemRefs.current[currentIndex]?.focus()
    wasOpen.current = open
  }, [open, currentIndex])

  /**
   * 전환이 끝난 뒤 초점을 어디로 돌려놓을 것인가.
   *
   * 요청이 도는 동안 트리거와 줄이 모두 `disabled`라, 그 자리에서 `focus()`를 불러도 아무 일도
   * 일어나지 않는다 — 브라우저는 비활성 버튼에 초점을 주지 않고, 눌린 줄은 그 순간 초점을
   * 잃는다. 그래서 초점을 **`busy`가 풀린 뒤로 미룬다**: 성공하면 트리거(목록이 닫힌 자리),
   * 실패하면 방금 누른 줄(다시 누를 자리)로 돌아간다. 미루지 않으면 키보드 사용자의 초점이
   * 문서 맨 앞으로 떨어져 새 화면을 처음부터 훑어야 한다.
   */
  const refocus = useRef<'trigger' | number | null>(null)
  useEffect(() => {
    if (busy || refocus.current === null) return
    const target = refocus.current
    refocus.current = null
    if (target === 'trigger') triggerRef.current?.focus()
    else itemRefs.current[target]?.focus()
  }, [busy])

  if (!program) return null

  const state = switcherState({ count: contexts.length, loading: isPending, error: isError })
  const tags = contextTags(program.entityKey, program.persona)
  const kindAndPersona = tags.map((t) => t.label).join(' · ')

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }

  const onPick = async (participantId: string, index: number) => {
    if (participantId === program.participantId) {
      close()
      return
    }
    setError(null)
    setBusy(true)
    try {
      await guestAuth.enterContext(participantId)
      // 목록을 닫고 홈으로 옮긴다. 초점은 `busy`가 풀린 뒤 트리거로 돌아간다(위 refocus).
      refocus.current = 'trigger'
      close(false)
      navigate(GUEST_HOME_PATH, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '그곳으로 들어갈 수 없습니다.')
      // 거절은 대개 목록이 낡았다는 뜻이다(담당자가 문을 닫았다). 사유를 알리면서
      // 목록도 지금 사실로 되받는다 — 누를 수 없는 줄을 계속 보여 주지 않는다.
      // 지금 들어와 있는 맥락은 그대로다: 실패한 요청은 세션을 건드리지 않는다.
      refocus.current = index
      void refetch()
    } finally {
      setBusy(false)
    }
  }

  /** 열린 목록 안에서의 키보드 이동. 트리거의 Enter·Space는 브라우저 기본 동작이 맡는다. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    const next = at < 0 ? 0 : (at + step + items.length) % items.length
    items[next]?.focus()
  }

  /**
   * 지금 어디에 들어와 있는가. 어두운 사이드바 표면에서는 종류·자격을 태그가 아니라 글자로
   * 세운다 — 중립 태그는 흰 면 위의 규격이고, 이 자리에 그대로 얹으면 밝은 덩어리가 사업명보다
   * 먼저 읽힌다. 태그로 서는 자리는 흰 면(펼친 목록·로그인 선택·개요 요약)이다.
   */
  const currentLines = (
    <>
      <span className="block truncate text-body font-bold text-white" title={program.title}>
        {program.title}
      </span>
      {(kindAndPersona || state !== 'single') && (
        <span className="block truncate text-caption text-white/70">
          {[
            kindAndPersona || null,
            state === 'switchable' ? `참여 ${contexts.length}건` : null,
            state === 'loading' ? '참여 목록 확인 중' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </>
  )

  const label = (
    <p className="mb-1 px-1 text-caption text-white/60">
      {state === 'switchable' ? '참여 전환' : '현재 참여'}
    </p>
  )

  // 목록을 받지 못한 경우. 현재 맥락은 그대로 세우되 상자 자체가 '다시 받기'가 된다 —
  // 사이드바에는 따로 안내를 놓을 자리가 없고, 이 자리에서 막힌 것은 목록 하나뿐이다.
  if (state === 'error') {
    return (
      <div>
        {label}
        <button
          type="button"
          onClick={() => void refetch()}
          aria-label={`참여 목록을 불러오지 못했습니다. 다시 불러오기. 현재 ${program.title}`}
          className="flex min-h-12 w-full items-center gap-2 rounded-radius-md border border-white/20 bg-white/10 px-3 py-2 text-left transition-colors duration-fast hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-bold text-white" title={program.title}>
              {program.title}
            </span>
            <span className="block truncate text-caption text-white/70">
              참여 목록을 불러오지 못했습니다 · 다시 시도
            </span>
          </span>
          <RotateCw aria-hidden className="size-4 shrink-0 text-white/70" />
        </button>
      </div>
    )
  }

  if (state !== 'switchable') {
    return (
      <div>
        {label}
        <div className="rounded-radius-md border border-white/20 bg-white/10 px-3 py-2">
          {currentLines}
        </div>
      </div>
    )
  }

  return (
    <div onKeyDown={onKeyDown}>
      {label}
      <Dropdown
        open={open}
        onClose={() => close(false)}
        block
        // 사이드바 폭에 꽉 맞춘다 — 목록 줄이 사업명 두 줄이라 기본 최소폭(min-w-40)으로는 좁다.
        //
        // 높이는 화면에 묶는다(2026-09-13 리뷰). 참여가 여럿인 계정은 목록이 길어지는데, 메뉴가
        // 트리거 바로 아래에서 자라기만 하면 아래쪽 줄이 화면 밖으로 나가고 — 모바일 드로어에서는
        // 더 일찍 — 그 줄에는 닿을 길이 아예 없다. 안에서 굴리면 줄 수와 무관하게 전부 닿는다.
        // `overscroll-contain`은 끝까지 굴렸을 때 그 힘이 뒤 화면으로 새지 않게 한다.
        className="left-0 right-0 max-h-[60vh] overflow-y-auto overscroll-contain"
        trigger={
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`참여 전환. 현재 ${[kindAndPersona, program.title].filter(Boolean).join(' ')}`}
            disabled={busy}
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-12 w-full items-center gap-2 rounded-radius-md border border-white/20 bg-white/10 px-3 py-2 text-left transition-colors duration-fast hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/20 disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">{currentLines}</span>
            <ChevronDown
              aria-hidden
              className={`size-4 shrink-0 text-white/70 transition-transform duration-fast ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        }
      >
        <ul aria-label="참여 중인 프로젝트/FUND">
          {contexts.map((c, i) => {
            const current = c.participantId === program.participantId
            const rowTags = contextTags(c.entityKey, c.persona)
            const meta = [c.code, accessEndLabel(c.accessEndsAt)].filter(Boolean).join(' · ')
            return (
              <li key={c.participantId}>
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  type="button"
                  role="menuitem"
                  aria-current={current || undefined}
                  disabled={busy}
                  onClick={() => void onPick(c.participantId, i)}
                  className={`flex min-h-12 w-full flex-col items-start justify-center gap-1 rounded-radius-md px-3 py-2 text-left transition-colors duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:opacity-60 ${
                    current ? 'bg-brand-25' : ''
                  }`}
                >
                  <span className="flex w-full items-start gap-2">
                    {/*
                      고르는 자리에서는 이름을 자르지 않는다(2026-09-13 리뷰). 사업명은 앞머리가
                      길게 겹치는 일이 잦아('2026 예비창업패키지 …'), 꼬리를 자르면 두 줄이 같은
                      글자로 보인다 — 무엇을 고르는지 답해야 하는 자리에서 답을 지우는 셈이다.
                      네이티브 tooltip은 마우스에만 있으므로 모바일에서는 대안이 되지 않는다.
                      `break-words`는 띄어쓰기 없는 긴 이름도 상자 안에서 끊어 준다.
                    */}
                    <span className="min-w-0 flex-1 break-words text-body font-medium text-gray-900">
                      {c.title}
                    </span>
                    {current && (
                      /*
                        '지금 여기'는 태그가 아니라 글자로 세운다. 종류·자격이 이미 중립 배지로
                        서 있는 줄에 배지를 하나 더 얹으면 분류와 현재 상태가 같은 무게로 경쟁하고,
                        공용 Badge 밖에서 배지 모양을 손으로 그리면 규격이 두 벌이 된다.
                        줄 자체의 바탕(bg-brand-25)과 `aria-current`가 이미 같은 사실을 말한다.
                      */
                      <span className="shrink-0 text-caption font-medium text-brand">현재</span>
                    )}
                  </span>
                  <span className="flex w-full flex-wrap items-center gap-1">
                    {rowTags.map((t) => (
                      <Badge key={t.key}>{t.label}</Badge>
                    ))}
                    {meta && <span className="text-caption text-gray-500">{meta}</span>}
                  </span>
                </button>
              </li>
            )
          })}
          {error && (
            <li className="px-3 py-2 text-caption text-danger" role="alert">
              {error}
            </li>
          )}
        </ul>
      </Dropdown>
    </div>
  )
}
