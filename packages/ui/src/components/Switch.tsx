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
        'relative inline-flex shrink-0 items-center rounded-full shadow-inner transition-all duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        s.track,
        checked ? 'bg-brand shadow-brand/20' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'inline-block translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-standard',
          s.thumb,
          checked && s.travel,
        )}
      />
    </button>
  )
}
