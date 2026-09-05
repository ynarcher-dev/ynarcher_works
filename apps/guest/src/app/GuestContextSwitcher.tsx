import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'
import { GUEST_HOME_PATH } from '@/config/navigation'

function endLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `~ ${d.toLocaleDateString('ko-KR')}`
}

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
 * 갈 곳이 하나뿐이면 펼칠 것이 없으므로 `▾` 없이 이름만 세운다 — 고를 것이 없는데 열리는
 * 컨트롤을 두면 "고를 수 있다"고 말하는 셈이 된다.
 */
export function GuestContextSwitcher() {
  const navigate = useNavigate()
  const program = useGuestStore((s) => s.program)
  const contexts = useGuestStore((s) => s.contexts)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!program) return null

  const switchable = contexts.length > 1

  const onPick = async (participantId: string) => {
    if (participantId === program.participantId) {
      setOpen(false)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await guestAuth.enterContext(participantId)
      setOpen(false)
      navigate(GUEST_HOME_PATH, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '해당 사업으로 들어갈 수 없습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (!switchable) {
    return (
      <div className="rounded-radius-md border border-white/20 bg-white/10 px-3 py-2">
        <p className="truncate text-body font-bold text-white">{program.title}</p>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-2 rounded-radius-md border border-white/20 bg-white/10 px-3 py-2 text-left hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-bold text-white">{program.title}</span>
          <span className="block truncate text-caption text-white/70">
            참여 사업 {contexts.length}건
          </span>
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-white/70" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-radius-md border border-gray-200 bg-white shadow-popover"
        >
          {contexts.map((c) => {
            const current = c.participantId === program.participantId
            return (
              <li key={c.participantId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={current}
                  disabled={busy}
                  onClick={() => void onPick(c.participantId)}
                  className={`flex min-h-12 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-60 ${
                    current ? 'bg-brand/5' : ''
                  }`}
                >
                  <span className="truncate text-body font-medium text-gray-900">{c.title}</span>
                  <span className="truncate text-caption text-gray-500">
                    {[c.code, endLabel(c.accessEndsAt)].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            )
          })}
          {error && <li className="px-3 py-2 text-caption text-danger">{error}</li>}
        </ul>
      )}
    </div>
  )
}
