import { Input } from '../components/Input'
import { useDensity, type Density } from '../density'
import { controlIconPad, controlScale } from '../densityScale'
import { cn } from '../utils/cn'

export interface DateRangeFilterProps {
  /** 첫 칸 값 — `YYYY-MM-DD`. */
  from: string
  /** 둘째 칸 값 — `YYYY-MM-DD`. */
  to: string
  onChange: (next: { from: string; to: string }) => void
  /** 첫 칸이 무엇을 묻는지. 값이 비었을 때 칸 안에 그대로 적힌다(예: '운영 시작일'). */
  fromLabel: string
  /** 둘째 칸이 무엇을 묻는지(예: '운영 종료일'). */
  toLabel: string
  /** 밀도 맥락 강제 지정. 생략하면 부모가 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 빈 날짜 칸이 스스로 그리는 `연도-월-일`을 지운다.
 * 이 글자는 placeholder가 아니라 입력 글자라 `placeholder` 속성으로는 갈아끼울 수 없다 —
 * 투명하게 눌러 두고 같은 자리에 무엇을 묻는 칸인지를 겹쳐 그린다. 편집 중(포커스)에는
 * 되살려야 사용자가 타이핑한 자리가 보인다.
 * 달력 아이콘도 브라우저 기본 검정이라 값이 없을 때는 같은 정도로 눌러 준다.
 */
const EMPTY_TONE =
  '[&::-webkit-datetime-edit]:text-transparent [&:focus::-webkit-datetime-edit]:text-gray-900 ' +
  '[&::-webkit-calendar-picker-indicator]:opacity-40'
const FILLED_TONE = '[&::-webkit-calendar-picker-indicator]:opacity-60'

interface DateBoxProps {
  value: string
  label: string
  onChange: (next: string) => void
  density?: Density
}

/** 날짜 한 칸. 비어 있으면 라벨을 칸 안에 겹쳐 그리고, 값이 들어오면 물러난다. */
function DateBox({ value, label, onChange, density }: DateBoxProps) {
  const d = useDensity(density)
  return (
    // 글자 크기는 겉 상자가 갖고 겹쳐 그린 라벨은 물려받는다 — 입력과 라벨이 같은 자리에
    // 겹치므로 크기가 한 곳에서만 정해져야 두 글자가 정확히 포개진다.
    <div className={cn('group relative w-40', controlScale[d].text)}>
      <Input
        type="date"
        aria-label={label}
        density={density}
        className={cn(value ? FILLED_TONE : EMPTY_TONE)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {!value && (
        <span
          className={cn(
            // 클릭을 가로채면 라벨을 누른 사용자가 달력을 열 수 없다.
            'pointer-events-none absolute inset-y-0 flex items-center',
            // 비활성 필터 칩과 같은 톤 — 아직 고르지 않은 조건이라는 사실이 같게 읽혀야 한다.
            'text-gray-400 group-focus-within:opacity-0',
            // 아이콘 슬롯의 좌측 여백은 같은 밀도의 컨트롤 좌우 여백과 짝을 이룬다.
            controlIconPad[d].iconLeft,
          )}
        >
          {label}
        </span>
      )}
    </div>
  )
}

/**
 * 목록 툴바의 날짜 범위 필터 두 칸. 두 칸이 같은 컬럼의 부터~까지일 수도 있고
 * (`fromLabel='시작일(부터)'`), 서로 다른 축일 수도 있다(`'운영 시작일'`/`'운영 종료일'`) —
 * 어느 쪽인지는 라벨이 답하므로 칸 사이에 물결(~)을 두지 않는다. 같은 줄의 다른 필터에는
 * 없는 기호라 한 줄의 리듬만 끊는다.
 */
export function DateRangeFilter({
  from,
  to,
  onChange,
  fromLabel,
  toLabel,
  density,
}: DateRangeFilterProps) {
  return (
    <>
      <DateBox
        value={from}
        label={fromLabel}
        density={density}
        onChange={(next) => onChange({ from: next, to })}
      />
      <DateBox
        value={to}
        label={toLabel}
        density={density}
        onChange={(next) => onChange({ from, to: next })}
      />
    </>
  )
}
