import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { panelRowBox } from '../densityScale'
import { formText } from '../densityScale'

/**
 * 스크롤 높이 — 이 목록이 사는 자리는 전부 검색칸 아래(모달 본문·팝오버)라 값이 하나면 된다.
 *
 * 소유자를 두기 전에는 화면마다 손으로 골라 14·16·18·20·22rem 다섯 값이 살았고, 같은 일을 하는
 * 창을 옮겨 다닐 때마다 한 번에 보이는 줄 수가 달라졌다. 자리가 좁아 줄여야 하는 예외가 생기면
 * 화면이 아니라 여기서 단을 나눈다.
 */
const LIST_MAX_HEIGHT = 'max-h-72'

export interface PickListProps {
  /** 고를 것이 없을 때의 한 줄. 지정하지 않으면 목록 자체를 렌더하지 않는다. */
  empty?: ReactNode
  /** 비었는지 여부는 화면이 답한다 — 검색 중·권한 없음 등 '0건'의 사유가 화면마다 다르다. */
  isEmpty?: boolean
  className?: string
  children?: ReactNode
}

/**
 * 검색해서 하나(또는 여럿)를 고르는 목록 — 모달·팝오버 안에서 후보를 세우는 유일한 규격.
 *
 * 행 사이를 가르는 것은 테두리 상자가 아니라 옅은 가로선이다. 행마다 상자를 두르면 후보가
 * 카드로 읽혀 '고르는 목록'이 아니라 '읽을거리 묶음'이 되고, 상자 사이 간격만큼 한 화면에
 * 보이는 줄이 줄어 검색하고 고르는 일이 느려진다.
 *
 * 소유자가 없던 동안 works에는 이 목록이 일곱 벌 손으로 쓰여 있었고 **행 모양이 두 갈래**
 * (테두리 카드 / 가로선)**, 선택 배경이 두 갈래**(`bg-brand-25` / `bg-brand/10`)**, 높이가 다섯
 * 갈래**였다.
 */
export function PickList({ empty, isEmpty, className, children }: PickListProps) {
  if (isEmpty) {
    // 빈 상태는 접지 않는다 — 다음에 무엇을 해야 하는지(검색어를 바꾼다·직접 입력한다)의 답이다.
    return empty ? <p className={cn('px-3 py-6 text-center', formText.hint)}>{empty}</p> : null
  }
  return (
    <ul className={cn(LIST_MAX_HEIGHT, 'divide-y divide-gray-100 overflow-y-auto', className)}>
      {children}
    </ul>
  )
}

export interface PickRowProps {
  /** 지금 고른 줄인지. 선택 배경은 표의 선택된 행·지표 띠의 켜진 칸과 같은 언어를 쓴다. */
  selected?: boolean
  /** 고를 수 없는 줄(이미 담김·자격 미달). 이유는 줄 안의 글자가 답한다. */
  disabled?: boolean
  onClick?: () => void
  /** 줄 전체를 감싸는 네이티브 안내(왜 못 고르는지). */
  title?: string
  children: ReactNode
}

/**
 * 고르는 목록의 한 줄. 줄 전체가 버튼이다 — 오른쪽 끝의 작은 '선택' 버튼을 겨누게 하지 않는다.
 *
 * 여백은 패널 목록 행과 같은 값(`panelRowBox`)을 쓴다. 같은 창 안에서 검색 결과 줄과 이미
 * 담은 목록 줄이 위아래로 서는 자리가 있어, 둘의 높이가 갈리면 한 창에 두 리듬이 생긴다.
 */
export function PickRow({ selected, disabled, onClick, title, children }: PickRowProps) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 text-left transition-colors duration-fast',
          panelRowBox,
          disabled && 'cursor-not-allowed bg-gray-50',
          !disabled && (selected ? 'bg-brand-25' : 'hover:bg-gray-50'),
        )}
      >
        {children}
      </button>
    </li>
  )
}

export interface PickMarkProps {
  /** 담긴 줄인지. 켜지면 브랜드 면으로 채우고, 꺼져 있으면 빈 원만 남는다. */
  checked: boolean
  /** 원 안에 그릴 표식(체크 아이콘 등). `packages/ui`는 아이콘 라이브러리에 의존하지 않는다. */
  children: ReactNode
}

/**
 * 여럿을 담는 목록에서 줄 왼쪽에 서는 선택 표식.
 *
 * 상자가 아니라 원인 것은 이 자리가 **폼의 체크박스가 아니라 목록의 상태**이기 때문이다 —
 * 값을 입력하는 칸이 아니라 담았는지를 되읽는 표식이라, 같은 화면의 진짜 체크박스와 모양이
 * 같으면 어느 것이 입력이고 어느 것이 결과인지 갈리지 않는다.
 *
 * 꺼진 상태에서도 원이 서는 것이 요점이다. 담긴 줄에만 표식을 그리면 담을 수 있다는 사실이
 * 눌러 보기 전에는 드러나지 않는다.
 */
export function PickMark({ checked, children }: PickMarkProps) {
  return (
    <span
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border',
        checked ? 'border-brand bg-brand text-white' : 'border-gray-300 text-transparent',
      )}
    >
      {children}
    </span>
  )
}
