import type { Density } from './density'

/**
 * 밀도 스케일 — 모든 컴포넌트 치수의 단일 조절판.
 *
 * 높이·글자·여백·간격을 여기 한 곳에 모은다. 규격을 조정할 일이 생기면 컴포넌트를 돌아다니지
 * 않고 이 파일만 고친다. 값 자체(40px 등)는 `tailwind-preset.mjs`의 토큰이 갖고, 이 파일은
 * "어느 맥락에 어느 토큰을 쓰는가"라는 매핑만 갖는다.
 *
 * 크기를 가르는 축은 중요도가 아니라 놓이는 자리다.
 * - `page`  일반 UI — 페이지 툴바·상세 헤더·독립 폼
 * - `card`  카드섹션 내부
 * - `table` 데이터 테이블 셀 내부
 *
 * 근거: docs/docs_design/5_component_spec_rules.md §1.2
 */

/** 라벨이 있는 가변폭 컨트롤(버튼·입력·선택). 한 줄에 나란히 서므로 높이·글자를 공유한다. */
export const controlScale: Record<Density, { height: string; text: string; padX: string; gap: string }> = {
  page: { height: 'h-ctl-page', text: 'text-body', padX: 'px-4', gap: 'gap-2' },
  card: { height: 'h-ctl-card', text: 'text-body-sm', padX: 'px-3', gap: 'gap-1.5' },
  table: { height: 'h-ctl-table', text: 'text-caption', padX: 'px-2.5', gap: 'gap-1' },
}

/**
 * 컨트롤 안에 아이콘 슬롯이 있는 경우의 좌우 여백.
 * `leading`은 아이콘이 왼쪽(검색 입력), `trailing`은 오른쪽(셀렉트 화살표).
 * `iconLeft`/`iconRight`는 그 슬롯에 놓인 아이콘 자체의 절대 위치로, 위 여백과 짝을 이룬다.
 */
export const controlIconPad: Record<
  Density,
  { leading: string; trailing: string; iconLeft: string; iconRight: string }
> = {
  page: { leading: 'pl-11 pr-4', trailing: 'pl-4 pr-11', iconLeft: 'left-4', iconRight: 'right-4' },
  card: { leading: 'pl-9 pr-3', trailing: 'pl-3 pr-9', iconLeft: 'left-3', iconRight: 'right-3' },
  table: { leading: 'pl-7 pr-2.5', trailing: 'pl-2.5 pr-7', iconLeft: 'left-2.5', iconRight: 'right-2.5' },
}

/** 정사각 아이콘 버튼. 라벨이 없어 같은 맥락의 컨트롤보다 한 단계 작다. */
export const iconScale: Record<Density, { box: string; glyph: number }> = {
  page: { box: 'size-icon-page', glyph: 18 },
  card: { box: 'size-icon-card', glyph: 16 },
  table: { box: 'size-icon-table', glyph: 14 },
}

/** 배지·태그. 표시용(Badge)과 선택용(TagChip)이 같은 값을 공유해야 나란히 놓였을 때 어긋나지 않는다. */
export const tagScale: Record<Density, { height: string; text: string; padX: string; dot: string }> = {
  page: { height: 'h-tag-page', text: 'text-tag-page', padX: 'px-2', dot: 'h-1.5 w-1.5' },
  card: { height: 'h-tag-card', text: 'text-tag-card', padX: 'px-1.5', dot: 'h-1 w-1' },
  table: { height: 'h-tag-table', text: 'text-tag-table', padX: 'px-1.5', dot: 'h-1 w-1' },
}

/** 여러 줄 입력(TextArea) — 높이는 `rows`가 정하므로 글자·여백만 밀도에 반응한다. */
export const textAreaScale: Record<Density, string> = {
  page: 'px-4 py-3 text-body',
  card: 'px-3 py-2 text-body-sm',
  table: 'px-2.5 py-1.5 text-caption',
}

/** 체크박스·라디오 등 정사각 선택 컨트롤. */
export const toggleScale: Record<Density, { box: string; text: string; gap: string }> = {
  page: { box: 'size-5', text: 'text-body', gap: 'gap-2' },
  card: { box: 'size-4', text: 'text-body-sm', gap: 'gap-2' },
  table: { box: 'size-3.5', text: 'text-caption', gap: 'gap-1.5' },
}

/**
 * 스위치 — 트랙과 썸이 함께 움직여야 하므로 별도 표로 둔다.
 * `travel`은 썸의 이동 거리로, 트랙 너비 − 썸 크기 − 좌우 여백(2px)과 일치해야 한다.
 */
export const switchScale: Record<Density, { track: string; thumb: string; travel: string }> = {
  page: { track: 'h-6 w-11', thumb: 'size-5', travel: 'translate-x-[22px]' },
  card: { track: 'h-5 w-9', thumb: 'size-4', travel: 'translate-x-[18px]' },
  table: { track: 'h-4 w-7', thumb: 'size-3', travel: 'translate-x-[14px]' },
}

/** 아바타 — 이니셜 글자가 원 안에서 같은 비율로 보이도록 크기와 글자를 함께 옮긴다. */
export const avatarScale: Record<Density, { box: string; text: string }> = {
  page: { box: 'size-10', text: 'text-body-lg' },
  card: { box: 'size-8', text: 'text-body' },
  table: { box: 'size-6', text: 'text-caption' },
}

/** 탭 — 언더라인 탭의 높이를 같은 맥락의 컨트롤과 맞춘다(가변 py 금지). */
export const tabScale: Record<Density, { height: string; text: string; padX: string }> = {
  page: { height: 'h-ctl-page', text: 'text-body', padX: 'px-4' },
  card: { height: 'h-ctl-card', text: 'text-body-sm', padX: 'px-3' },
  table: { height: 'h-ctl-table', text: 'text-caption', padX: 'px-2.5' },
}

/**
 * 페이지네이션 — 이동 버튼은 아이콘 버튼 격자를 그대로 쓴다.
 * 숫자 버튼(`numBox`)은 같은 높이를 유지하되 세 자리 이상에서 넓어져야 하므로 최소 너비로 잡는다.
 */
export const pagerScale: Record<
  Density,
  { box: string; numBox: string; text: string; glyph: number }
> = {
  page: { box: 'size-icon-page', numBox: 'h-icon-page min-w-icon-page', text: 'text-body-sm', glyph: 16 },
  card: { box: 'size-icon-card', numBox: 'h-icon-card min-w-icon-card', text: 'text-caption', glyph: 14 },
  table: { box: 'size-icon-table', numBox: 'h-icon-table min-w-icon-table', text: 'text-caption', glyph: 12 },
}

/**
 * 데이터 테이블 격자 — 표는 언제나 `table` 맥락이므로 밀도별 분기 없이 단일 값이다.
 * 행 높이 36px는 셀 안 컨트롤(24px) 위아래로 6px씩 남긴다.
 */
export const tableGrid = {
  head: 'h-row',
  row: 'h-row',
  /** 셀 좌우 여백. 셀 안 버튼의 `px-2.5`와 같은 값이라 열이 시각적으로 정렬된다. */
  cellX: 'px-2.5',
  /** 고정 레이아웃(`fixed`)에서 열을 더 좁히기 위한 축소 여백. */
  cellXFixed: 'px-2',
} as const

/** 스피너 — 로딩 자리를 차지하는 크기이므로 아이콘 격자보다 한 단계 작게 잡는다. */
export const spinnerScale: Record<Density, string> = {
  page: 'size-6',
  card: 'size-5',
  table: 'size-4',
}

/** 폼 컨트롤 4상태(기본·호버·포커스·비활성) 공통 외형. 밀도와 무관하다. */
export const formBaseClass =
  'w-full rounded-radius-md border bg-white border-gray-300 text-gray-900 shadow-soft transition-all duration-fast ' +
  'placeholder:text-gray-400 hover:border-gray-400 ' +
  'focus-visible:outline-none focus-visible:border-brand/50 focus-visible:shadow-popover ' +
  'disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:shadow-none'

/** 폼 오류 상태 덮어쓰기. */
export const formInvalidClass =
  'border-danger-700 bg-danger-subtle hover:border-danger-700 focus-visible:border-danger-700 focus-visible:shadow-popover'
