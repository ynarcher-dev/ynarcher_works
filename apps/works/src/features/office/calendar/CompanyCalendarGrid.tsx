import { cn } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { DATE_KEY, WEEKDAYS } from '@/features/hub/calendarGrid'
import type { CalendarView } from '@/features/hub/calendarView'
import { eventDot } from '@/features/hub/eventStyle'
import { parseEventMeta, type SystemEvent } from '@/features/hub/hooks'

/** 칸에 제목까지 세우는 줄 수. 넘치면 날짜 줄 우측에 `+N`으로 알리고 전부는 우측 패널이 답한다. */
const ROWS_PER_CELL = 3

/**
 * 격자 위·아래가 쓰는 세로 자리(상단바 4 + 본문 여백 3 + 페이지 제목 2.8 + 간격 1.25 + 달 이동 줄
 * 2.5 + 간격 0.75 + 카드 안 여백 2.5 + 요일 머리줄 1.5 + 칸 사이 간격 1.5 ≈ 19.8rem). 넉넉히 잡아
 * 모자라는 쪽(스크롤)보다 남는 쪽(카드 아래 빈자리)으로 틀리게 둔다.
 */
const CHROME_REM = 20.5

/** 칸이 아무리 좁아져도 날짜와 한 줄은 보이는 하한. */
const MIN_ROW_REM = 3

/** 칸 안의 일정 한 줄 — 점 + 시각(종일이면 생략) + 제목. */
function CellEvent({ ev }: { ev: SystemEvent }) {
  const { allDay } = parseEventMeta(ev.body)
  const time = !allDay && ev.starts_at ? dayjs(ev.starts_at).format('HH:mm') : null
  return (
    <span className="flex items-center gap-1 text-caption" title={ev.title}>
      <span className={cn('size-1.5 shrink-0 rounded-full', eventDot(ev.event_type))} />
      {time && <span className="shrink-0 tabular-nums text-gray-500">{time}</span>}
      <span className="truncate text-gray-800">{ev.title}</span>
    </span>
  )
}

/**
 * 넓은 자리의 월간 그리드 — 한 칸에 제목까지 세운다.
 *
 * 좁은 배치(우측 슬라이드오버)와 가르는 것은 **칸이 답하는 범위**다: 거기서는 색 바만 세워 '있다'를
 * 말하고 제목은 아래 상세가 답하지만, 여기서는 달 전체를 한눈에 읽는 것이 이 화면의 일이라 칸이
 * 제목을 든다.
 *
 * **칸 높이는 데이터가 아니라 뷰포트가 정한다**(2026-09-11 사용자 지적 두 번).
 *
 * 처음에는 고정 하한(`min-h`)이었다 — 일정이 셋 이상인 날만 칸이 늘어나 같은 줄의 이웃 칸까지 함께
 * 키웠고, 6주짜리 달에서는 그 때문에 페이지에 스크롤이 생겼다. 그래서 `1fr`로 바꿨더니 이번엔 격자
 * 높이가 **내용에서 역산**됐다: 부모가 뷰포트에 묶인 높이를 주지 못하면(본문 영역이 `min-h-screen`
 * 위에서 내용만큼 자란다) `h-full`은 auto로 풀리고, auto인 격자에서 `1fr`은 '남는 자리를 나눈 몫'이
 * 아니라 '내용만큼'이 된다 — 고친 줄 알았던 처음 증상이 그대로 돌아온다.
 *
 * 그래서 높이를 **화면에서 직접 잰다**(`(100vh - 고정 여백) / 주 수`). 부모 체인이 높이를 주든 말든
 * 값이 같고, 칸에 무엇이 들어 있든 같다. 주 수가 5냐 6이냐는 달이 정하므로 나누는 수도 달이 정한다.
 *
 * 그래서 칸을 넘는 일정은 **날짜 줄 우측**에서 `+N`으로 알린다. 아래에 붙이면 칸이 짧아진 달에서
 * 그 줄부터 잘려 나가, 하필 '더 있다'는 사실만 보이지 않게 된다.
 */
export function CompanyCalendarGrid({ view }: { view: CalendarView }) {
  return (
    <div
      className="grid grid-cols-7 gap-1"
      // 주 수가 달마다 달라 클래스로 적을 수 없다(머리줄 auto + 주마다 같은 높이).
      style={{
        gridTemplateRows: `auto repeat(${view.weeks.length}, minmax(0, max(${MIN_ROW_REM}rem, calc((100vh - ${CHROME_REM}rem) / ${view.weeks.length}))))`,
      }}
    >
      {WEEKDAYS.map((w, i) => (
        <div
          key={w}
          className={cn(
            'py-1 text-center text-caption font-semibold',
            i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-700',
          )}
        >
          {w}
        </div>
      ))}
      {view.weeks.flat().map((day) => {
        const key = day.format(DATE_KEY)
        const inMonth = day.isSame(view.month, 'month')
        const isToday = day.isSame(view.today, 'day')
        const isSelected = key === view.selected
        const dayEvents = view.byDate.get(key) ?? []
        const shown = dayEvents.slice(0, ROWS_PER_CELL)
        const hidden = dayEvents.length - shown.length

        return (
          <button
            type="button"
            key={key}
            onClick={() => view.select(key)}
            className={cn(
              'flex min-h-0 flex-col gap-1 overflow-hidden rounded-radius-sm border p-1.5 text-left transition-colors duration-fast',
              isSelected
                ? 'border-info-border bg-info-subtle/60'
                : cn('border-gray-200 hover:bg-gray-25', inMonth ? 'bg-white' : 'bg-gray-25/60'),
            )}
          >
            <span className="flex shrink-0 items-center justify-between gap-1">
              <span
                className={cn(
                  'text-caption tabular-nums',
                  isToday
                    ? 'grid h-5 w-5 place-items-center rounded-full bg-brand font-bold text-gray-0'
                    : inMonth
                      ? 'text-gray-700'
                      : 'text-gray-400',
                )}
              >
                {day.date()}
              </span>
              {hidden > 0 && <span className="text-caption text-gray-500">+{hidden}</span>}
            </span>
            {/* 칸 안의 줄은 제목을 담으므로 넘치는 폭은 자르고(truncate) 칸 밖으로 밀지 않는다. */}
            <span className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
              {shown.map((ev) => (
                <CellEvent key={ev.id} ev={ev} />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
