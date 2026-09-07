import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { useDensity, type Density } from '../density'
import { iconScale } from '../densityScale'

/**
 * 액션 글리프 크기 — `iconScale[d].glyph`(px)와 같은 값을 클래스로 적은 것이다.
 * 바깥에서 받은 노드에 크기를 씌우려면 숫자가 아니라 클래스여야 한다(짝: 18/16/14).
 */
const glyphSize: Record<Density, string> = {
  page: '[&_svg]:size-[18px]',
  card: '[&_svg]:size-4',
  table: '[&_svg]:size-[14px]',
}

export interface ControlActionProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {
  /** 글리프 노드. 크기는 이 컴포넌트가 씌우므로 노드에 크기를 달지 않는다. */
  icon: ReactNode
  /** 스크린리더 라벨 겸 툴팁. 아이콘만 있는 조작이라 이 문구가 유일한 이름이다. */
  label: string
  /** 이 조작이 연 것이 지금 열려 있는가(펼친 목록·모달). 참이면 브랜드 색으로 남는다. */
  active?: boolean
  /**
   * 자리 잡기용 클래스만 받는다(`ml-auto` · `absolute top-1/2 …`).
   *
   * 규격(크기·색·호버·초점 링)은 넘기지 않는다 — 그것을 호출부가 정할 수 있으면 이 컴포넌트가
   * 있을 이유가 없다. 자리는 규격이 아니라 놓이는 맥락이라(flex 자식이냐 절대배치냐) 여기서
   * 정할 수 없는 유일한 축이다.
   */
  placement?: string
  /** 밀도 맥락 강제 지정. 생략하면 부모가 내려준 맥락을 따른다. */
  density?: Density
}

/**
 * 입력 칸 **안쪽 끝에 서는 조작 하나** — 그 칸의 값을 다른 데서 찾아오는 돋보기가 대표적이다.
 *
 * 이 컴포넌트가 있는 이유는 **디자인은 하나이고 액션은 여럿**이기 때문이다. 기업명의 돋보기는
 * 스타트업 원장을 열고 분야의 돋보기는 태그 전체 목록을 여는데, 나란히 선 두 칸에서 같은
 * 자리의 같은 글리프가 다른 크기·다른 색이면 폼이 한 벌로 읽히지 않는다.
 *
 * 종전에는 두 곳(`Input`의 액션 슬롯 · `TokenMultiSelect`의 돋보기)이 같은 값을 **각자
 * 적고 있었고**, 실제로 한쪽만 고쳐져 상자 크기·세로 정렬·글리프 크기가 어긋났다. 값을 맞추는
 * 것으로는 다음에 또 갈리므로 버튼 자체를 하나로 두고 액션만 주입받는다.
 *
 * 칸 밖에 별도 버튼을 세우지 않는 것도 같은 판단이다 — 밖에 세운 정사각 버튼은 테두리를 하나
 * 더 그어 그 칸만 둘로 갈라 보이게 한다.
 */
export function ControlAction({
  icon,
  label,
  active = false,
  placement,
  density,
  ...props
}: ControlActionProps) {
  const d = useDensity(density)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-radius-md transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        'disabled:cursor-not-allowed disabled:opacity-60',
        iconScale[d].box,
        glyphSize[d],
        active ? 'text-brand' : 'text-gray-400 hover:text-gray-700',
        placement,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
