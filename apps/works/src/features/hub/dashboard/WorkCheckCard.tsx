import { Badge, Card, TagChip, cn, useToast, type BadgeTone } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { LogIn, LogOut } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import {
  useCheckIn,
  useCheckOut,
  useMyAttendanceDay,
} from '@/features/management/attendance/attendanceApi'
import {
  useAttendanceStatuses,
  useMyAttendancePolicy,
} from '@/features/management/attendance/attendanceConfigApi'
import {
  PLACE_LABELS,
  WEEKDAY_LABELS,
  statusOf,
  timeText,
  type AttendancePlace,
} from '@/features/management/attendance/attendanceModel'

/**
 * 서버가 거절한 이유를 그대로 보여 준다 — '근무일이 아닙니다', '출근 기록이 없어...'처럼
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

/**
 * 스탬프 한 칸 — 영역 전체가 버튼이다.
 *
 * 라벨 아래에 버튼을 따로 두지 않는다. 누를 곳과 결과가 같은 자리에 있어야 "여기를 눌러 찍고,
 * 찍힌 시각이 여기 남는다"가 한 번에 읽힌다. 찍은 뒤에도 계속 누를 수 있다(마지막 시각이
 * 그날의 기록이다).
 *
 * 찍혔는지 여부는 **아이콘 색 하나로만** 말한다. 테두리·배경·라벨까지 함께 칠하면 두 칸이
 * 서로 다른 무게로 보여, 나란히 선 같은 종류의 동작이 위계가 다른 것처럼 읽힌다.
 */
function StampButton({
  icon,
  label,
  at,
  done,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  at: string | null
  done: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-radius-md border border-gray-200 bg-white px-3 py-2 text-left transition-colors duration-fast',
        'hover:border-gray-300 hover:bg-gray-25',
        'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:hover:border-gray-200 disabled:hover:bg-gray-50',
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-radius-md',
          done ? 'bg-brand text-gray-0' : 'bg-gray-100 text-gray-400',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className={cn(
          'flex-1 text-body-sm font-medium',
          disabled ? 'text-gray-400' : 'text-gray-700',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'text-body-sm tabular-nums',
          done ? 'font-semibold text-gray-900' : 'text-gray-400',
        )}
      >
        {at ? dayjs(at).format('HH:mm:ss') : '--:--:--'}
      </span>
    </button>
  )
}

/**
 * 근무체크 위젯 — 오늘 내 출근·퇴근을 찍는 자리.
 * 기획: docs_planning/3_7_3_management_attendance.md §7.5
 *
 * 카드 안을 2:3으로 나눈다. 왼쪽은 지금이 언제인가(날짜·시계·퇴근 예정·근무 현황), 오른쪽은
 * 무엇을 하는가(스탬프 둘)다. 시계와 버튼을 세로로 쌓으면 카드가 길어지기만 하고, 눈이
 * '지금 몇 시'와 '찍힌 시각'을 오갈 때 매번 위아래로 움직여야 한다.
 *
 * 왼쪽도 오른쪽과 같은 상자다. 안쪽 요소 셋이 테두리 없이 떠 있으면 오른쪽 두 칸과 무게가
 * 달라 한 카드 안에서 서로 다른 층으로 보인다. 높이는 오른쪽 두 칸의 합에 맞춘다.
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
  const { data: statuses } = useAttendanceStatuses()
  const { data: today } = useMyAttendanceDay(dateKey)
  const checkIn = useCheckIn()
  const checkOut = useCheckOut()

  const [place, setPlace] = useState<AttendancePlace>('INTERNAL')

  const checkedIn = Boolean(today?.checkInAt)
  const checkedOut = Boolean(today?.checkOutAt)
  const isWorkday = policy ? policy.workdays.includes(now.day()) : true
  const busy = checkIn.isPending || checkOut.isPending

  // 정상 퇴근까지 남았는가. 이 값이 있어야 '지금 누르면 조기퇴근'인지 알고 누를 수 있다.
  const dueAt =
    today?.checkInAt && policy ? dayjs(today.checkInAt).add(policy.workMinutes, 'minute') : null
  const early = dueAt ? now.isBefore(dueAt) : false

  const punchIn = async () => {
    // 다시 찍으면 앞선 퇴근 기록이 비워진다 — 되돌릴 수 없으므로 한 번 묻는다.
    if (checkedOut && !window.confirm('출근을 다시 기록하면 오늘 퇴근 기록이 지워집니다. 계속할까요?'))
      return
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

  /**
   * 시계 아래 한 줄 — 지금 붙들고 있어야 하는 기준 시각 하나.
   * 출근 전에는 출근 마감, 출근 뒤에는 퇴근 예정 시각이며 둘은 동시에 성립하지 않는다.
   * 현재 시각과 세로로 붙여 두므로 같은 자릿수(초까지)로 적는다 — 자릿수가 다르면 두 값을
   * 견주는 데 눈이 한 번 더 든다.
   */
  const benchmark = !isWorkday
    ? { label: '근무일 아님', value: '--:--:--' }
    : !checkedIn
      ? { label: '출근 마감', value: policy ? `${timeText(policy.checkInTo)}:00` : '--:--:--' }
      : dueAt
        ? { label: '퇴근 예정', value: dueAt.format('HH:mm:ss') }
        : null

  /**
   * 근무 현황 태그 — 진행 상태 하나 + 원장이 매긴 상태 하나.
   *
   * 둘을 한 값으로 합치지 않는다. '지금 근무중인가'와 '오늘이 어떤 날로 기록됐는가'는 다른
   * 질문이고, 지각한 채로 근무중인 날이 실제로 있다. 원장 상태는 `정상`일 때 적지 않는다 —
   * 아무 일도 없었다는 말을 배지로 붙이면 눈이 걸릴 곳만 늘어난다. 라벨·색은 상태 원장이
   * 갖고 있으므로 휴가 종류가 늘어나도 이 화면은 그대로다.
   */
  const progress: { label: string; tone: BadgeTone } = !isWorkday
    ? { label: '휴무', tone: 'neutral' }
    : checkedOut
      ? { label: '퇴근', tone: 'neutral' }
      : checkedIn
        ? { label: '근무중', tone: 'success' }
        : { label: '미출근', tone: 'neutral' }
  const ledger = statusOf(statuses ?? [], today?.statusCode ?? null)
  const ledgerBadge = ledger && ledger.code !== 'NORMAL' ? ledger : null

  return (
    <Card title="근무체크">
      <div className="grid grid-cols-5 items-stretch gap-2">
        {/* 왼쪽(2/5) — 지금이 언제인가. 오른쪽 두 칸과 같은 상자·같은 높이. */}
        <div className="col-span-2 flex flex-col justify-between rounded-radius-md border border-gray-200 bg-white px-3 py-2">
          <div className="space-y-0.5">
            <p className="text-caption leading-tight text-gray-500">
              {now.format('M월 D일')} ({WEEKDAY_LABELS[now.day()]})
            </p>
            <p className="text-title-sm font-bold leading-tight tabular-nums text-gray-900">
              {now.format('HH:mm:ss')}
            </p>
            {benchmark && (
              <p className="text-caption leading-tight text-gray-500">
                {benchmark.label} <span className="tabular-nums">{benchmark.value}</span>
              </p>
            )}
          </div>
          {/* 현황 태그 줄. 출근 전에는 이 자리가 근무지를 고르는 칩이 된다 — 배지와 칩은
              같은 규격이라 자리를 물려줘도 줄 높이가 흔들리지 않는다. */}
          <div className="flex flex-wrap items-center gap-1 pt-1.5">
            <Badge tone={progress.tone}>{progress.label}</Badge>
            {ledgerBadge && <Badge tone={ledgerBadge.tone}>{ledgerBadge.label}</Badge>}
            {checkedIn
              ? today?.workPlace === 'EXTERNAL' && <Badge tone="info">외부</Badge>
              : policy?.allowExternal &&
                (Object.keys(PLACE_LABELS) as AttendancePlace[]).map((p) => (
                  <TagChip key={p} selected={place === p} onClick={() => setPlace(p)}>
                    {PLACE_LABELS[p]}
                  </TagChip>
                ))}
          </div>
        </div>

        {/* 오른쪽(3/5) — 무엇을 하는가. */}
        <div className="col-span-3 space-y-2">
          <StampButton
            icon={<LogIn className="size-4" />}
            label="출근하기"
            at={today?.checkInAt ?? null}
            done={checkedIn}
            disabled={busy || !isWorkday}
            onClick={() => void punchIn()}
          />
          <StampButton
            icon={<LogOut className="size-4" />}
            label="퇴근하기"
            at={today?.checkOutAt ?? null}
            done={checkedOut}
            disabled={busy || !isWorkday || !checkedIn}
            onClick={() => void punchOut()}
          />
        </div>
      </div>
    </Card>
  )
}
