import { useEffect, useRef, useState } from 'react'
import { cn } from '@ynarcher/ui'

/**
 * 실제로 렌더된 색을 읽어 보여주는 견본 칩.
 *
 * 램프를 hex 상수로 적어 두면 견본이 거짓말을 한다 — 값이 바뀌어도 칩은 옛 색을 계속 그리고,
 * 상수를 같이 고치는 것을 잊었다는 사실은 아무도 모른다(브랜드를 딥네이비에서 인디고로 옮겼을
 * 때 실제로 그랬다). 그래서 Tailwind 클래스로 칠한 뒤 그 요소의 계산된 색을 되읽어 라벨에
 * 적는다. 화면에 보이는 색과 적힌 값이 같은 곳에서 나오므로 어긋날 수가 없고,
 * `tailwind-preset.mjs`를 고치는 순간 이 절이 자동으로 따라온다.
 */
export function LiveSwatch({ name, className }: { name: string; className: string }) {
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
