import type { QuickMemoColor } from './quickMemoStore'

/**
 * 메모 색상 팔레트 — 스와치(편집기의 선택 버튼)와 표면(타일·편집기 바탕)이 한 쌍이다.
 * 팔레트가 화면 밖 한곳에 있는 이유는 타일과 편집기가 **같은 색을 같은 이름으로** 불러야 하기
 * 때문이다. 포스트잇 계열의 옅은 색은 무채색 표면 규격의 예외라, 이 파일 밖에서 만들지 않는다.
 */
export const MEMO_COLORS: { value: QuickMemoColor; label: string; swatch: string; surface: string }[] = [
  { value: 'cream', label: '크림', swatch: 'bg-[#F7E8B6]', surface: 'bg-[#FFF9E8]' },
  { value: 'rose', label: '로즈', swatch: 'bg-[#F2C6CC]', surface: 'bg-[#FFF1F3]' },
  { value: 'blue', label: '스카이', swatch: 'bg-[#BDDDF2]', surface: 'bg-[#EFF8FD]' },
  { value: 'mint', label: '민트', swatch: 'bg-[#BFE3D0]', surface: 'bg-[#EFFAF4]' },
  { value: 'lavender', label: '라벤더', swatch: 'bg-[#D8CCEE]', surface: 'bg-[#F7F2FD]' },
]

export function memoSurface(color: QuickMemoColor | undefined) {
  return MEMO_COLORS.find((option) => option.value === (color ?? 'cream'))?.surface
}
