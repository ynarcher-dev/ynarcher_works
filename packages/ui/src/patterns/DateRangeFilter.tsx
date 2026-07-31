import { Input } from '../components/Input'
import { cn } from '../utils/cn'

export interface DateRangeFilterProps {
  /** 시작(부터) 값 — `YYYY-MM-DD`. */
  from: string
  /** 종료(까지) 값 — `YYYY-MM-DD`. */
  to: string
  onChange: (next: { from: string; to: string }) => void
  /** 접근성 라벨 접두어(예: '시작일' → '시작일(부터)'). */
  label: string
}

/**
 * 비어 있는 날짜 칸의 톤. 브라우저가 그리는 `연도-월-일` 안내 글자는 placeholder가 아니라
 * 입력 글자색을 따르므로, 값이 없을 때만 필터 칩과 같은 회색(text-gray-400)으로 맞춘다 —
 * 그렇게 하지 않으면 아직 고르지 않은 칸이 이미 값을 고른 칸처럼 진하게 보인다.
 * 달력 아이콘도 브라우저 기본 검정이라 같은 정도로 눌러 준다(색을 직접 줄 수 없는 의사요소다).
 */
const EMPTY_TONE =
  'text-gray-400 [&::-webkit-calendar-picker-indicator]:opacity-40'
const FILLED_TONE = '[&::-webkit-calendar-picker-indicator]:opacity-60'

/**
 * 목록 툴바의 날짜 범위 필터(부터~까지). 두 입력은 필터 칩과 동일한 높이를 쓴다.
 * 두 칸 사이에 물결(~)을 두지 않는다 — 날짜 칸은 그 자체로 범위임이 드러나고,
 * 같은 줄의 다른 필터에는 없는 기호라 한 줄의 리듬만 끊는다.
 */
export function DateRangeFilter({ from, to, onChange, label }: DateRangeFilterProps) {
  return (
    <>
      <div className="w-40">
        <Input
          type="date"
          aria-label={`${label}(부터)`}
          className={cn(from ? FILLED_TONE : EMPTY_TONE)}
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
        />
      </div>
      <div className="w-40">
        <Input
          type="date"
          aria-label={`${label}(까지)`}
          className={cn(to ? FILLED_TONE : EMPTY_TONE)}
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
        />
      </div>
    </>
  )
}
