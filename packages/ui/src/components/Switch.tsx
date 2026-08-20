import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { switchScale } from '../densityScale'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable의 맥락을 따른다. */
  density?: Density
}

/** 토글 스위치(썸 이동 duration-fast). 근거: 6_motion_transition_rules.md §2 */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
  density,
}: SwitchProps) {
  const s = switchScale[useDensity(density)]
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-all duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        s.track,
        checked ? 'bg-brand' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          // 손잡이의 그림자만 남긴다. 트랙은 쉬고 있는 면이라 안쪽 그림자를 걷었지만, 손잡이는
          // 그 면 **위에 얹혀 좌우로 움직이는** 부분이다 — 떠 있음이 곧 "집어서 옮길 수 있다"는
          // 뜻이라 그림자가 장식이 아니라 조작 가능함의 표시가 된다. popover/dialog 토큰은 패널용
          // 크기라 8px짜리 손잡이에는 쓸 수 없어, 이 한 곳만 Tailwind 기본값을 남긴다.
          'inline-block translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-standard',
          s.thumb,
          checked && s.travel,
        )}
      />
    </button>
  )
}
