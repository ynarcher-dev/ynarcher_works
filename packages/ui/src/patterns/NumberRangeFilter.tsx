import { Input } from '../components/Input'
import type { Density } from '../density'

export interface NumberRangeFilterProps {
  /** 하한 값(문자열 그대로 보관 — '' = 미적용). */
  min: string
  /** 상한 값('' = 미적용). */
  max: string
  onChange: (next: { min: string; max: string }) => void
  /** 하한 칸이 무엇을 묻는지(예: '최소 잔액'). 단위는 적지 않는다 — 아래 주석 참조. */
  minLabel: string
  /** 상한 칸이 무엇을 묻는지(예: '최대 잔액'). */
  maxLabel: string
  density?: Density
}

/**
 * 목록 툴바의 숫자 범위 필터 두 칸(하한~상한). 날짜 범위와 같은 자리·같은 높이에 서므로
 * 규격은 공용 `Input`에 맡기고 여기서는 두 칸을 잇는 일만 한다.
 * 숫자 칸은 `placeholder`가 그대로 먹으므로 날짜 칸과 달리 라벨을 겹쳐 그릴 필요가 없다.
 *
 * 폭은 날짜 칸(`w-40`)의 절반을 조금 넘는 `w-24`다. 날짜는 `2026-08-01` 열 자를 다 받아야
 * 하지만 이 칸이 받는 것은 라벨 네댓 자와 숫자 몇 자리뿐이라, 같은 폭을 주면 그만큼이 빈자리로
 * 남는다 — 필터 축이 많은 툴바에서는 그 빈자리가 곧 액션을 아랫줄로 미는 폭이다.
 *
 * **단위는 라벨에 적지 않는다.** 단위는 필터 두 칸에 반복될 값이 아니라 그 표에 한 번만 있으면
 * 되는 정보이고, 자리는 이미 표 안 단서 줄(`DataTable`의 `caption`)이 갖고 있다. 열 머리글에서
 * 단위를 뺀 것과 같은 규칙이며, 여기서는 그 몫이 그대로 칸 폭으로 돌아온다.
 *
 * 스피너(증감 화살표)는 지운다 — 크롬은 이 버튼 자리를 늘 비워 두어, 좁은 칸에서는 적어 둔
 * 라벨이 그만큼 잘린다.
 */
const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ' +
  '[&::-webkit-outer-spin-button]:appearance-none'

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
      <div className="w-24">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          className={NO_SPINNER}
          aria-label={minLabel}
          placeholder={minLabel}
          density={density}
          value={min}
          onChange={(e) => onChange({ min: e.target.value, max })}
        />
      </div>
      <div className="w-24">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          className={NO_SPINNER}
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
