/**
 * 일시 표기. 두 대시보드가 각자 같은 함수를 들고 있던 것을 한곳으로 모은다 —
 * 화면이 늘어날 때마다 복제되면 "일정 미정"의 문구가 화면마다 갈린다.
 */
export function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ko-KR') : '일정 미정'
}

/** 날짜만(시각이 의미 없는 자리 — 글 작성일·파일 등록일). */
export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('ko-KR') : '-'
}

/** 파일 크기 한 줄. 소수 한 자리까지만 — 게스트가 받을지 말지 정하는 데 그 이상은 필요 없다. */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)}${units[unit]}`
}
