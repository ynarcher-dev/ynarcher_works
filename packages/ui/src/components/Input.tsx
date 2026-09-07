import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import {
  controlIconPad,
  controlScale,
  formBaseClass,
  formInvalidClass,
} from '../densityScale'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  icon?: ReactNode
  /**
   * 칸 **안쪽 오른쪽 끝**에 서는 조작 하나 — 그 칸의 값을 다른 데서 찾아오는 돋보기가
   * 대표적이다(기업명을 스타트업 원장에서 고르기).
   *
   * 칸 밖에 별도 버튼으로 두지 않는 이유는 `TokenMultiSelect`가 이미 같은 일을 칸 안에서
   * 하고 있어서다(분야·전문영역의 돋보기). 나란히 선 두 칸이 같은 일을 다른 모양으로 하면
   * 폼이 한 벌로 읽히지 않고, 밖에 세운 정사각 버튼은 테두리 하나를 더 그어 그 칸만 둘로
   * 갈라 보인다. 규격을 화면이 흉내 내면 결국 갈리므로 여기서 소유한다.
   *
   * 아이콘 노드만 준다 — 버튼 껍데기(크기·색·호버·초점 링)는 이 컴포넌트가 씌운다.
   * 왼쪽 `icon`과 함께 쓸 수 있고, 그때 양쪽 여백이 각각 붙는다.
   */
  action?: ReactNode
  /** `action`의 스크린리더 라벨 겸 툴팁. 지정하지 않으면 접근성 이름이 없는 버튼이 된다. */
  actionLabel?: string
  onActionClick?: () => void
  /** 밀도 맥락 강제 지정. 생략하면 부모 Card·DataTable이 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 수치 입력의 네이티브 증감 화살표를 지운다.
 *
 * 크롬은 이 화살표를 평소 `opacity:0`으로 감추지만 **폭은 계속 차지한다**(약 13px). 그래서 좁은
 * 수치 칸(투입률·협업비율 등 `w-16`)에서는 보이지 않는 위젯이 글자 자리를 빼앗아 `80`이
 * `8`처럼 잘려 보였다. 화살표 자체도 32px 컨트롤 안에서는 누를 수 없을 만큼 작아 실질적인 입력
 * 수단이 아니다 — 값은 키보드로 적고 범위는 `min`/`max`가 지킨다.
 */
const numberSpinnerReset =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none ' +
  '[&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none'

/** 텍스트 입력(기본/포커스/비활성/오류 4상태, 좌측 아이콘·우측 액션 슬롯 지원). ref는 input으로 forward. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, icon, action, actionLabel, onActionClick, density, className, ...props },
  ref,
) {
  const d = useDensity(density)
  const s = controlScale[d]
  const pad = controlIconPad[d]
  // 좌우 어느 쪽에 무엇이 붙느냐로 안쪽 여백이 갈린다. 둘 다 붙으면 양쪽 여백을 함께 준다.
  const padding =
    icon && action
      ? `${pad.leading.split(' ')[0]} ${pad.trailing.split(' ')[1]}`
      : icon
        ? pad.leading
        : action
          ? pad.trailing
          : s.padX
  return (
    <div className="relative flex w-full items-center">
      {icon && (
        <span className={cn('absolute shrink-0 text-gray-400', pad.iconLeft)}>{icon}</span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid}
        className={cn(
          formBaseClass,
          s.height,
          s.text,
          padding,
          props.type === 'number' && numberSpinnerReset,
          invalid && formInvalidClass,
          className,
        )}
        {...props}
      />
      {action && (
        // 색·호버·초점 링은 `TokenMultiSelect`의 돋보기와 같은 값이다 — 두 칸이 나란히 설 때
        // 같은 조작이 같은 무게로 읽혀야 한다. 위치는 아이콘 자리(iconRight)를 그대로 쓴다.
        <button
          type="button"
          onClick={onActionClick}
          aria-label={actionLabel}
          title={actionLabel}
          disabled={props.disabled}
          className={cn(
            'absolute grid shrink-0 place-items-center rounded-radius-md transition-colors duration-fast',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
            'text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60',
            pad.iconRight,
          )}
        >
          {action}
        </button>
      )}
    </div>
  )
})
