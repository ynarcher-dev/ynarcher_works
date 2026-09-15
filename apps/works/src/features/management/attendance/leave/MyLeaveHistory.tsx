import { Banner, Card, DataTable, StatStrip, cn, tableText, type Column, type StripTile } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { LEAVE_FORM_ABBREV } from '@/features/approval/leaveForm'
import { AttendancePeriodNav } from '@/features/management/attendance/AttendancePeriodNav'
import { AttendanceRequestList } from '@/features/management/attendance/AttendanceRequestList'
import {
  LEAVE_LEDGER_NOTICE,
  currentLeaveYear,
  leaveAmountText,
  leaveLedgerTotals,
  runningGrantMinutes,
  sortedGrants,
  sortedUsages,
  useMyLeaveLedger,
  type LeaveGrantRow,
  type LeaveUsageRow,
} from '@/features/management/attendance/leave/leaveLedgerMock'

/** 지표 띠 — 총·사용·잔여 세 칸. */
const GRID_3 = 'grid grid-cols-1 divide-gray-200 sm:grid-cols-3 sm:divide-x'

/**
 * 휴가 내역 — 받은 것(발생) · 쓴 것(사용) · 올린 것(신청) 세 덩어리.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 세 덩어리는 **출처가 서로 다르다**. 발생과 사용은 연차 지급·소진 원장의 일이라 지금은 임시
 * 값을 읽고(`leaveLedgerMock`), 신청 목록은 이미 있는 전자결재 문서를 그대로 본다. 임시 값은
 * 화면 위에 그렇다고 적어 둔다 — 잔여 일수는 사람이 그대로 믿고 휴가를 신청하는 수다.
 *
 * 근태 상태 원장(`연차`로 지정된 날)을 사용 내역으로 쓰지 않는 이유는, 그 원장이 답하는 것이
 * '그날이 어떤 날로 기록됐는가'이지 '연차를 몇 시간 깎았는가'가 아니기 때문이다. 반차·반반차가
 * 같은 하루 안에 서면 두 값은 곧바로 갈린다.
 */
export function MyLeaveHistory() {
  const [year, setYear] = useState(currentLeaveYear)
  const { data: ledger } = useMyLeaveLedger(year)

  const grants = useMemo(() => sortedGrants(ledger), [ledger])
  const running = useMemo(() => runningGrantMinutes(grants), [grants])
  const usages = useMemo(() => sortedUsages(ledger), [ledger])
  const totals = useMemo(() => leaveLedgerTotals(ledger), [ledger])

  const tiles: StripTile[] = [
    { key: 'granted', label: '총 휴가', value: leaveAmountText(totals.grantedMinutes) },
    { key: 'used', label: '사용', value: leaveAmountText(totals.usedMinutes) },
    { key: 'remaining', label: '잔여', value: leaveAmountText(totals.remainingMinutes) },
  ]

  const grantColumns: Column<LeaveGrantRow>[] = [
    { key: 'grantedOn', header: '생성일', type: 'date', render: (r) => r.grantedOn },
    {
      key: 'minutes',
      header: '발생',
      type: 'count',
      render: (r) => leaveAmountText(r.minutes),
    },
    {
      key: 'running',
      header: '최종',
      type: 'count',
      // 그 줄까지 쌓인 누계. 한 줄만 보고도 '이 시점에 며칠이었나'를 읽을 수 있어야 한다.
      render: (r) => leaveAmountText(running[grants.indexOf(r)] ?? 0),
    },
    { key: 'reason', header: '내용', type: 'text', primary: true, render: (r) => r.reason },
    { key: 'note', header: '비고', type: 'long', tone: 'meta', render: (r) => r.note },
  ]

  const usageColumns: Column<LeaveUsageRow>[] = [
    { key: 'usedOn', header: '사용일', type: 'date', render: (r) => r.usedOn },
    { key: 'typeLabel', header: '휴가 종류', type: 'text', primary: true, render: (r) => r.typeLabel },
    { key: 'minutes', header: '사용', type: 'count', render: (r) => leaveAmountText(r.minutes) },
  ]

  return (
    <div className="space-y-4">
      <AttendancePeriodNav
        label={`${year}-01-01 ~ ${year}-12-31`}
        prevLabel="이전 해"
        nextLabel="다음 해"
        resetLabel="올해"
        atCurrent={year === currentLeaveYear()}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        onReset={() => setYear(currentLeaveYear())}
      />

      <Banner tone="warning">{LEAVE_LEDGER_NOTICE}</Banner>

      <Card title="휴가 현황" help="발생 내역에서 더한 총 휴가와 사용 내역에서 더한 사용량의 차이가 잔여입니다.">
        <StatStrip tiles={tiles} className={GRID_3} variant="label-led" />
      </Card>

      <Card title="휴가 생성 내역" count={grants.length}>
        <div className="space-y-2">
          <p className={cn(tableText.meta)}>{`${year}-01-01 ~ ${year}-12-31`}</p>
          <DataTable
            columns={grantColumns}
            rows={grants}
            rowKey={(r) => r.id}
            numbered={false}
            standardColumns={false}
            emptyText="이 해에 발생한 휴가가 없습니다."
          />
        </div>
      </Card>

      <Card title="휴가 사용 내역" count={usages.length}>
        <DataTable
          columns={usageColumns}
          rows={usages}
          rowKey={(r) => r.id}
          numbered={false}
          standardColumns={false}
          emptyText="이 해에 사용한 휴가가 없습니다."
        />
      </Card>

      {/* 신청 목록만은 임시 값이 아니다 — 이미 결재 문서로 쌓여 있는 사실이다. */}
      <AttendanceRequestList
        title="휴가 신청 내역"
        help="이 해에 올린 휴가신청서만 모읍니다. 줄을 누르면 결재 문서로 이동합니다."
        abbrevs={[LEAVE_FORM_ABBREV]}
        year={year}
        emptyText="올린 휴가 신청이 없습니다."
      />
    </div>
  )
}
