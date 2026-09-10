import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { cardText, panelRowBox } from '../densityScale'
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
 * **체크박스 모양이다**(2026-09-10 사용자 지정). 원이었던 동안 담당자는 이 표식을 라디오로
 * 읽어 한 줄만 고를 수 있는 목록으로 알았다 — 실제로는 셋 다 여럿을 담는 목록인데, 모양이
 * 그 사실을 부정하고 있었다. 앱의 다른 자리에서 '여럿 고르기'를 말하는 것은 언제나 네모
 * 체크박스(표의 행 선택)라, 여기만 원이면 규격이 아니라 예외가 된다.
 *
 * 진짜 `<input type="checkbox">`를 두지 않는 이유는 줄 전체가 이미 버튼이기 때문이다
 * (`PickRow`) — 버튼 안의 입력 컨트롤은 클릭 주인이 둘이 되어, 같은 줄을 눌러도 어디를
 * 눌렀느냐에 따라 다르게 동작하는 순간이 생긴다. 규격(크기·모서리·브랜드 면)은 `Checkbox`와
 * 같은 값을 쓴다.
 *
 * 꺼진 상태에서도 상자가 서는 것이 요점이다. 담긴 줄에만 표식을 그리면 담을 수 있다는 사실이
 * 눌러 보기 전에는 드러나지 않는다.
 */
export function PickMark({ checked, children }: PickMarkProps) {
  return (
    <span
      className={cn(
        // 모서리는 `Checkbox`와 같은 `rounded`다(§2.3) — 라디오의 원형과 카드의 radius-lg 사이
        // 어느 토큰도 이 크기에 맞지 않아 체크박스만 이 값을 쓴다.
        'grid size-4 shrink-0 place-items-center rounded border',
        checked ? 'border-brand bg-brand text-white' : 'border-gray-300 text-transparent',
      )}
    >
      {children}
    </span>
  )
}

export interface PickLineProps {
  /** 식별값(이름·기업명). 이 목록이 무엇을 고르는지를 답하는 값이다. */
  name: ReactNode
}

/**
 * 고르는 목록 한 줄의 **글자 부분** — 이름 하나가 선다.
 *
 * 이름 아래 회색 한 줄(이메일·소속)을 함께 깔던 자리다(2026-09-10 사용자 지정으로 걷음).
 * **왼쪽 기둥에서 하는 일은 이름으로 찾아 고르는 것**이고, 그 대상이 맞는지 확인하는 일은
 * 오른쪽 기둥의 표가 한다 — 아직 고르지도 않은 수십 줄이 저마다 연락처를 들고 서면, 정작
 * 찾는 이름이 그 사이에 묻히고 한 화면에 보이는 후보가 절반이 된다.
 *
 * 그래서 이 부품이 소유하는 것은 **한 줄짜리 이름의 규격 하나**다. 소유자를 두기 전에는 세
 * 창이 저마다 `text-body text-gray-900` + `font-medium`을 손으로 적고 있었고, 한 곳만 고치는
 * 날 같은 목록이 창마다 다른 굵기로 섰다.
 */
export function PickLine({ name }: PickLineProps) {
  return (
    <span
      className={cn('min-w-0 flex-1 truncate', cardText.value, 'font-medium')}
      title={typeof name === 'string' ? name : undefined}
    >
      {name}
    </span>
  )
}
