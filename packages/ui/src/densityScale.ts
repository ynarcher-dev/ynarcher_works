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
  page: { height: 'h-ctl-page', text: 'text-body', padX: 'px-3.5', gap: 'gap-1.5' },
  card: { height: 'h-ctl-card', text: 'text-body-sm', padX: 'px-3', gap: 'gap-1.5' },
  table: { height: 'h-ctl-table', text: 'text-caption', padX: 'px-2.5', gap: 'gap-1' },
}

/**
 * 컨트롤 안에 아이콘 슬롯이 있는 경우의 좌우 여백.
 * `leading`은 아이콘이 왼쪽(검색 입력), `trailing`은 오른쪽(셀렉트 화살표).
 */
export const controlIconPad: Record<Density, { leading: string; trailing: string; offset: string }> = {
  page: { leading: 'pl-10 pr-3.5', trailing: 'pl-3.5 pr-10', offset: '3.5' },
  card: { leading: 'pl-9 pr-3', trailing: 'pl-3 pr-9', offset: '3' },
  table: { leading: 'pl-7 pr-2.5', trailing: 'pl-2.5 pr-7', offset: '2' },
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
  page: 'px-3.5 py-2.5 text-body',
  card: 'px-3 py-2 text-body-sm',
  table: 'px-2.5 py-1.5 text-caption',
}

/** 체크박스·라디오·스위치 등 고정 비율 선택 컨트롤. */
export const toggleScale: Record<Density, { box: string; text: string; gap: string }> = {
  page: { box: 'size-5', text: 'text-body', gap: 'gap-2' },
  card: { box: 'size-4', text: 'text-body-sm', gap: 'gap-2' },
  table: { box: 'size-3.5', text: 'text-caption', gap: 'gap-1.5' },
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
