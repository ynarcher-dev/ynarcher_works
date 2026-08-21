import { Badge, Button, Card, SegmentedToggle, cardText, cn, useToast, type BadgeTone } from '@ynarcher/ui'
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
  tag,
  at,
  done,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  /** 이 스탬프를 평하는 배지 하나. 찍히기 전에는 없다. */
  tag?: ReactNode
  at: string | null
  done: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <DashboardRowButton
      icon={icon}
      label={label}
      tag={tag}
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
   * 근무 현황 태그 — **찍은 버튼 위에, 한 버튼에 하나씩**(2026-08-21).
   *
   * 예전에는 카드 제목 옆에 진행 상태와 원장 상태를 나란히 달았다. 그러면 배지 둘이 카드
   * 전체를 설명하는 값처럼 보이는데, 정작 둘이 가리키는 것은 각각 다른 스탬프다 — '지각'은
   * 출근에 관한 말이고 '조기퇴근'은 퇴근에 관한 말이라, 제목 옆에 모아 두면 어느 기록이
   * 문제였는지 눈이 버튼까지 되짚어 내려가야 한다.
   *
   * 그래서 규칙을 하나로 정한다. **태그는 그 버튼이 남긴 기록을 평한다.**
   *
   * * 찍히지 않은 버튼에는 태그가 없다. 아직 일어나지 않은 일에 평할 것이 없다.
   * * 한 버튼에 하나만 붙는다. 두 개가 필요하면 그중 하나는 다른 버튼의 몫이다.
   * * '휴무'·'미출근'은 태그로 세우지 않는다. 근무일이 아니면 왼쪽 기준 줄이 이미 '근무일
   *   아님'이라 말하고, 출근 전임은 비어 있는 출근 버튼이 그 자체로 말한다.
   *
   * 원장 상태 코드는 하루에 하나지만 담긴 사실은 둘일 수 있다(`LATE_EARLY` = 지각 + 조기퇴근).
   * 그래서 코드에서 **사실을 분리해** 각 버튼으로 나눠 보내고, 라벨·색은 여전히 상태 원장에서
   * 가져온다(`LATE`·`EARLY_LEAVE` 행). 상태 이름이나 톤을 화면에 적어 두지 않으므로 원장에서
   * 라벨을 고치면 여기도 함께 따라온다.
   */
  const code = today?.statusCode ?? null
  const isLate = code === 'LATE' || code === 'LATE_EARLY'
  const isEarly = code === 'EARLY_LEAVE' || code === 'LATE_EARLY'

  /**
   * 규칙이 자동으로 매기는 근무 코드 5종. 이 밖의 상태(연차·반차·공가처럼 관리자가 지정한
   * 것)는 스탬프가 아니라 **하루 전체**를 설명하는 값이라, 첫 스탬프인 출근 버튼에 세운다.
   */
  const AUTO_CODES = ['NORMAL', 'LATE', 'EARLY_LEAVE', 'LATE_EARLY', 'ABSENT']
  const ledger = statusOf(statuses ?? [], code)
  const dayStatus = ledger && !AUTO_CODES.includes(ledger.code) ? ledger : null

  const lateStatus = statusOf(statuses ?? [], 'LATE')
  const earlyStatus = statusOf(statuses ?? [], 'EARLY_LEAVE')

  /**
   * 출근 버튼의 태그 — 우선순위대로 하나.
   * ① 하루를 규정하는 상태(연차 등) → ② 지각 → ③ 아직 퇴근 전이면 '근무중'.
   * 정상 출근이고 퇴근까지 찍었으면 붙일 말이 없다(그 날의 평은 퇴근 버튼에 있다).
   */
  const inTag: { label: string; tone: BadgeTone } | null = !checkedIn
    ? null
    : dayStatus
      ? { label: dayStatus.label, tone: dayStatus.tone }
      : isLate && lateStatus
        ? { label: lateStatus.label, tone: lateStatus.tone }
        : checkedOut
          ? null
          : { label: '근무중', tone: 'success' }

  /** 퇴근 버튼의 태그 — 조기퇴근이면 그 말, 아니면 제때 마쳤다는 표시 하나. */
  const outTag: { label: string; tone: BadgeTone } | null = !checkedOut
    ? null
    : isEarly && earlyStatus
      ? { label: earlyStatus.label, tone: earlyStatus.tone }
      : { label: '퇴근', tone: 'neutral' }

  return (
    <Card
      /* 제목에는 배지를 달지 않는다 — 현황 태그는 그것을 만든 스탬프 버튼 위에 선다.
         헤더 우측은 '어디로 가는가'(근태현황) 하나만 남긴다. */
      title="근무체크"
      actions={
        /* 내 근태 현황으로 가는 자리. 갈 곳(본인 월간 뷰)은 아직 없으므로 버튼만 세워 둔다 —
           연결되기 전까지 눌러도 아무 일이 없다. 대시보드 우측 열에서 나란히 서는 다른 이동
           버튼(환영 카드 '내 메뉴')과 같은 outline 규격을 쓴다. */
        <Button variant="outline">근태현황</Button>
      }
    >
      <div className="grid grid-cols-5 items-stretch gap-2">
        {/* 왼쪽(2/5) — 지금이 언제인가. 오른쪽 열과 같은 상자·같은 높이.
            내용은 가운데에 모은다 — 오른쪽이 더 길어 남는 높이가 생기는데, 그 여백을 줄
            사이에 나눠 주면 줄들이 서로 무관한 조각처럼 흩어진다.
            글자는 캡션이 아니라 본문 단계에 세운다(시계만 24px). 카드 안 표준 본문이 14px
            이므로 날짜·기준 시각이 캡션에 머물면 이 상자만 주석처럼 물러나 보인다. */}
        <div className="col-span-2 flex flex-col justify-center rounded-radius-md border border-gray-200 bg-white px-3 py-2.5">
          {/* 날짜와 시계는 한 묶음이라 붙여 세운다 — 둘이 함께 '지금'이라는 한 가지를 말한다.
              날짜는 시계의 머리말이므로 라벨 단계(gray-500)로 물러난다. 셋을 모두 gray-900으로
              두면 세 줄이 같은 무게로 서서 어느 것이 주인공인지 갈리지 않는다. */}
          <p className={cardText.label}>
            {now.format('M월 D일')} ({WEEKDAY_LABELS[now.day()]})
          </p>
          <p className="mt-1 text-title-md font-bold leading-none tabular-nums text-gray-900">
            {now.format('HH:mm:ss')}
          </p>
          {benchmark && (
            /* 기준 시각은 '지금'과 다른 질문(언제까지인가)이라 선으로 끊는다. 균등한 gap으로
               세 줄을 벌려 두면 서로 무관한 조각처럼 흩어져, 어느 줄과 어느 줄이 한 쌍인지
               읽히지 않는다.

               라벨과 값은 크기를 가르지 않고 색으로만 나눈다(한 줄 안에서 크기로 위계를
               만들지 않는다는 규격 원칙). 값을 오른쪽 끝에 붙이는 것은 오른쪽 열의 찍힌
               시각과 같은 규칙이다 — 이 카드에서 시각은 언제나 자기 상자의 오른쪽 끝에 선다. */
            <p className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-gray-200 pt-2.5">
              <span className={cardText.label}>{benchmark.label}</span>
              <span className={cn('tabular-nums font-medium', cardText.value)}>
                {benchmark.value}
              </span>
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
            tag={inTag && <Badge tone={inTag.tone}>{inTag.label}</Badge>}
            at={today?.checkInAt ?? null}
            done={checkedIn}
            disabled={busy || !isWorkday}
            onClick={() => void punchIn()}
          />
          <StampButton
            icon={<LogOut className="size-4" />}
            label="퇴근하기"
            tag={outTag && <Badge tone={outTag.tone}>{outTag.label}</Badge>}
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
