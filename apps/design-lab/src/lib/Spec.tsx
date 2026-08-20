import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CardShell, DensityProvider, cn } from '@ynarcher/ui'

/**
 * 견본 페이지의 뼈대 요소들.
 *
 * 견본 자체도 프리셋 토큰과 packages/ui 만으로 그린다 — 견본을 그리려고 수제 카드나 원시 값
 * (text-[13px] 등)을 쓰면, "규격을 화면에서 직접 쓰지 않는다"는 규칙을 견본이 먼저 어기게 된다.
 */

export function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string
  title: string
  lede: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-5">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-title-md font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-body text-gray-600">{lede}</p>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}

/**
 * 견본 하나 — 무엇을 보여주는지(제목)와 왜 그런지(근거)를 함께 적는다.
 *
 * 틀은 `CardShell`을 쓰되 내부 밀도는 `page`로 되돌린다. 견본 상자는 '카드'가 아니라 화면을
 * 들여다보는 창이므로, 상자가 내려주는 카드 밀도(32px)를 그대로 두면 페이지 툴바 견본이
 * 실제 화면보다 작게 보인다. 카드·표 밀도를 보여야 하는 견본은 안에서 다시 감싼다.
 */
export function Spec({
  label,
  note,
  className,
  children,
}: {
  label: string
  note?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-body font-semibold text-gray-900">{label}</h3>
        {note && <p className="text-body text-gray-500">{note}</p>}
      </div>
      <CardShell className={className}>
        <DensityProvider value="page">{children}</DensityProvider>
      </CardShell>
    </div>
  )
}

/** 견본 안에서 각 예시에 붙이는 꼬리표(맥락명·토큰명). */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-radius-sm bg-gray-100 px-1.5 py-0.5 font-numeric text-caption text-gray-600">
      {children}
    </span>
  )
}

/** 값 하나짜리 색 견본 칩. */
export function Swatch({
  name,
  hex,
  onDark = false,
}: {
  name: string
  hex: string
  onDark?: boolean
}) {
  return (
    <div className="min-w-0">
      <div
        className="h-12 rounded-radius-md border border-gray-300"
        style={{ backgroundColor: hex }}
      >
        <span
          className={cn(
            'block px-2 pt-1 font-numeric text-caption',
            onDark ? 'text-gray-0/80' : 'text-gray-700/80',
          )}
        >
          Aa
        </span>
      </div>
      <p className="mt-1 truncate text-caption text-gray-700">{name}</p>
      <p className="truncate font-numeric text-caption uppercase text-gray-400">{hex}</p>
    </div>
  )
}



/**
 * 실제로 렌더된 색을 읽어 보여주는 견본 칩.
 *
 * 램프를 hex 상수로 적어 두면 견본이 거짓말을 한다 — 브랜드 전환기나 표면 오버라이드가 값을
 * 바꿔도 칩은 옛 색을 계속 그린다(실제로 `1. 기초`가 인디고로 바뀐 뒤에도 딥네이비를 보여줬다).
 * 그래서 Tailwind 클래스로 칠한 뒤 그 요소의 계산된 색을 되읽어 라벨에 적는다. 화면에 보이는
 * 색과 적힌 값이 같은 곳에서 나오므로 어긋날 수가 없다.
 *
 * 값이 런타임에 바뀌지 않게 된 뒤에도 이 방식을 유지한다 — 프리셋을 고치는 순간 견본이 자동으로
 * 따라오고, 상수를 같이 고치는 것을 잊어 견본이 거짓말을 하는 일이 생기지 않는다.
 */
export function LiveSwatch({
  name,
  className,
}: {
  name: string
  className: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hex, setHex] = useState('')

  useEffect(() => {
    if (!ref.current) return
    const rgb = getComputedStyle(ref.current).backgroundColor
    const m = rgb.match(/\d+/g)
    setHex(
      m && m.length >= 3
        ? '#' +
            m
              .slice(0, 3)
              .map((v) => Number(v).toString(16).padStart(2, '0'))
              .join('')
              .toUpperCase()
        : rgb,
    )
  }, [className])

  return (
    <div className="min-w-0">
      <div ref={ref} className={cn('h-12 rounded-radius-md border border-gray-300', className)} />
      <p className="mt-1 truncate text-caption text-gray-700">{name}</p>
      <p className="truncate font-numeric text-caption text-gray-500">{hex || '—'}</p>
    </div>
  )
}




