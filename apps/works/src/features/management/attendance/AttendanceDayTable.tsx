import { Badge, DataTable, EmptyValue, TextAction, type Column } from '@ynarcher/ui'
import { AttendanceStatusBadge } from '@/features/management/attendance/AttendanceStatusBadge'
import {
  PLACE_LABELS,
  displayStatusCode,
  durationText,
  timeText,
  type AttendanceBoardRow,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  rows: AttendanceBoardRow[]
  dateKey: string
  statuses: AttendanceStatus[]
  /** 임직원 id → 소속 표기. 규칙은 departmentOptions.affiliationLabel이 소유한다. */
  affiliationOf: (departmentId: string | null) => string
  onRowClick: (row: AttendanceBoardRow) => void
  onOpenPerson: (row: AttendanceBoardRow) => void
}

/** 시각 셀. 자릿수가 흔들리지 않게 tabular-nums로 고정한다. */
function TimeCell({ value }: { value: string | null }) {
  const text = timeText(value)
  if (!text) return <EmptyValue />
  return <span className="tabular-nums text-gray-700">{text}</span>
}

/**
 * 일간 근태 표 — 그날의 전 임직원이 한 줄씩 선다.
 *
 * 줄의 기준은 근태 기록이 아니라 임직원 명부다. 기록이 있는 사람만 세우면 "오늘 아무도 안 찍은
 * 사람"이 표에서 사라져, 이 표가 답해야 하는 질문(누가 안 왔는가)에 답하지 못한다.
 *
 * 미출근을 위로 올리지 않는다 — 명부 순서가 흔들리면 사람을 눈으로 찾을 수 없다. 상태 배지가
 * 이미 그 사실을 말하고, 요약 타일이 건수를 말한다.
 */
export function AttendanceDayTable({
  rows,
  dateKey,
  statuses,
  affiliationOf,
  onRowClick,
  onOpenPerson,
}: Props) {
  const columns: Column<AttendanceBoardRow>[] = [
    {
      key: 'userName',
      header: '이름',
      primary: true,
      align: 'left',
      className: 'w-28',
      // 이름은 그 사람의 월간으로 가는 문이다 — 행 클릭(정정)과 다른 동작이라 링크로 갈라 둔다.
      render: (r) => (
        <TextAction
          onClick={(e: React.MouseEvent) => {
            // 행 클릭(정정 모달)과 겹치는 자리라 버블링을 끊는다.
            e.stopPropagation()
            onOpenPerson(r)
          }}
        >
          {r.userName}
        </TextAction>
      ),
    },
    {
      key: 'affiliation',
      header: '소속',
      className: 'w-36',
      render: (r) => affiliationOf(r.departmentId) || <EmptyValue />,
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
    {
      key: 'checkInAt',
      header: '출근',
      className: 'w-20',
      render: (r) => <TimeCell value={r.checkInAt} />,
    },
    {
      key: 'checkOutAt',
      header: '퇴근',
      className: 'w-20',
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
          code={displayStatusCode(r, dateKey)}
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
      rowKey={(r) => r.userId}
      onRowClick={onRowClick}
      // 근태 행에는 생성자·수정일·비활성화가 뜻이 없다. 알아야 하는 시각은 출근·퇴근이고,
      // 언제 누가 고쳤는지는 수정 모달의 정정 이력이 답한다.
      standardColumns={false}
      // 근무일이 아닌 사람의 줄은 한 단계 물러나게 둔다(빈 칸이 결근처럼 읽히지 않게).
      rowClassName={(r) => (r.isWorkday ? undefined : 'bg-gray-25 text-gray-400')}
      emptyText="표시할 임직원이 없습니다."
    />
  )
}
