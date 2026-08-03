import { Badge, Button, Card, Select, useToast } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { LogIn, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  useCheckIn,
  useCheckOut,
  useMyAttendanceDay,
} from '@/features/management/attendance/attendanceApi'
import { useMyAttendancePolicy } from '@/features/management/attendance/attendanceConfigApi'
import {
  PLACE_LABELS,
  WEEKDAY_LABELS,
  timeText,
  workMinutesText,
  type AttendancePlace,
} from '@/features/management/attendance/attendanceModel'

/**
 * 서버가 거절한 이유를 그대로 보여 준다 — '근무일이 아닙니다', '이미 출근을 기록했습니다'처럼
 * 판정 근거가 문구에 담겨 있어, 일반화된 실패 문구로 덮으면 왜 안 되는지 알 수 없다.
 * (Supabase 오류는 Error 인스턴스가 아니라 message를 가진 평범한 객체로 온다.)
 */
function failureText(e: unknown, fallback: string): string {
  const message = (e as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}

/** 1초마다 다시 그리는 현재 시각. 시계가 멈춰 있으면 '지금 찍는다'는 감각이 사라진다. */
function useClock() {
  const [now, setNow] = useState(() => dayjs())
  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** 출근/퇴근 한 짝. 찍었으면 시각을, 아니면 00:00:00을 같은 자리에 보여 준다. */
function PunchSlot({
  icon,
  label,
  at,
  done,
}: {
  icon: React.ReactNode
  label: string
  at: string | null
  done: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span
        className={
          'flex size-9 items-center justify-center rounded-radius-full ' +
          (done ? 'bg-brand text-gray-0' : 'bg-gray-100 text-gray-500')
        }
        aria-hidden
      >
        {icon}
      </span>
      <span className={done ? 'text-body-sm text-gray-500' : 'text-body-sm text-gray-900'}>
        {label}
      </span>
      <span className="text-caption tabular-nums text-gray-500">
        {at ? dayjs(at).format('HH:mm:ss') : '00:00:00'}
      </span>
    </div>
  )
}

/**
 * 근무체크 위젯 — 오늘 내 출근·퇴근을 찍는 자리.
 * 기획: docs_planning/3_7_3_management_attendance.md §7.5
 *
 * 버튼은 둘뿐이다. 외출·회의·외근·조퇴는 일과의 분류이지 근태 상태가 아니라, 이 원장이
 * 답해야 하는 질문(제때 왔는가, 얼마나 일했는가)에 기여하지 않는다.
 *
 * 시각과 판정은 전부 서버가 정한다 — 화면의 시계는 보여 주기 위한 것이고, 기록되는 값은
 * RPC 안의 now()다. 무엇이 가능한지(근무일·출근 가능 시각·외부근무 허용)도 내 근무 기준이
 * 답하므로 이 화면에 규칙을 두지 않는다.
 */
export function WorkCheckCard() {
  const toast = useToast()
  const now = useClock()
  const dateKey = now.format('YYYY-MM-DD')

  const { data: policy } = useMyAttendancePolicy()
  const { data: today } = useMyAttendanceDay(dateKey)
  const checkIn = useCheckIn()
  const checkOut = useCheckOut()

  const [place, setPlace] = useState<AttendancePlace>('INTERNAL')

  const checkedIn = Boolean(today?.checkInAt)
  const checkedOut = Boolean(today?.checkOutAt)
  const isWorkday = policy ? policy.workdays.includes(now.day()) : true
  const busy = checkIn.isPending || checkOut.isPending

  // 정상 퇴근까지 남은 시간. 이 값이 있어야 '지금 누르면 조기퇴근'인지 알고 누를 수 있다.
  const dueAt =
    today?.checkInAt && policy
      ? dayjs(today.checkInAt).add(policy.workMinutes, 'minute')
      : null
  const early = dueAt ? now.isBefore(dueAt) : false

  const punchIn = async () => {
    try {
      await checkIn.mutateAsync(place)
      toast.show('출근을 기록했습니다.', 'success')
    } catch (e) {
      toast.show(failureText(e, '출근 기록에 실패했습니다.'), 'danger')
    }
  }

  const punchOut = async () => {
    if (early && dueAt) {
      const until = dueAt.format('HH:mm')
      if (!window.confirm(`정상 퇴근 시각(${until}) 전입니다. 조기퇴근으로 기록됩니다. 계속할까요?`))
        return
    }
    try {
      await checkOut.mutateAsync()
      toast.show('퇴근을 기록했습니다.', 'success')
    } catch (e) {
      toast.show(failureText(e, '퇴근 기록에 실패했습니다.'), 'danger')
    }
  }

  return (
    <Card title="근무체크">
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-caption text-gray-500">
            {now.format('M월 D일')} ({WEEKDAY_LABELS[now.day()]})
          </span>
          {today?.workPlace === 'EXTERNAL' && <Badge tone="info">외부 근무중</Badge>}
        </div>
        <p className="text-title-md font-bold tabular-nums text-gray-900">
          {now.format('HH:mm:ss')}
        </p>

        <div className="flex items-stretch gap-2 border-y border-gray-100 py-3">
          <PunchSlot
            icon={<LogIn className="size-4" />}
            label="출근하기"
            at={today?.checkInAt ?? null}
            done={checkedIn}
          />
          <span className="w-px bg-gray-100" aria-hidden />
          <PunchSlot
            icon={<LogOut className="size-4" />}
            label="퇴근하기"
            at={today?.checkOutAt ?? null}
            done={checkedOut}
          />
        </div>

        {!isWorkday ? (
          <p className="text-caption text-gray-500">오늘은 근무일이 아닙니다.</p>
        ) : !checkedIn ? (
          <div className="space-y-2">
            {/* 근무지는 출근할 때 고르는 값이다 — 허용되지 않은 기준에서는 물음 자체를 없앤다. */}
            {policy?.allowExternal && (
              <Select
                value={place}
                onChange={(e) => setPlace(e.target.value as AttendancePlace)}
                aria-label="근무지"
              >
                {(Object.keys(PLACE_LABELS) as AttendancePlace[]).map((p) => (
                  <option key={p} value={p}>
                    {PLACE_LABELS[p]}
                  </option>
                ))}
              </Select>
            )}
            <Button className="w-full" disabled={busy} onClick={() => void punchIn()}>
              출근하기
            </Button>
            {policy && (
              <p className="text-caption text-gray-500">
                {timeText(policy.checkInTo)}까지 찍으면 정상입니다.
              </p>
            )}
          </div>
        ) : !checkedOut ? (
          <div className="space-y-2">
            <Button
              className="w-full"
              variant="secondary"
              disabled={busy}
              onClick={() => void punchOut()}
            >
              퇴근하기
            </Button>
            {dueAt && policy && (
              <p className="text-caption text-gray-500">
                {early
                  ? `정상 퇴근 ${dueAt.format('HH:mm')} (근무 ${workMinutesText(policy.workMinutes)})`
                  : '정상 퇴근 시각이 지났습니다.'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-caption text-gray-500">
            오늘 근무를 마쳤습니다. 기록 정정은 경영지원에 요청하세요.
          </p>
        )}
      </div>
    </Card>
  )
}
