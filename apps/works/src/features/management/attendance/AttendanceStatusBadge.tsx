import { Badge, EmptyValue, Tooltip } from '@ynarcher/ui'
import {
  isCorrected,
  statusOf,
  type AttendanceEntry,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  statuses: AttendanceStatus[]
  /** 그 칸에 보일 상태 코드(기록이 없으면 화면이 파생한 값). */
  code: string | null
  /** 자동 판정과의 차이를 표식으로 알리기 위한 원본 칸. 생략하면 표식 없이 배지만 그린다. */
  entry?: AttendanceEntry
}

/**
 * 근태 상태 배지 — 라벨·톤은 코드가 아니라 상태 원장이 정한다.
 *
 * 관리자가 손댄 행에는 `수정됨` 말머리를 붙이고, 자동 판정값은 툴팁으로만 보인다. 두 값을
 * 나란히 적으면 무엇이 지금의 상태인지가 흐려진다 — 확정값이 배지, 원본은 물어봤을 때의 답이다.
 */
export function AttendanceStatusBadge({ statuses, code, entry }: Props) {
  const status = statusOf(statuses, code)
  if (!status) return <EmptyValue />

  const corrected = entry ? isCorrected(entry) : false
  const auto = corrected ? statusOf(statuses, entry?.autoStatusCode ?? null) : null

  const badge = <Badge tone={status.tone}>{status.label}</Badge>
  if (!corrected || !auto) return badge

  return (
    <span className="inline-flex items-center gap-1">
      {badge}
      <Tooltip content={`자동 판정: ${auto.label}`}>
        <span className="cursor-help text-caption text-gray-500">수정됨</span>
      </Tooltip>
    </span>
  )
}
