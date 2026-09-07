import type { ComponentType, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { sidePanelNavRow } from '../densityScale'

/**
 * 아이콘 컴포넌트. `lucide-react`의 `LucideIcon`이 그대로 들어오지만 **타입만 구조로 받는다** —
 * `packages/ui`는 순수 UI 레이어라 아이콘 라이브러리에 의존하지 않는다(`SidebarItem`이 노드를
 * 받는 것과 같은 이유).
 *
 * 노드(`ReactNode`)가 아니라 **컴포넌트**로 받는 것이 요점이다. 노드로 받으면 크기·굵기를
 * 화면이 적게 되어(`<Inbox size={14} strokeWidth={1.8} />`) 규격이 다시 화면으로 흩어진다.
 * 컴포넌트로 받으면 무엇을 그릴지는 화면이, 어떻게 그릴지는 이 부품이 답한다.
 */
export type SidePanelNavIcon = ComponentType<{
  size?: number
  strokeWidth?: number
  'aria-hidden'?: boolean
}>

/** 아이콘 글리프 규격 — 표 밀도(`iconScale.table`)와 같은 값이다. */
const GLYPH = 14
const GLYPH_STROKE = 1.8

export interface SidePanelNavProps {
  children: ReactNode
  /**
   * 예외 폭. 기본은 조회용 240px(`w-60`)이며, 한 줄에 이름 말고 다른 것이 함께 서는 패널만
   * 넓힌다(조직 편집 트리는 이름·레벨·액션이 같은 줄에 있어 `w-[30rem]`을 쓴다).
   * 색·경계·여백을 화면이 마음대로 바꾸라는 뜻이 아니다.
   */
  className?: string
}

/**
 * 본문 좌패널(2차 내비게이션)의 껍데기.
 *
 * 앱 사이드바(`Sidebar`)가 워크스페이스를 고르는 자리라면, 이 패널은 **그 안에서 목록을 좁히는**
 * 자리다. 전자결재 문서함이 원형이고 게시판·자료실·조직 트리가 같은 문법을 쓴다 — 화면마다
 * 좌패널이 다른 폭·다른 행 리듬으로 서면 같은 자리를 화면 수만큼 다시 익혀야 한다.
 *
 * 종전에는 네 화면이 `w-60 shrink-0 border-r border-gray-200 pr-3`을 각자 적고 행 규격까지
 * 복제해, 폭 하나를 바꾸려면 네 파일을 고쳐야 했고 한 곳을 빠뜨리면 두 화면이 조용히 어긋났다.
 */
export function SidePanelNav({ children, className }: SidePanelNavProps) {
  return <aside className={cn('w-60 shrink-0 border-r border-gray-200 pr-3', className)}>{children}</aside>
}

export interface SidePanelNavGroupProps {
  /** 그룹 이름. 무엇을 고르는 목록인지 답한다. */
  label: ReactNode
  /**
   * 라벨 오른쪽 액션(전체 펼치기·항목 추가 등). 그룹 **전체**에 걸리는 조작만 둔다 —
   * 행 하나에 걸리는 조작은 그 행이 갖는다.
   */
  action?: ReactNode
  children?: ReactNode
}

/** 좌패널의 한 묶음 — 라벨 한 줄과 그 아래 행들. */
export function SidePanelNavGroup({ label, action, children }: SidePanelNavGroupProps) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 flex items-center justify-between pl-1">
        <span className="text-caption font-semibold text-gray-500">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

export interface SidePanelNavRowProps {
  label: string
  icon?: SidePanelNavIcon
  selected: boolean
  onClick: () => void
  /** 건수. 생략하면 건수 열 자체가 서지 않는다. */
  count?: number
  /**
   * 건수 표기 방식. `pending`은 지금 손이 가야 할 건수라 `[3]` 말머리에 붉은색으로 눈에 걸리게
   * 두고, `plain`은 보관 범위를 세는 숫자라 그냥 적는다 — 이쪽은 처리를 재촉하는 신호가 아니라
   * 목록의 크기다.
   */
  countStyle?: 'pending' | 'plain'
}

/** 좌패널의 한 줄 — 아이콘·이름, 그리고 (있으면) 건수. */
export function SidePanelNavRow({
  label,
  icon: Icon,
  selected,
  onClick,
  count,
  countStyle = 'plain',
}: SidePanelNavRowProps) {
  return (
    <button type="button" onClick={onClick} className={sidePanelNavRow.row(selected)}>
      <span className={sidePanelNavRow.icon(selected)}>
        {Icon && <Icon aria-hidden size={GLYPH} strokeWidth={GLYPH_STROKE} />}
      </span>
      <span className={sidePanelNavRow.label(selected)}>{label}</span>
      {/* 건수 표기 규칙(0건 회색·`[3]` 말머리·고정 폭)은 `sidePanelNavRow.count`가 갖는다. */}
      {count !== undefined && (
        <span className={sidePanelNavRow.count(count, countStyle === 'pending')}>
          {countStyle === 'pending' ? `[${count}]` : count}
        </span>
      )}
    </button>
  )
}

/**
 * 좌패널이 통째로 빌 때의 한 줄.
 *
 * 행 규격(왼쪽 정렬 `text-body-sm`)을 쓰지 않고 가운데 캡션으로 물러나는 것은, 그 자리에
 * 왼쪽 정렬 본문이 서면 **누를 수 있는 행처럼 보이기** 때문이다. 빈 상태를 접지 않는다는 원칙은
 * 그대로다 — 문구는 남되 행이 아닌 것으로 보여야 한다.
 */
export function SidePanelNavEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-caption text-gray-500">{children}</p>
}
