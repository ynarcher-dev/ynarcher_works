import { Input } from '../components/Input'
import type { Density } from '../density'

export interface NumberRangeFilterProps {
  /** 하한 값(문자열 그대로 보관 — '' = 미적용). */
  min: string
  /** 상한 값('' = 미적용). */
  max: string
  onChange: (next: { min: string; max: string }) => void
  /** 하한 칸이 무엇을 묻는지(예: '최소 잔액(백만원)'). 단위까지 라벨에 적는다. */
  minLabel: string
  /** 상한 칸이 무엇을 묻는지(예: '최대 잔액(백만원)'). */
  maxLabel: string
  density?: Density
}

/**
 * 목록 툴바의 숫자 범위 필터 두 칸(하한~상한). 날짜 범위와 같은 자리·같은 높이에 서므로
 * 규격은 공용 `Input`에 맡기고 여기서는 두 칸을 잇는 일만 한다.
 * 숫자 칸은 `placeholder`가 그대로 먹으므로 날짜 칸과 달리 라벨을 겹쳐 그릴 필요가 없다.
 */
export function NumberRangeFilter({
  min,
  max,
  onChange,
  minLabel,
  maxLabel,
  density,
}: NumberRangeFilterProps) {
  return (
    <>
      <div className="w-40">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={minLabel}
          placeholder={minLabel}
          density={density}
          value={min}
          onChange={(e) => onChange({ min: e.target.value, max })}
        />
      </div>
      <div className="w-40">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={maxLabel}
          placeholder={maxLabel}
          density={density}
          value={max}
          onChange={(e) => onChange({ min, max: e.target.value })}
        />
      </div>
    </>
  )
}
