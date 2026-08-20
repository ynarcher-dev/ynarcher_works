import {
  Badge,
  DataTable,
  EmptyValue,
  TextAction,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import { AttendanceStatusBadge } from '@/features/management/attendance/AttendanceStatusBadge'
import { TIER_EMPTY, type OrgTiers } from '@/features/management/orgTiers'
import {
  PLACE_LABELS,
  displayStatusCode,
  durationText,
  timeTextSec,
  type AttendanceBoardRow,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

interface Props {
  rows: AttendanceBoardRow[]
  dateKey: string
  statuses: AttendanceStatus[]
  /** 조직 뎁스 눈금. 컬럼 수와 헤더는 조직 관리가 정한다(management/orgTiers). */
  org: OrgTiers
  onRowClick: (row: AttendanceBoardRow) => void
  onOpenPerson: (row: AttendanceBoardRow) => void
  /** 페이저. `rows`는 이미 그 페이지 구간으로 잘려 온다(넘버링 기준은 total이 잡는다). */
  pagination?: DataTableProps<AttendanceBoardRow>['pagination']
  /** 일괄 변경 대상 선택(임직원 id). */
  selectedKeys: string[]
  onSelectionChange: (keys: string[]) => void
}

/** 시각 셀. 찍힌 시각이라 초까지 적고, 자릿수가 흔들리지 않게 tabular-nums로 고정한다. */
function TimeCell({ value }: { value: string | null }) {
  const text = timeTextSec(value)
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
  org,
  onRowClick,
  onOpenPerson,
  pagination,
  selectedKeys,
  onSelectionChange,
}: Props) {
  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<AttendanceBoardRow>[] = [
    {
      key: 'userName',
      header: '이름',
      primary: true,
      type: 'name',
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
    // 소속은 뎁스마다 한 칸씩 선다 — 한 칸에 이어 붙이면 본부로 묶어 보거나 팀만 눈으로
    // 따라가는 일이 되지 않는다. 칸 수와 헤더는 조직 관리가 정한다.
    ...org.tiers.map<Column<AttendanceBoardRow>>((t) => ({
      key: `tier-${t.tier}`,
      header: t.label,
      type: 'text',
      render: (r) => {
        const name = org.valuesOf(r.departmentId)[t.tier]
        return name && name !== TIER_EMPTY ? name : <EmptyValue />
      },
    })),
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
      render: (r) => <TimeCell value={r.checkInAt} />,
    },
    {
      key: 'checkOutAt',
      header: '퇴근',
      type: 'date',
      render: (r) => <TimeCell value={r.checkOutAt} />,
    },
    {
      key: 'duration',
      header: '근무시간',
      type: 'date',
      render: (r) => durationText(r.checkInAt, r.checkOutAt) ?? <EmptyValue />,
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
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
      // 긴 텍스트 열(long) — 남는 폭은 가중치로 배분되므로 비고가 표를 다 먹지 않고,
      // 긴 사유는 줄바꿈으로 받는다(long은 유일하게 줄바꿈을 허용하는 종류다).
      type: 'long',
      render: (r) => r.note ?? <EmptyValue />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.userId}
      // selectable은 자리 기본값(페이지에 바로 놓인 표 = 켬)을 그대로 따른다.
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      // 근태 행에는 생성자·수정일·비활성화가 뜻이 없다. 알아야 하는 시각은 출근·퇴근이고,
      // 언제 누가 고쳤는지는 수정 모달의 정정 이력이 답한다.
      standardColumns={false}
      // 근무일이 아닌 사람의 줄은 한 단계 물러나게 둔다(빈 칸이 결근처럼 읽히지 않게).
      rowClassName={(r) => (r.isWorkday ? undefined : 'bg-gray-25 text-gray-400')}
      pagination={pagination}
      emptyText="조건에 맞는 임직원이 없습니다."
    />
  )
}
