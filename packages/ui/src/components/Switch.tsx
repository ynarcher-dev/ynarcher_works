import { cn } from '../utils/cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

/** 토글 스위치(썸 이동 duration-fast). 근거: 6_motion_transition_rules.md §2 */
export function Switch({
  checked,
  onChange,
  disabled,
  id,
  'aria-label': ariaLabel,
}: SwitchProps) {
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
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-brand' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 translate-x-0.5 rounded-full bg-white transition-transform duration-fast ease-standard',
          checked && 'translate-x-[18px]',
        )}
      />
    </button>
  )
}
