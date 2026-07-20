import { Input } from '../components/Input'

export interface DateRangeFilterProps {
  /** 시작(부터) 값 — `YYYY-MM-DD`. */
  from: string
  /** 종료(까지) 값 — `YYYY-MM-DD`. */
  to: string
  onChange: (next: { from: string; to: string }) => void
  /** 접근성 라벨 접두어(예: '시작일' → '시작일(부터)'). */
  label: string
}

/** 목록 툴바의 날짜 범위 필터(From ~ To). 두 입력은 필터 칩과 동일한 높이를 쓴다. */
export function DateRangeFilter({ from, to, onChange, label }: DateRangeFilterProps) {
  return (
    <>
      <div className="w-40">
        <Input
          type="date"
          aria-label={`${label}(부터)`}
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
        />
      </div>
      <span className="text-caption text-gray-400">~</span>
      <div className="w-40">
        <Input
          type="date"
          aria-label={`${label}(까지)`}
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
        />
      </div>
    </>
  )
}
