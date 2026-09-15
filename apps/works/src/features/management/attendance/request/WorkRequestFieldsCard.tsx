import { Card, Input, Select, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import type { AttendancePolicy } from '@/features/management/attendance/attendanceModel'
import { minutesText } from '@/features/management/attendance/myAttendanceStats'
import {
  workRequestMinutes,
  type WorkRequestMeta,
} from '@/features/approval/workRequestForm'

/** 휴게시간 선택지(분). 손으로 적게 하면 같은 한 시간이 60·1·1시간으로 제각기 적힌다. */
const BREAK_OPTIONS = [0, 30, 60, 90, 120]

export interface WorkRequestInput {
  date: string
  start: string
  end: string
  breakMinutes: number
}

/**
 * 근무 신청의 본문 — **언제·몇 시부터 몇 시까지**를 받는다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 연장근무와 휴일근무가 한 카드를 쓴다. 두 신청이 묻는 것은 같은 축(근무일 + 시각 두 개)이고
 * 갈리는 것은 라벨과 휴게시간 칸의 유무뿐이라, 화면을 둘로 나누면 같은 입력 규칙(자정 넘김·
 * 시간 계산)이 두 벌로 살게 된다.
 *
 * **적용대상 칸은 두지 않는다**(2026-09-15 사용자 확정). 대상은 언제나 신청자 본인이고, 그
 * 이름은 바로 위 기본 설정의 `작성자` 칸이 이미 적고 있다 — 바꿀 수 없는 값을 한 번 더 세우면
 * 고를 수 있는 칸처럼 보이면서 화면만 길어진다. 남을 대신한 신청을 열려면 그 사람의 근태를
 * 바꿀 권한이 함께 필요하고, 문서 한 건이 여러 사람의 근태를 바꾸면 승인 결과를 반영할 때
 * 어느 줄이 누구의 것인지 문서가 답하지 못한다.
 */
export function WorkRequestFieldsCard({
  meta,
  value,
  onChange,
  policy,
}: {
  meta: WorkRequestMeta
  value: WorkRequestInput
  onChange: (next: WorkRequestInput) => void
  policy: AttendancePolicy | null
}) {
  const minutes = workRequestMinutes(
    value.start,
    value.end,
    meta.hasBreak ? value.breakMinutes : 0,
  )
  const crossesMidnight =
    Boolean(value.start && value.end) && value.end <= value.start && minutes !== null

  const set = (patch: Partial<WorkRequestInput>) => onChange({ ...value, ...patch })

  return (
    <Card
      title={meta.label}
      help={
        meta.hasBreak
          ? '출근·퇴근 시각에서 휴게시간을 뺀 값이 신청 시간입니다. 퇴근이 출근보다 이르면 자정을 넘긴 근무로 읽습니다.'
          : '소정 근무 뒤에 이어서 일한 시간을 적습니다. 종료가 시작보다 이르면 자정을 넘긴 근무로 읽습니다.'
      }
    >
      <div className="space-y-4">
        {/* 근무일과 시각은 **한 줄에 선다** — 셋(넷)이 함께 한 신청을 이루므로, 줄을 나누면
            날짜를 고른 뒤 눈이 한 번 내려갔다가 다시 옆으로 움직인다. */}
        <div
          className={cn(
            'grid grid-cols-1 gap-4',
            meta.hasBreak ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          <label className="space-y-1.5">
            <span className={tableText.head}>근무일</span>
            <Input
              type="date"
              value={value.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </label>
          <label className="space-y-1.5">
            <span className={tableText.head}>{meta.startLabel}</span>
            <Input
              type="time"
              value={value.start}
              onChange={(e) => set({ start: e.target.value })}
            />
          </label>
          <label className="space-y-1.5">
            <span className={tableText.head}>{meta.endLabel}</span>
            <Input type="time" value={value.end} onChange={(e) => set({ end: e.target.value })} />
          </label>
          {meta.hasBreak && (
            <label className="space-y-1.5">
              <span className={tableText.head}>휴게시간</span>
              <Select
                value={String(value.breakMinutes)}
                onChange={(e) => set({ breakMinutes: Number(e.target.value) })}
              >
                {BREAK_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? '없음' : `${m}분`}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>

        {/* 신청 시간은 사람이 적는 값이 아니라 위 세 칸이 낳는 값이다 — 그래서 읽기로만 선다. */}
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-200 pt-3">
          <span className={tableText.head}>신청 시간</span>
          <span className={cn(tableText.primary, 'font-semibold tabular-nums')}>
            {minutes === null ? '—' : minutesText(minutes)}
            {crossesMidnight && (
              <span className={cn(tableText.meta, 'ml-2 font-normal')}>
                다음 날 {value.end}까지
              </span>
            )}
          </span>
        </div>

        {value.date && policy && (
          <p className={tableText.meta}>
            {dayjs(value.date).format('M월 D일')}의 소정 근무는{' '}
            {minutesText(policy.workMinutes)}입니다.
          </p>
        )}
      </div>
    </Card>
  )
}
