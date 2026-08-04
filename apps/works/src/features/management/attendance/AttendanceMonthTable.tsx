import { Badge, DataTable, EmptyValue, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { AttendanceStatusBadge } from '@/features/management/attendance/AttendanceStatusBadge'
import {
  PLACE_LABELS,
  WEEKDAY_LABELS,
  displayStatusCode,
  durationText,
  timeTextSec,
  type AttendanceMonthRow,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  rows: AttendanceMonthRow[]
  statuses: AttendanceStatus[]
  onRowClick: (row: AttendanceMonthRow) => void
  /** 일괄 변경 대상 선택(날짜). */
  selectedKeys: string[]
  onSelectionChange: (keys: string[]) => void
}

/** 시각 셀. 찍힌 시각이라 초까지 적는다(일간 표와 같은 규격). */
function TimeCell({ value }: { value: string | null }) {
  const text = timeTextSec(value)
  if (!text) return <EmptyValue />
  return <span className="tabular-nums text-gray-700">{text}</span>
}

/**
 * 월간 근태 표 — 한 사람의 1일부터 말일까지가 한 줄씩 선다.
 * 열 구성은 일간 표와 같게 두고 이름 자리만 날짜로 바꾼다. 같은 값을 다른 순서로 늘어놓으면
 * 두 뷰를 오갈 때마다 눈이 열을 다시 찾아야 한다.
 */
export function AttendanceMonthTable({
  rows,
  statuses,
  onRowClick,
  selectedKeys,
  onSelectionChange,
}: Props) {
  const columns: Column<AttendanceMonthRow>[] = [
    {
      key: 'workDate',
      header: '날짜',
      primary: true,
      align: 'left',
      className: 'w-28',
      render: (r) => {
        const d = dayjs(r.workDate)
        return (
          <span className="tabular-nums">
            {d.format('M월 D일')} ({WEEKDAY_LABELS[d.day()]})
          </span>
        )
      },
    },
    {
      key: 'workPlace',
      header: '근무지',
      className: 'w-20',
      render: (r) =>
        r.workPlace === 'EXTERNAL' ? (
          <Badge tone="info">{PLACE_LABELS.EXTERNAL}</Badge>
        ) : r.workPlace ? (
          PLACE_LABELS.INTERNAL
        ) : (
          <EmptyValue />
        ),
    },
    // 'HH:mm:ss' 여덟 자가 줄바꿈되지 않는 폭.
    {
      key: 'checkInAt',
      header: '출근',
      className: 'w-24',
      render: (r) => <TimeCell value={r.checkInAt} />,
    },
    {
      key: 'checkOutAt',
      header: '퇴근',
      className: 'w-24',
      render: (r) => <TimeCell value={r.checkOutAt} />,
    },
    {
      key: 'duration',
      header: '근무시간',
      className: 'w-24',
      render: (r) => durationText(r.checkInAt, r.checkOutAt) ?? <EmptyValue />,
    },
    {
      key: 'status',
      header: '상태',
      className: 'w-32',
      render: (r) => (
        <AttendanceStatusBadge
          statuses={statuses}
          code={displayStatusCode(r, r.workDate)}
          entry={r}
        />
      ),
    },
    {
      key: 'note',
      header: '비고',
      align: 'left',
      render: (r) => r.note ?? <EmptyValue />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.workDate}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      // 날짜가 곧 순번이라 No. 열은 같은 말을 두 번 하는 자리가 된다.
      numbered={false}
      standardColumns={false}
      rowClassName={(r) => (r.isWorkday ? undefined : 'bg-gray-25 text-gray-400')}
      emptyText="표시할 근태가 없습니다."
    />
  )
}
