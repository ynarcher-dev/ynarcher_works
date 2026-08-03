import { EmptyState } from '@ynarcher/ui'
import dayjs from 'dayjs'
import {
  EDIT_FIELD_LABELS,
  PLACE_LABELS,
  statusOf,
  timeText,
  type AttendanceEdit,
  type AttendancePlace,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  edits: AttendanceEdit[]
  statuses: AttendanceStatus[]
}

/** 저장된 원시값을 사람이 읽는 말로. 상태 코드는 원장 라벨, 시각은 HH:mm으로 편다. */
function readable(edit: AttendanceEdit, raw: string | null, statuses: AttendanceStatus[]): string {
  if (!raw) return '없음'
  if (edit.field === 'status') return statusOf(statuses, raw)?.label ?? raw
  if (edit.field === 'work_place') return PLACE_LABELS[raw as AttendancePlace] ?? raw
  if (edit.field === 'check_in_at' || edit.field === 'check_out_at') return timeText(raw) ?? raw
  return raw
}

/**
 * 근태 정정 이력 — 무엇이 무엇으로, 누가, 왜 바꿨는지 한 줄씩.
 * 추가만 되는 기록이라 수정·삭제 버튼을 두지 않는다.
 */
export function AttendanceEditHistory({ edits, statuses }: Props) {
  if (!edits.length) {
    return <EmptyState title="정정 이력이 없습니다." />
  }
  return (
    <ul className="space-y-2">
      {edits.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-caption">
          <span className="tabular-nums text-gray-500">
            {dayjs(e.editedAt).format('YYYY-MM-DD HH:mm')}
          </span>
          <span className="font-medium text-gray-700">{e.editedByName ?? '알 수 없음'}</span>
          <span className="text-gray-500">{EDIT_FIELD_LABELS[e.field]}</span>
          <span className="text-gray-900">
            {readable(e, e.beforeValue, statuses)} → {readable(e, e.afterValue, statuses)}
          </span>
          <span className="text-gray-600">&ldquo;{e.reason}&rdquo;</span>
        </li>
      ))}
    </ul>
  )
}
