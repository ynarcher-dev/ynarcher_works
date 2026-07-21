import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 자식의 실제 렌더 높이를 재서 우측에 px로 표시한다.
 * 규격을 "40이어야 한다"고 문서에 적는 대신 화면에서 곧바로 확인하기 위한 장치다.
 */
export function Measured({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)

  useLayoutEffect(() => {
    const host = ref.current
    const target = host?.firstElementChild
    if (!target) return
    const measure = () => setH(Math.round(target.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(target)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex items-center gap-2">
      <div ref={ref} className="flex items-center">
        {children}
      </div>
      <span className="shrink-0 text-caption tabular-nums text-gray-500">
        {h != null ? `${h}px` : ''}
      </span>
    </div>
  )
}
