import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 프로젝트 글자 크기 토큰 — `tailwind-preset.mjs`의 `fontSize` 키와 1:1로 대응한다.
 *
 * tailwind-merge에 이 목록을 알려주지 않으면 크기가 **조용히 사라진다.** 기본 설정의
 * `text-color` 그룹이 `text-*`를 무엇이든 받는 규칙(isAny)이라, 티셔츠 크기(`sm`·`lg`…)가
 * 아닌 `text-caption`·`text-body`는 크기가 아니라 색으로 분류된다. 그러면 같은 `cn()` 안에
 * 색이 함께 오는 순간 뒤엣것만 남아 크기 토큰이 지워졌다 —
 * `cn('text-caption text-gray-700')` → `text-gray-700`.
 *
 * 그 결과가 화면에서는 "같은 토큰인데 자리마다 크기가 다른" 현상으로 나타났다. 토큰 문자열을
 * 그대로 넘긴 자리(`className={tableText.meta}`)는 12px로 살아남고, `cn()`을 거친 자리
 * (DataTable의 모든 셀·머리글)는 크기를 잃고 body(14px)를 상속했다. 한 표 안에서 제목·공개범위는
 * 14px, 작성자는 12px로 갈리던 이유가 이것이다.
 *
 * 목록을 늘릴 일이 생기면 `tailwind-preset.mjs`의 `fontSize`와 **함께** 고친다 — 한쪽만 늘리면
 * 그 토큰만 다시 조용히 사라진다.
 */
const FONT_SIZE_TOKENS = [
  'title-lg',
  'title-md',
  'title-sm',
  'body-lg',
  'body',
  'body-sm',
  'table-card',
  'caption',
  'tag-page',
  'tag-card',
  'tag-table',
] as const

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZE_TOKENS] }],
    },
  },
})

/** 조건부 클래스 병합 유틸(Tailwind 충돌 해소 포함). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
