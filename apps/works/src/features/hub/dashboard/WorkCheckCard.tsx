import { Badge, Button, Card, SegmentedToggle, useToast, type BadgeTone } from '@ynarcher/ui'
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
  PLACE_SHORT_LABELS,
  WEEKDAY_LABELS,
  statusOf,
  timeText,
  type AttendancePlace,
} from '@/features/management/attendance/attendanceModel'
import { DashboardRowButton } from '@/features/hub/dashboard/DashboardRowButton'

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
 * 스탬프 한 칸 — 영역 전체가 버튼이다(줄 규격은 DashboardRowButton이 소유한다).
 *
 * 라벨 아래에 버튼을 따로 두지 않는다. 누를 곳과 결과가 같은 자리에 있어야 "여기를 눌러 찍고,
 * 찍힌 시각이 여기 남는다"가 한 번에 읽힌다. 찍은 뒤에도 계속 누를 수 있다(마지막 시각이
 * 그날의 기록이다).
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
    <DashboardRowButton
      icon={icon}
      label={label}
      active={done}
      disabled={disabled}
      onClick={onClick}
      // 찍히지 않은 자리는 비워 둔다. `--:--:--`로 채우면 값이 없다는 사실을 알리는 대신
      // 값이 있는 칸과 같은 무게의 글자가 하나 더 서서, 두 줄 중 어디에 시각이 있는지를
      // 눈이 한 번 더 가려야 한다.
      trailing={
        at && (
          <span className="text-body-sm font-semibold tabular-nums text-gray-900">
            {dayjs(at).format('HH:mm:ss')}
          </span>
        )
      }
    />
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
 * 왼쪽도 오른쪽과 같은 상자다. 안쪽 요소 셋이 테두리 없이 떠 있으면 오른쪽 칸들과 무게가
 * 달라 한 카드 안에서 서로 다른 층으로 보인다. 높이는 오른쪽 열 전체에 맞춰 늘어난다.
 *
 * 찍는 버튼은 둘뿐이다. 외출·회의·외근·조퇴는 일과의 분류이지 근태 상태가 아니라, 이 원장이
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

  /**
   * 근무지 — 지금 출근을 찍으면 어디로 기록되는가.
   *
   * 고른 값이 없으면 오늘 기록의 근무지를 따른다. 이미 찍은 뒤에도 이 버튼은 살아 있어(다시
   * 찍으면 그 값으로 덮인다) 기본값이 기록과 어긋나 있으면 다시 찍는 순간 근무지가 조용히
   * 바뀐다. 외부근무를 허용하지 않는 근무 기준이면 고를 것이 없으므로 사내로 고정한다 —
   * 화면이 막는 것은 표시일 뿐이고 실제 거절은 RPC가 한다.
   */
  const [placeChoice, setPlaceChoice] = useState<AttendancePlace | null>(null)
  const place: AttendancePlace = policy?.allowExternal
    ? (placeChoice ?? today?.workPlace ?? 'INTERNAL')
    : 'INTERNAL'

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
    <Card
      /* 현황 배지는 제목에 딸려 붙인다 — 이 카드 전체가 무엇에 관한 상태인지를 말하는 값이라,
         제목에서 떨어져 우측 액션 쪽에 서면 옆의 이동 버튼과 같은 무리로 읽힌다. 헤더 우측은
         '어디로 가는가'(근태현황) 하나만 남긴다. */
      title={
        <span className="flex flex-wrap items-center gap-2">
          근무체크
          <Badge tone={progress.tone}>{progress.label}</Badge>
          {ledgerBadge && <Badge tone={ledgerBadge.tone}>{ledgerBadge.label}</Badge>}
        </span>
      }
      actions={
        /* 내 근태 현황으로 가는 자리. 갈 곳(본인 월간 뷰)은 아직 없으므로 버튼만 세워 둔다 —
           연결되기 전까지 눌러도 아무 일이 없다. 대시보드 우측 열에서 나란히 서는 다른 이동
           버튼(환영 카드 '내 메뉴')과 같은 outline 규격을 쓴다. */
        <Button variant="outline">근태현황</Button>
      }
    >
      <div className="grid grid-cols-5 items-stretch gap-2">
        {/* 왼쪽(2/5) — 지금이 언제인가. 오른쪽 열과 같은 상자·같은 높이.
            세 줄을 위아래로 벌리지 않고 가운데에 모은다 — 오른쪽이 더 길어 남는 높이가
            생기는데, 그 여백을 줄 사이에 나눠 주면 세 줄이 서로 무관한 조각처럼 흩어진다. */}
        {/* 세 줄 모두 한 단계씩 키운다(캡션 12 → 본문 14, 시계 20 → 24). 카드 안 표준 본문이
            14px이므로 날짜·기준 시각이 캡션에 머물면 이 상자만 주석처럼 물러나 보인다. */}
        <div className="col-span-2 flex flex-col justify-center gap-2 rounded-radius-md border border-gray-200 bg-white px-3 py-2">
          <p className="text-body font-medium text-gray-800">
            {now.format('M월 D일')} ({WEEKDAY_LABELS[now.day()]})
          </p>
          <p className="text-title-md font-bold leading-none tabular-nums text-gray-900">
            {now.format('HH:mm:ss')}
          </p>
          {benchmark && (
            /* 라벨과 값은 크기를 가르지 않고 색으로만 나눈다(한 줄 안에서 크기로 위계를
               만들지 않는다는 규격 원칙). */
            <p className="text-body text-gray-600">
              {benchmark.label}{' '}
              <span className="tabular-nums font-medium text-gray-800">{benchmark.value}</span>
            </p>
          )}
        </div>

        {/* 오른쪽(3/5) — 무엇을 하는가. */}
        <div className="col-span-3 space-y-2">
          {/* 근무지는 출근 버튼 바로 위에 둔다 — 이 토글은 '지금 누르면 어디로 찍히는가'만
              말한다. 선택지가 하나뿐인 근무 기준에서는 아예 세우지 않는다 — 고를 수 없는
              선택지는 질문이 아니다. */}
          {policy?.allowExternal && (
            <SegmentedToggle
              label="근무지"
              block
              options={(Object.keys(PLACE_LABELS) as AttendancePlace[]).map((p) => ({
                key: p,
                label: PLACE_LABELS[p],
              }))}
              value={place}
              onChange={setPlaceChoice}
              disabled={busy || !isWorkday}
            />
          )}
          <StampButton
            icon={<LogIn className="size-4" />}
            /**
             * 라벨의 괄호는 **찍힌 결과**다 — 토글(앞으로 어디로 찍힐지)이 아니라 오늘 기록에
             * 남은 근무지를 적는다. 토글을 따라 라벨이 움직이면 찍기 전과 찍은 뒤가 같은 말을
             * 하게 되어, 내가 최종으로 어디로 출근했는지 이 카드가 답하지 못한다.
             * 찍기 전에는 결과가 없으므로 괄호도 없다. 근무지를 고를 수 없는 근무 기준이면
             * 값이 언제나 사내 하나뿐이라 적지 않는다.
             */
            label={
              checkedIn && policy?.allowExternal && today?.workPlace
                ? `출근(${PLACE_SHORT_LABELS[today.workPlace]})`
                : '출근하기'
            }
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
