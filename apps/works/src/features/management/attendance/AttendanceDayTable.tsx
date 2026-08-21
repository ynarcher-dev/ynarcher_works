import {
  Badge,
  DataTable,
  EmptyValue,
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

/**
 * 시각 셀 — 찍힌 시각이라 초까지 적는다.
 *
 * 글자 색도 자릿수 고정(tabular-nums)도 여기서 적지 않는다. 톤은 표가 열의 자리로 정하고
 * (`tableText.body`), 자릿수 고정은 열이 `numeric`으로 선언한다 — 셀 안에 규격을 손으로 적으면
 * 표가 놓인 자리가 바뀌어도 이 칸만 따라오지 못한다.
 */
function TimeCell({ value }: { value: string | null }) {
  const text = timeTextSec(value)
  return text ? <>{text}</> : <EmptyValue />
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
      // 이름은 그 사람의 월간으로 가는 문이다 — 행 클릭(정정)과 다른 동작이라 눌리는 자리를 갈라 둔다.
      // 다만 글자 규격은 주지 않는다. 식별 열의 크기·굵기·색은 표가 정하고(`tableText.primary`),
      // 여기서는 누를 수 있다는 사실만 밑줄로 알린다 — 브랜드색 링크(TextAction, 12px)로 세우면
      // 이 칸만 나머지 열보다 작고 다른 색으로 떠서, 한 줄 안에서 크기를 갈라 위계를 만들게 된다.
      render: (r) => (
        <button
          type="button"
          className="rounded-radius-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          onClick={(e) => {
            // 행 클릭(정정 모달)과 겹치는 자리라 버블링을 끊는다.
            e.stopPropagation()
            onOpenPerson(r)
          }}
        >
          {r.userName}
        </button>
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
    // 시각·소요는 폭이 일정한 값이라 날짜와 같은 고정폭 규격(date)에 세우고, 자릿수가 줄마다
    // 흔들리지 않게 고정폭 숫자(numeric)로 선언한다 — 정렬은 종류가 정한 왼쪽 그대로다.
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
      // 물러남은 투명도로만 말한다 — 표가 비활성 행에 쓰는 것과 같은 수단이다. 행에 글자색을
      // 적는 방법은 애초에 듣지 않았고(셀마다 자기 톤 클래스를 갖는다), 회색 면은 행 hover와
      // 같은 색(gray-25)이라 그 줄만 마우스를 올려도 아무 반응이 없는 것처럼 보였다.
      rowClassName={(r) => (r.isWorkday ? undefined : 'opacity-60')}
      pagination={pagination}
      emptyText="조건에 맞는 임직원이 없습니다."
    />
  )
}
