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

/**
 * 시각 셀. 찍힌 시각이라 초까지 적는다(일간 표와 같은 규격).
 * 색·자릿수 고정을 셀 안에서 적지 않는 이유는 일간 표의 같은 컴포넌트 주석 참조.
 */
function TimeCell({ value }: { value: string | null }) {
  const text = timeTextSec(value)
  return text ? <>{text}</> : <EmptyValue />
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
  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<AttendanceMonthRow>[] = [
    {
      // 날짜가 이 표의 식별 열이다(한 사람의 월간 뷰) — 고정폭 date가 아니라 name으로 세운다.
      key: 'workDate',
      header: '날짜',
      primary: true,
      type: 'name',
      // 날짜 숫자의 자릿수를 고정한다 — 규격은 셀 안 <span>이 아니라 열이 선언한다.
      numeric: true,
      render: (r) => {
        const d = dayjs(r.workDate)
        return `${d.format('M월 D일')} (${WEEKDAY_LABELS[d.day()]})`
      },
    },
    {
      key: 'workPlace',
      header: '근무지',
      type: 'badge',
      render: (r) =>
        r.workPlace === 'EXTERNAL' ? (
          <Badge tone="info">{PLACE_LABELS.EXTERNAL}</Badge>
        ) : r.workPlace ? (
          PLACE_LABELS.INTERNAL
        ) : (
          <EmptyValue />
        ),
    },
    // 시각·소요는 폭이 일정한 값이라 날짜와 같은 고정폭 규격(date)에 세운다.
    {
      key: 'checkInAt',
      header: '출근',
      type: 'date',
      numeric: true,
      render: (r) => <TimeCell value={r.checkInAt} />,
    },
    {
      key: 'checkOutAt',
      header: '퇴근',
      type: 'date',
      numeric: true,
      render: (r) => <TimeCell value={r.checkOutAt} />,
    },
    {
      key: 'duration',
      header: '근무시간',
      type: 'date',
      numeric: true,
      render: (r) => durationText(r.checkInAt, r.checkOutAt) ?? <EmptyValue />,
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
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
      type: 'long',
      render: (r) => r.note ?? <EmptyValue />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.workDate}
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      // 날짜가 곧 순번이라 No. 열은 같은 말을 두 번 하는 자리가 된다.
      numbered={false}
      standardColumns={false}
      // 근무일이 아닌 날의 줄은 투명도로만 물린다(근거는 일간 표 주석 참조).
      rowClassName={(r) => (r.isWorkday ? undefined : 'opacity-60')}
      emptyText="표시할 근태가 없습니다."
    />
  )
}
