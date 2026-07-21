import { Badge } from '@ynarcher/ui'
import { useLayoutEffect, useRef, useState } from 'react'

const GAP_PX = 4 // flex gap-1 (0.25rem)

interface OverflowTagsProps {
  tags: string[]
}

/**
 * 고정폭 셀용 태그 목록. 셀 폭을 넘치는 태그는 부분적으로 잘라 노출하지 않고,
 * 넘침이 발생하면 끝에 '+' 배지 하나만 표시한다.
 *
 * 표시 개수는 CSS만으로 결정할 수 없어, 비표시 측정 레이어(모든 태그 + '+')로 각
 * 배지의 실제 폭을 재고 셀 폭에 완전히 들어가는 개수만 표시 레이어에 렌더한다.
 * 컬럼 폭 변화는 ResizeObserver로 감지해 재계산한다.
 */
export function OverflowTags({ tags }: OverflowTagsProps) {
  const measureRef = useRef<HTMLSpanElement>(null)
  const [visibleCount, setVisibleCount] = useState(tags.length)

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return

    const compute = () => {
      const available = el.clientWidth
      const kids = Array.from(el.children) as HTMLElement[]
      if (kids.length === 0) return
      // 마지막 자식은 '+' 측정용, 앞쪽은 태그 측정용.
      const plusW = kids[kids.length - 1]?.offsetWidth ?? 0
      const tagEls = kids.slice(0, -1)

      const widthOf = (n: number) => {
        let w = 0
        for (let i = 0; i < n; i++) w += (tagEls[i]?.offsetWidth ?? 0) + (i > 0 ? GAP_PX : 0)
        return w
      }

      // 넘치기 직전까지 담는다.
      let count = 0
      while (count < tagEls.length && widthOf(count + 1) <= available) count++

      // 일부라도 숨겨진다면 '+' 자리를 확보하고 개수를 재조정한다.
      if (count < tagEls.length) {
        while (count > 0 && widthOf(count) + GAP_PX + plusW > available) count--
      }
      setVisibleCount(count)
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tags.join('')])

  const hidden = visibleCount < tags.length

  return (
    <span className="relative block overflow-hidden">
      {/* 측정 전용 레이어(비표시): 모든 태그 + '+'를 렌더해 폭만 잰다. */}
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 flex flex-nowrap gap-1"
      >
        {tags.map((t, i) => (
          <Badge key={`m-${t}-${i}`} tone="neutral" className="shrink-0">
            {t}
          </Badge>
        ))}
        <Badge tone="neutral" className="shrink-0">
          +
        </Badge>
      </span>

      {/* 표시 레이어: 완전히 들어가는 태그 + (넘치면) '+'. 셀의 text-center는 flex 자식에
          먹지 않으므로 justify-center로 직접 가운데에 모은다. */}
      <span className="flex flex-nowrap justify-center gap-1">
        {tags.slice(0, visibleCount).map((t, i) => (
          <Badge key={`${t}-${i}`} tone="neutral" className="shrink-0">
            {t}
          </Badge>
        ))}
        {hidden && (
          <Badge tone="neutral" className="shrink-0">
            +
          </Badge>
        )}
      </span>
    </span>
  )
}
