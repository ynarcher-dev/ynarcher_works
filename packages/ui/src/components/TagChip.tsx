import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { tagScale } from '../densityScale'

export interface TagChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 선택 상태. 켜지면 브랜드 톤으로 채운다. */
  selected?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 선택 가능한 태그 칩(산업·분야 다중 선택 등).
 *
 * 모양은 `Badge`와 같되 `<button>`이라 누를 수 있다. 화면마다 `<span>`/`<button>`에
 * `rounded + px + py`를 손으로 조합해 만들던 선택 칩을 흡수한다 — 그렇게 만든 칩은
 * 밀도 맥락을 따르지 않아 옆에 놓인 `Badge`와 높이가 어긋났다.
 */
export function TagChip({
  selected = false,
  density,
  className,
  type = 'button',
  ...props
}: TagChipProps) {
  const s = tagScale[useDensity(density)]
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-radius-sm border font-medium leading-none transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-40',
        s.height,
        s.text,
        s.padX,
        selected
          ? 'border-brand bg-brand/10 text-brand'
          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:hover:bg-white',
        className,
      )}
      {...props}
    />
  )
}
