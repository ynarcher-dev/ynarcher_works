/**
 * 목록 필터 축(다중선택) 공용 규약.
 *
 * 현황 카드의 타일은 곧 그 축의 필터다. 이미 걸린 값을 다시 누르면 빼고, 아니면 더한다 —
 * 필터 팝오버의 다중선택과 같은 규약이라 어느 쪽으로 걸었든 결과가 같아야 한다.
 * 화면마다 세 줄짜리 토글을 다시 쓰면 한 곳만 '단일 선택'으로 어긋나도 알아채기 어렵다.
 */
export function toggleAxisValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}
