import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { controlScale } from '../densityScale'

export interface SegmentedOption<K extends string = string> {
  key: K
  label: string
}

export interface SegmentedToggleProps<K extends string = string> {
  options: SegmentedOption<K>[]
  value: K
  onChange: (key: K) => void
  /** 무엇을 고르는 묶음인지 알리는 접근성 라벨(화면에는 보이지 않는다). */
  label: string
  disabled?: boolean
  /** 가로를 꽉 채운다 — 위아래로 놓인 요소와 폭을 맞춰야 할 때. */
  block?: boolean
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
  className?: string
}

/**
 * 세그먼트 토글 — 배타 선택지 두셋을 한 덩어리 버튼으로 세운다.
 *
 * `TagChip`을 여러 개 늘어놓는 것과 다르다. 칩은 낱개라 "여러 개를 켤 수도 있겠다"로 읽히지만,
 * 이 컨트롤은 한 테두리 안에 칸을 나눠 담아 **반드시 하나만 켜진다**는 사실을 형태가 말한다.
 * 상태 표시(Badge)와 형태가 겹치지 않는 것도 이유다 — 알약 모양이 나란히 서면 누를 수 있는
 * 것과 읽기만 하는 것이 같은 무게로 보인다.
 *
 * 높이·글자는 같은 맥락의 버튼과 공유한다(`controlScale`). 그래야 한 줄에 나란히 서거나
 * 위아래로 붙었을 때 규격이 어긋나지 않는다.
 */
export function SegmentedToggle<K extends string = string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  block = false,
  density,
  className,
}: SegmentedToggleProps<K>) {
  const s = controlScale[useDensity(density)]

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        // 안쪽 칸이 트랙 위로 떠 있어야 '지금 켜진 칸'이 보이므로 트랙은 회색, 여백은 2px 한 겹.
        'inline-flex items-stretch rounded-radius-md border border-gray-300 bg-gray-100 p-0.5',
        s.height,
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const on = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            className={cn(
              'inline-flex h-full items-center justify-center whitespace-nowrap rounded-radius-sm font-medium transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
              'disabled:cursor-not-allowed disabled:opacity-55',
              s.text,
              s.padX,
              block && 'flex-1',
              on
                ? 'bg-white text-brand shadow-sm'
                : 'text-gray-500 hover:text-gray-800 disabled:hover:text-gray-500',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
