import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { iconScale } from '../densityScale'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 날짜 키 포맷(`YYYY-MM-DD`). 문자열 비교만으로 대소·동일 판정이 가능하다. */
const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** `YYYY-MM` 또는 `YYYY-MM-DD` 문자열을 해당 월 1일의 Date로 변환한다. */
function monthStart(month: string): Date {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
}

/** 월 그리드(일요일 시작·6주 고정). 높이가 달마다 변하지 않도록 항상 42칸을 채운다. */
function buildDays(month: string): Date[] {
  const first = monthStart(month)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/** 날짜별 표시 메타. 색상 클래스는 호출부(업무 도메인)가 정한다. */
export interface CalendarDayMeta {
  /** 날짜 하단 기간 바의 배경 클래스 목록(최대 3개까지 노출). */
  bars?: string[]
  /** 날짜 옆 점 표시(해당일 일정 존재). */
  dot?: boolean
}

export interface MonthCalendarProps {
  /** 표시 월 — `YYYY-MM` 또는 `YYYY-MM-DD`. */
  month: string
  /** 월 이동 핸들러. 미지정 시 이동 네비게이션을 숨긴다. */
  onMonthChange?: (month: string) => void
  /** 선택 날짜 — `YYYY-MM-DD`. */
  selected?: string
  onSelect?: (dateKey: string) => void
  /** 오늘 날짜(테스트 고정용). 미지정 시 실제 오늘. */
  today?: string
  /** 선택 가능 범위. 밖의 날짜는 비활성(회색) 처리한다. */
  minDate?: string | null
  maxDate?: string | null
  /** 날짜별 바·점 메타 조회. */
  getDayMeta?: (dateKey: string) => CalendarDayMeta | undefined
  /** 이전/다음 월 아이콘(앱에서 주입). 미지정 시 화살표 문자로 대체한다. */
  prevIcon?: ReactNode
  nextIcon?: ReactNode
  className?: string
}

/** 월 이동 네비게이션(이전/월 라벨/다음). */
function MonthNav({
  month,
  onMonthChange,
  prevIcon,
  nextIcon,
}: {
  month: string
  onMonthChange: (month: string) => void
  prevIcon?: ReactNode
  nextIcon?: ReactNode
}) {
  const first = monthStart(month)
  const shift = (delta: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + delta, 1)
    onMonthChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  const navClass =
    'grid ' + iconScale.card.box + ' place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800'
  return (
    <div className="mb-3 flex items-center justify-center gap-1">
      <button
        type="button"
        aria-label="이전 달"
        onClick={() => shift(-1)}
        className={navClass}
      >
        {prevIcon ?? '‹'}
      </button>
      <span className="min-w-[6.5rem] text-center text-body font-semibold text-gray-900">
        {`${first.getFullYear()}년 ${first.getMonth() + 1}월`}
      </span>
      <button
        type="button"
        aria-label="다음 달"
        onClick={() => shift(1)}
        className={navClass}
      >
        {nextIcon ?? '›'}
      </button>
    </div>
  )
}

/**
 * 월간 캘린더(컴팩트 셀: 날짜 + 기간 바 + 일정 점).
 * 데이터 조회를 하지 않고 `getDayMeta`로 표시 메타만 받아 그리므로,
 * AC 통합 타임라인·M&A 딜 일정·프로젝트 일정 등 어디에서나 재사용할 수 있다.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  today,
  minDate,
  maxDate,
  getDayMeta,
  prevIcon,
  nextIcon,
  className,
}: MonthCalendarProps) {
  const todayKey = today ?? keyOf(new Date())
  const monthPrefix = `${monthStart(month).getFullYear()}-${pad(monthStart(month).getMonth() + 1)}`
  const days = buildDays(month)

  return (
    <div className={className}>
      {onMonthChange && (
        <MonthNav
          month={month}
          onMonthChange={onMonthChange}
          prevIcon={prevIcon}
          nextIcon={nextIcon}
        />
      )}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn(
              'py-1 text-center text-caption font-semibold',
              i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-600',
            )}
          >
            {w}
          </div>
        ))}
        {days.map((day) => {
          const key = keyOf(day)
          const inMonth = key.startsWith(monthPrefix)
          const isToday = key === todayKey
          const isSelected = key === selected
          // 문자열 사전순 비교로 범위 판정(두 값 모두 `YYYY-MM-DD` 고정폭).
          const disabled =
            (minDate != null && key < minDate) || (maxDate != null && key > maxDate)
          const meta = getDayMeta?.(key)
          return (
            <button
              type="button"
              key={key}
              disabled={disabled}
              onClick={() => onSelect?.(key)}
              className={cn(
                'flex min-h-[3.25rem] flex-col gap-1 rounded-radius-sm border p-1 text-left transition-colors duration-fast',
                disabled
                  ? 'cursor-not-allowed border-gray-100 bg-gray-50/60'
                  : isSelected
                    ? 'border-info-border bg-info-subtle/60'
                    : cn(
                        'border-gray-200 hover:bg-gray-25',
                        inMonth ? 'bg-white' : 'bg-gray-25/60',
                      ),
              )}
            >
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    'text-caption tabular-nums',
                    disabled
                      ? 'text-gray-300'
                      : isToday
                        ? 'grid h-5 w-5 place-items-center rounded-full bg-brand font-bold text-gray-0'
                        : inMonth
                          ? 'text-gray-700'
                          : 'text-gray-300',
                  )}
                >
                  {day.getDate()}
                </span>
                {meta?.dot && (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                {(meta?.bars ?? []).slice(0, 3).map((barClass, i) => (
                  <span
                    key={`${key}-${i}`}
                    className={cn('h-1 rounded-full', barClass || 'bg-gray-300')}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 선택 날짜 상세 목록 박스(캘린더 하단). 항목 구성은 호출부가 결정한다. */
export function CalendarDayDetail({
  children,
  emptyText = '선택한 날짜에 등록된 일정이 없습니다.',
  isEmpty = false,
}: {
  children?: ReactNode
  emptyText?: string
  isEmpty?: boolean
}) {
  return (
    <div className="mt-3 rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2.5">
      {isEmpty ? (
        <p className="text-caption text-gray-500">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </div>
  )
}
