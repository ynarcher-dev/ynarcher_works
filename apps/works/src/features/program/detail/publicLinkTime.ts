/**
 * 공개 링크 기간 입력(datetime-local)과 저장값(timestamptz ISO) 사이의 변환.
 *
 * 폼 상태에서 떼어 낸 이유는 이 변환이 조용히 틀리는 종류이기 때문이다 — 화면에는 담당자가
 * 넣은 시각이 그대로 보이는데 저장된 값만 몇 시간 어긋나 있으면, 링크가 예정보다 일찍 닫히고
 * 나서야 드러난다. `datetime-local`은 오프셋이 없는 로컬 시각이고 원장은 UTC라 두 표기가
 * 오가는 지점이 반드시 생기며, 그 지점을 한 곳으로 모아 왕복이 보존되는지 검증한다.
 */

/** 'YYYY-MM-DDTHH:mm'(로컬) → ISO. 빈 값·해석 불가는 null(기간 미지정 = 모듈 기간 상속). */
export function localToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** ISO → 'YYYY-MM-DDTHH:mm'(로컬). `datetime-local` 입력이 읽을 수 있는 형태. */
export function isoToLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
