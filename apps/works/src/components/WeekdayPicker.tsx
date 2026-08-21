import { cn } from '@ynarcher/ui'

/** 요일 라벨(0=일 … 6=토). 요일을 숫자로 다루는 화면이 같은 순서·같은 글자를 쓰도록 한곳에 둔다. */
export const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

export interface WeekdayPickerProps {
  /** 선택된 요일(0=일 … 6=토). 항상 오름차순으로 되돌려 준다. */
  value: number[]
  onChange: (next: number[]) => void
  /** 무엇을 고르는 묶음인지 알리는 접근성 라벨(화면에는 보이지 않는다). */
  label: string
  disabled?: boolean
}

/**
 * 요일 다중 선택 — 근무 요일·예약 가능 요일이 함께 쓰는 하나의 규격.
 *
 * 이 컴포넌트가 생기기 전, 같은 컨트롤이 회의실 폼과 근무 기준 폼에 **클래스 문자열까지 똑같이**
 * 복사되어 있었다. 심지어 한쪽 주석이 *"근무 기준 화면의 요일 토글과 같은 규격이다 — 같은
 * 질문에 답하는 컨트롤이 화면마다 다른 크기면 같은 것으로 읽히지 않는다"* 라고 적어 두고 있었다.
 * 그 사실을 주석이 아니라 코드가 붙들게 한 것이 이 파일이다 — 주석은 다음 사람이 한쪽만 고칠 때
 * 아무것도 막지 못한다.
 *
 * 칩(`TagChip`)을 쓰지 않는 이유는 요일이 **고정 폭 일곱 칸**이기 때문이다. 알약이 글자 수만큼
 * 늘어나면 한 주가 가지런한 격자로 보이지 않는다.
 */
export function WeekdayPicker({ value, onChange, label, disabled = false }: WeekdayPickerProps) {
  const toggle = (d: number) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {KO_WEEKDAYS.map((day, d) => {
        const on = value.includes(d)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(d)}
            className={cn(
              'w-10 rounded-radius-md border text-body-sm transition-colors duration-fast',
              'h-ctl-card',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
              'disabled:cursor-not-allowed disabled:opacity-55',
              on
                ? 'border-brand bg-brand/10 font-semibold text-brand'
                : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400',
            )}
          >
            {day}
          </button>
        )
      })}
    </div>
  )
}
