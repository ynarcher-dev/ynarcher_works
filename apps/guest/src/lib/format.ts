/**
 * 일시 표기. 두 대시보드가 각자 같은 함수를 들고 있던 것을 한곳으로 모은다 —
 * 화면이 늘어날 때마다 복제되면 "일정 미정"의 문구가 화면마다 갈린다.
 */
export function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ko-KR') : '일정 미정'
}
