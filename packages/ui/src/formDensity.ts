import type { Density } from './density'

/**
 * 폼 컨트롤(Input·Select·TextArea)의 밀도별 치수.
 *
 * 버튼과 **같은 높이 토큰**을 쓴다 — 필터 툴바처럼 입력과 버튼이 한 줄에 서는 자리가 많아,
 * 둘의 높이가 어긋나면 줄 전체가 들쭉날쭉해진다. 실제로 입력 44px / 버튼 40px로 갈려 있던 것이
 * 목록 화면 툴바가 정돈되지 않아 보이던 원인이었다.
 * 근거: 5_component_spec_rules.md §1.2 / §2.2
 */
export const formHeightClass: Record<Density, string> = {
  page: 'h-ctl-page text-body',
  card: 'h-ctl-card text-body-sm',
  table: 'h-ctl-table text-caption',
}

/** 좌우 여백 — 높이가 줄면 여백도 함께 줄어야 글자가 상자에 눌리지 않는다. */
export const formPadClass: Record<Density, string> = {
  page: 'px-3.5',
  card: 'px-3',
  table: 'px-2',
}

/** 아이콘/화살표 슬롯이 있는 경우의 좌우 여백(아이콘 쪽만 넓힌다). */
export const formPadWithIcon: Record<Density, { left: string; right: string }> = {
  page: { left: 'pl-10 pr-3.5', right: 'pl-3.5 pr-10' },
  card: { left: 'pl-9 pr-3', right: 'pl-3 pr-9' },
  table: { left: 'pl-7 pr-2', right: 'pl-2 pr-7' },
}

/** 4상태(기본·호버·포커스·비활성) 공통 외형. 밀도와 무관하게 동일하다. */
export const formBaseClass =
  'w-full rounded-radius-md border bg-white border-gray-300 text-gray-900 shadow-soft transition-all duration-fast ' +
  'placeholder:text-gray-400 hover:border-gray-400 ' +
  'focus-visible:outline-none focus-visible:border-brand/50 focus-visible:shadow-popover ' +
  'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none'

/** 오류 상태 덮어쓰기. */
export const formInvalidClass =
  'border-danger-700 bg-danger-subtle hover:border-danger-700 focus-visible:border-danger-700 focus-visible:shadow-popover'
