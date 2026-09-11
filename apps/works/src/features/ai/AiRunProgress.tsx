import { cardText, cn } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { AI_FILL_LIMITS } from '@/features/ai/aiFillClient'

/**
 * 실행 중 안내 — **지난 시간과 최대 시간**을 한 줄에 세운다.
 *
 * 종전의 스피너는 "돌고 있다"만 말했고, "얼마나 걸리는가"는 그 아래 한 줄 회색 글씨였다
 * (2026-09-11 사용자 지적 — "최대 몇 분까지 걸린다가 눈에 안 보인다"). 담당자가 기다리며
 * 실제로 묻는 것은 *지금 몇 초째이고 최대 얼마까지 기다리면 되는가*라, 그 둘을 같은 크기로
 * 나란히 세운다(`1:07 / 최대 2:05`). 막대는 그 비율이다.
 *
 * **진척이 아니라 시간이다.** 서버는 한 번의 응답이라 "몇 장째"를 알 길이 없고, 없는 단계를
 * 지어내지 않는다. 막대가 채우는 것은 카드가 아니라 상한까지의 시간이며, 문구가 그것을 말한다.
 *
 * 상한을 넘기면 막대를 멈추고 문구를 바꾼다 — 서버가 그 시각에 그때까지의 결과를 돌려주므로
 * 남은 것은 응답이 도착하는 몇 초뿐이다. 계속 채우면 "끝났어야 하는데 안 끝났다"로 읽힌다.
 */
export function AiRunProgress({
  startedAt,
  sources,
  cards,
}: {
  /** `Date.now()` 기준 실행 시작 시각. */
  startedAt: number
  sources: number
  cards: number
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  const max = AI_FILL_LIMITS.maxRunMs
  const elapsed = Math.max(0, now - startedAt)
  const over = elapsed >= max
  const ratio = Math.min(1, elapsed / max)
  const [lo, hi] = AI_FILL_LIMITS.typicalRunMs

  return (
    <div className="flex w-72 max-w-full flex-col items-center gap-2">
      <p className={cn(cardText.value, 'tabular-nums')} aria-live="polite">
        {formatClock(elapsed)} <span className="text-gray-500">/ 최대 {formatClock(max)}</span>
      </p>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(elapsed, max)}
        aria-label="지난 시간"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-200', over ? 'bg-gray-400' : 'bg-brand')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className={cn(cardText.value, 'text-center')}>
        읽을 자료 {sources}건에서 {cards}개 카드를 작성하고 있습니다.
      </p>
      <p className={cn(cardText.meta, 'text-center')}>
        {over
          ? '시간이 다 되어 그때까지 작성된 카드를 받고 있습니다.'
          : `보통 ${formatMinutes(lo)}~${formatMinutes(hi)} 걸리고, 최대 시간이 지나면 그때까지 된 카드만 돌아옵니다.`}
      </p>
    </div>
  )
}

/** `m:ss`. 초 단위 카운터라 소수는 세지 않는다. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatMinutes(ms: number): string {
  const m = ms / 60_000
  return Number.isInteger(m) ? `${m}분` : `${m.toFixed(1)}분`
}
