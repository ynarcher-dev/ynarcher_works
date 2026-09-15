import { IconButton, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { WEEKDAY_LABELS } from '@/features/management/attendance/attendanceModel'
import {
  isLeaveSelectable,
  leaveMonthSpans,
  type LeaveDay,
} from '@/features/management/attendance/leave/leaveSelection'

/**
 * 하루 칸의 폭 — **모든 날이 똑같이 나눠 가진다.**
 *
 * 표를 고정 배치(`table-fixed`)로 두고 줄 이름 칸만 폭을 정하면, 남는 폭을 날짜 칸들이 균등하게
 * 나눠 갖는다. 칸마다 폭을 박아 두면 내용(`근무일`·`연차`)이 긴 칸만 벌어져 격자가 들쭉날쭉해지고,
 * 가로로 밀어 보지 않기로 한 이상 넘치는 폭을 스크롤로 넘길 수도 없다.
 */
const LABEL_COL = 'w-20'

const CELL = 'border-b border-l border-gray-200 px-1 py-2 text-center align-middle'
const ROW_LABEL = 'border-b border-l border-gray-200 bg-gray-25 px-2 py-2 text-center align-middle'

/**
 * 휴가선택 칸의 두 줄(이름 / 단위) — **빈 칸도 두 줄의 높이를 든다.**
 *
 * 내용에 맡기면 하나를 고를 때마다 그 줄 전체가 늘었다 줄어, 아래 있던 목록·사유·첨부가 위아래로
 * 튄다. 고르는 동안 격자가 흔들리지 않는 것이 이 자리의 요건이다.
 *
 * 고른 칸에는 글자를 적지 않는다(2026-09-15 사용자 지정) — 칸은 색으로만 말하고, 무슨 휴가를
 * 며칠 쓰는지는 아래 `휴가 신청` 목록이 한 줄씩 답한다. 좁은 칸에 이름을 적으면 종류가 길어질수록
 * 글자가 접히고, 같은 사실이 두 곳에 적히면 한쪽만 고쳐질 자리가 생긴다.
 */
function PickLines({ name, unit, muted }: { name: string; unit: string; muted?: boolean }) {
  const tone = muted ? 'text-gray-500' : ''
  return (
    <>
      <span className={cn('block', tableText.primary, tone)}>{name || '\u00A0'}</span>
      <span className={cn('block', tableText.meta, tone)}>{unit || '\u00A0'}</span>
    </>
  )
}

/** 요일색 — 토요일은 파랑, 일요일은 빨강(달력의 관습). 평일은 본문색 그대로다. */
function weekdayTone(weekday: number): string {
  if (weekday === 6) return 'text-info'
  if (weekday === 0) return 'text-danger'
  return ''
}

interface LeaveDayStripProps {
  days: LeaveDay[]
  /** 고른 날(YYYY-MM-DD). */
  selected: string[]
  /** 오늘(YYYY-MM-DD) — 창 안에서 지금이 어디인지 표시한다. */
  today: string
  /** 기간 선택에서 한쪽 끝만 집은 상태. 두 번째 끝을 기다리는 칸이다. */
  rangeAnchor: string | null
  onPick: (date: string) => void
  onPrev: () => void
  onNext: () => void
  /** 휴가 종류를 아직 고르지 않았을 때처럼 아직 집을 수 없는 상태. */
  disabled?: boolean
}

/**
 * 휴가 사용일 달력 — 날짜가 **열**이고 `일자 · 근무계획 · 휴가선택` 세 줄이 행이다.
 *
 * 월 달력이 아닌 가로 띠인 이유는 이 화면이 묻는 것이 "몇 월 며칠인가"가 아니라 "이어지는
 * 근무일 중 어디를 쉬는가"이기 때문이다. 근무계획 줄이 바로 위에 붙어 있어야 휴무일을 사이에
 * 둔 선택이 한눈에 읽힌다.
 *
 * 그릴 값은 전부 `leaveSelection`이 계산해 넘겨준다 — 이 컴포넌트는 판정하지 않는다.
 */
export function LeaveDayStrip({
  days,
  selected,
  today,
  rangeAnchor,
  onPick,
  onPrev,
  onNext,
  disabled = false,
}: LeaveDayStripProps) {
  const spans = leaveMonthSpans(days)
  return (
    <div className="flex items-stretch gap-1">
      <div className="flex items-center">
        <IconButton icon={<ChevronLeft />} label="이전 주" variant="ghost" onClick={onPrev} />
      </div>

      {/*
        창에 든 날은 전부 한 화면에 선다 — 가로로 밀지 않는다. 앞뒤는 화살표가 답한다.

        표를 flex 항목으로 직접 두지 않고 한 겹 감싼다. 표는 자기 내용만큼을 최소 폭으로 붙잡아
        남는 폭이 한쪽(왼쪽)에만 쏠렸다 — 감싼 칸이 남는 폭을 전부 가져가고(`flex-1`) 표가 그
        칸을 꽉 채우면(`w-full`) 좌우 화살표가 같은 간격으로 선다.
      */}
      <div className="min-w-0 flex-1">
        <table className="w-full table-fixed border-collapse border-t border-r border-gray-200">
          <thead>
            <tr>
              <th className={cn(ROW_LABEL, LABEL_COL)} />
              {spans.map((s) => (
                <th key={s.key} colSpan={s.span} className={cn(CELL, tableText.head, 'bg-gray-25')}>
                  {s.key}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <th className={cn(ROW_LABEL, LABEL_COL, tableText.head)}>일자</th>
              {days.map((d) => {
                const isToday = d.date === today
                const tone = isToday ? 'text-brand-700' : weekdayTone(d.weekday)
                return (
                  <td key={d.date} className={cn(CELL, isToday && 'bg-brand-25')}>
                    <span className={cn('block tabular-nums', tableText.primary, tone)}>
                      {dayjs(d.date).format('DD')}
                    </span>
                    <span className={cn('block', tableText.meta, tone)}>
                      ({WEEKDAY_LABELS[d.weekday]})
                    </span>
                  </td>
                )
              })}
            </tr>

            <tr>
              <th className={cn(ROW_LABEL, LABEL_COL, tableText.head)}>근무계획</th>
              {days.map((d) => (
                /*
                  공휴일 이름은 아직 적지 못한다 — 공휴일 원장이 없어 근태 원장도 그날을
                  근무일로 답한다. 없는 값을 화면이 지어내면 어느 쪽도 사실이 아니게 된다.
                */
                <td
                  key={d.date}
                  className={cn(
                    CELL,
                    tableText.body,
                    'whitespace-nowrap',
                    !d.isWorkday && 'bg-gray-25 text-gray-400',
                  )}
                >
                  {d.isWorkday ? '근무일' : '휴무일'}
                </td>
              ))}
            </tr>

            <tr>
              <th className={cn(ROW_LABEL, LABEL_COL, tableText.head)}>휴가선택</th>
              {days.map((d) => {
                const picked = selected.includes(d.date)
                const anchored = rangeAnchor === d.date
                const selectable = isLeaveSelectable(d) && !disabled

                // 이미 휴가가 잡힌 날 — 고를 수 없고, 무엇이 잡혀 있는지만 적는다.
                if (d.usedLeaveLabel) {
                  return (
                    <td key={d.date} className={cn(CELL, 'bg-gray-50')}>
                      <PickLines name={d.usedLeaveLabel} unit="(종일)" muted />
                    </td>
                  )
                }

                if (!selectable) {
                  return (
                    <td key={d.date} className={cn(CELL, !d.isWorkday && 'bg-gray-25')}>
                      <PickLines name="" unit="" />
                    </td>
                  )
                }

                return (
                  <td key={d.date} className={cn(CELL, 'p-0')}>
                    <button
                      type="button"
                      onClick={() => onPick(d.date)}
                      aria-pressed={picked}
                      aria-label={`${d.date} 휴가 사용일`}
                      className={cn(
                        'block w-full px-1 py-2 transition-colors duration-fast',
                        picked ? 'bg-brand-600' : 'hover:bg-gray-50 active:bg-gray-100',
                        // 기간의 첫 끝 — 아직 구간이 서지 않았으므로 칠하지 않고 테두리로 표시한다.
                        anchored && !picked && 'ring-2 ring-inset ring-brand',
                      )}
                    >
                      <PickLines name="" unit="" />
                    </button>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center">
        <IconButton icon={<ChevronRight />} label="다음 주" variant="ghost" onClick={onNext} />
      </div>
    </div>
  )
}
