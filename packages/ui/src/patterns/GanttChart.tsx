import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { koreanHolidayName } from '../utils/koreanHolidays'

const DAY = 86_400_000
const HEADER_H = 46 // 월 행(26) + 일/주 행(20)
const BAR_H = 24

/** 'YYYY-MM-DD' → UTC 자정 ms(타임존 드리프트 방지). 형식이 아니면 NaN. */
const parseDay = (s: string) =>
  Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
const startOfMonth = (ms: number) => {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}
const nextMonth = (ms: number) => {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}
const mmdd = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}
/** UTC 자정 ms → 'YYYY-MM-DD' 날짜 키(공휴일 조회용). */
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** 총 일수에 맞춘 하루 픽셀 폭. 짧은 일정은 넓게, 긴 일정은 좁혀 가로 스크롤로 수용한다. */
function dayWidth(totalDays: number): number {
  if (totalDays <= 31) return 34
  if (totalDays <= 92) return 22
  if (totalDays <= 183) return 13
  if (totalDays <= 366) return 8
  return 5
}

/** 간트 한 줄. 날짜는 'YYYY-MM-DD'이며 하루짜리는 start와 end를 같게 준다. */
export interface GanttRow {
  key: string
  /** 좌측 고정 라벨 칸의 내용. 업무 도메인(아이콘·상태 태그 등)은 호출부가 그린다. */
  label: ReactNode
  start: string
  end: string
  /** 막대 배경 클래스. 상태별 팔레트는 호출부가 소유한다. */
  barClass?: string
  /** 막대·라벨의 툴팁. */
  title?: string
  /** 막대·라벨 클릭. 없으면 클릭 대상이 아닌 정적 행으로 그린다. */
  onClick?: () => void
}

export interface GanttChartProps {
  rows: GanttRow[]
  /** 좌측 고정 컬럼의 머리글(예: 모듈 · 일정). */
  labelHeader: string
  /** 좌측 고정 컬럼 폭(px). */
  labelWidth?: number
  /** 한 줄 높이(px). */
  rowHeight?: number
  /** 그릴 행이 하나도 없을 때의 안내. */
  emptyText?: ReactNode
  /** 축 아래에 덧붙일 내용(예: 일정 미등록 항목 나열). */
  footer?: ReactNode
  className?: string
}

/**
 * 간트 차트(기간 막대) 공용 부품. 월·일(또는 주) 2단 축과 격자, 주말·공휴일 음영, 오늘
 * 기준선을 그리고 좌측 라벨 컬럼을 가로 스크롤에도 고정한다.
 *
 * **무엇을 그릴지는 호출부가, 어떻게 그릴지는 이 부품이 소유한다** — 모듈 운영 기간(WORKS
 * 프로그램 탭)과 사업 일정안내(WORKS·GUEST)가 같은 축·같은 눈금으로 서야 하기 때문이다.
 * 축 계산을 화면마다 따로 두면 같은 사업의 같은 달이 화면마다 다른 폭으로 그려진다.
 */
export function GanttChart({
  rows,
  labelHeader,
  labelWidth = 216,
  rowHeight = 44,
  emptyText,
  footer,
  className,
}: GanttChartProps) {
  const items = rows
    .map((row) => ({ row, start: parseDay(row.start), end: parseDay(row.end) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  if (items.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        {emptyText && (
          <p className="rounded-radius-md border border-dashed border-gray-300 py-8 text-center text-body text-gray-600">
            {emptyText}
          </p>
        )}
        {footer}
      </div>
    )
  }

  const min = Math.min(...items.map((r) => r.start))
  const max = Math.max(...items.map((r) => r.end))
  const rangeStart = startOfMonth(min)
  const rangeEnd = nextMonth(max) // 배타적 끝(마지막 항목이 속한 달의 다음 달 1일)
  const totalDays = Math.round((rangeEnd - rangeStart) / DAY)
  const dayW = dayWidth(totalDays)
  // 타임라인 최소 폭(px): 이보다 좁아지면 가로 스크롤. 넓은 화면에서는 flex-1로 늘어나 여백을 없앤다.
  const minTimelineW = totalDays * dayW
  const days = (ms: number) => (ms - rangeStart) / DAY
  // 축·막대는 전체 기간 대비 비율로 배치해, 컨테이너 폭이 늘면 함께 늘어난다.
  const pct = (d: number) => `${(d / totalDays) * 100}%`

  // 월 세그먼트(라벨·시작 비율·폭 비율).
  const months: { key: number; label: string; left: string; width: string }[] = []
  for (let m = rangeStart; m < rangeEnd; m = nextMonth(m)) {
    const end = Math.min(nextMonth(m), rangeEnd)
    const d = new Date(m)
    months.push({
      key: m,
      label: `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      left: pct(days(m)),
      width: pct((end - m) / DAY),
    })
  }

  // 일 격자·음영·라벨용 날짜 셀. 각 날의 요일/공휴일을 판정한다(off = 토·일·공휴일).
  const dayCells = [] as {
    ms: number
    i: number // rangeStart 기준 일 인덱스(= days 값)
    dow: number // 0=일 … 6=토
    holiday: string | null
    off: boolean
  }[]
  for (let ms = rangeStart, i = 0; ms < rangeEnd; ms += DAY, i += 1) {
    const dow = new Date(ms).getUTCDay()
    const holiday = koreanHolidayName(dateKey(ms))
    dayCells.push({ ms, i, dow, holiday, off: dow === 0 || dow === 6 || Boolean(holiday) })
  }
  // 일 단위 격자·음영은 하루 폭이 충분할 때만(과밀·성능 방지). 좁으면 주 단위로 대체한다.
  const showDays = dayW >= 8
  // 일자 라벨 간격: 하루 폭에 맞춰 겹치지 않도록 1·2·3일 간격으로 성긴다.
  const dayLabelStep = dayW >= 16 ? 1 : dayW >= 11 ? 2 : 3

  // 주 격자(월요일 정렬) — 일 단위가 과밀한 장기 일정의 대체 눈금.
  const firstDay = new Date(rangeStart).getUTCDay() // 0=일 … 6=토
  const firstMonday = rangeStart + ((8 - firstDay) % 7) * DAY
  const weeks: number[] = []
  for (let w = firstMonday; w < rangeEnd; w += 7 * DAY) weeks.push(w)

  // 오늘 기준선(범위 내일 때만).
  const todayMs = parseDay(new Date().toISOString().slice(0, 10))
  const todayInRange = todayMs >= rangeStart && todayMs < rangeEnd

  return (
    <div className={cn('space-y-3', className)}>
      <div className="overflow-x-auto rounded-radius-md border border-gray-200 bg-white">
        <div className="flex" style={{ minWidth: labelWidth + minTimelineW }}>
          {/* 좌측 고정 라벨 컬럼 */}
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white"
            style={{ width: labelWidth }}
          >
            <div
              className="flex items-end border-b border-gray-200 px-3 pb-1.5 text-caption text-gray-700"
              style={{ height: HEADER_H }}
            >
              {labelHeader}
            </div>
            {items.map(({ row }) =>
              row.onClick ? (
                <button
                  key={row.key}
                  type="button"
                  onClick={row.onClick}
                  className="flex w-full items-center gap-2 border-b border-gray-100 px-3 text-left transition-colors duration-fast hover:bg-gray-25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
                  style={{ height: rowHeight }}
                  title={row.title}
                >
                  {row.label}
                </button>
              ) : (
                <div
                  key={row.key}
                  className="flex w-full items-center gap-2 border-b border-gray-100 px-3"
                  style={{ height: rowHeight }}
                  title={row.title}
                >
                  {row.label}
                </div>
              ),
            )}
          </div>

          {/* 타임라인(flex-1: 넓은 화면에선 늘어나 여백 제거, 좁으면 최소폭에서 스크롤) */}
          <div className="relative min-w-0 flex-1">
            {/* 격자·주말/공휴일 음영·오늘선(헤더+행 전체 높이) */}
            <div className="pointer-events-none absolute inset-0">
              {showDays ? (
                <>
                  {/* 주말·공휴일 음영(일·공휴일=브랜드 톤, 토=인포 톤) */}
                  {dayCells
                    .filter((c) => c.off)
                    .map((c) => (
                      <div
                        key={`off-${c.ms}`}
                        className={`absolute bottom-0 top-0 ${
                          c.holiday || c.dow === 0 ? 'bg-brand-25' : 'bg-info-subtle'
                        }`}
                        style={{ left: pct(c.i), width: pct(1) }}
                      />
                    ))}
                  {/* 일 단위 격자 */}
                  {dayCells.map(
                    (c) =>
                      c.i > 0 && (
                        <div
                          key={`dg-${c.ms}`}
                          className="absolute bottom-0 top-0 border-l border-gray-100"
                          style={{ left: pct(c.i) }}
                        />
                      ),
                  )}
                </>
              ) : (
                weeks.map((w) => (
                  <div
                    key={`wk-${w}`}
                    className="absolute bottom-0 top-0 border-l border-gray-100"
                    style={{ left: pct(days(w)) }}
                  />
                ))
              )}
              {months.map((m) => (
                <div
                  key={`ml-${m.key}`}
                  className="absolute bottom-0 top-0 border-l border-gray-200"
                  style={{ left: m.left }}
                />
              ))}
            </div>

            {/* 2단 축(월 / 일·주) */}
            <div className="relative border-b border-gray-200" style={{ height: HEADER_H }}>
              <div className="relative h-[26px]">
                {months.map((m) => (
                  <span
                    key={`mh-${m.key}`}
                    className="absolute top-0 truncate px-2 py-1 text-caption font-semibold tabular-nums text-gray-800"
                    style={{ left: m.left, width: m.width }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="relative h-5">
                {showDays
                  ? dayCells
                      .filter((c) => c.i % dayLabelStep === 0)
                      .map((c) => (
                        <span
                          key={`dh-${c.ms}`}
                          className={`absolute top-0 flex justify-center text-caption font-medium tabular-nums ${
                            c.holiday || c.dow === 0
                              ? 'text-brand'
                              : c.dow === 6
                                ? 'text-info'
                                : 'text-gray-900'
                          }`}
                          style={{ left: pct(c.i), width: pct(1) }}
                          title={c.holiday ?? undefined}
                        >
                          {new Date(c.ms).getUTCDate()}
                        </span>
                      ))
                  : weeks.map((w) => (
                      <span
                        key={`wh-${w}`}
                        className="absolute top-0 pl-1 text-caption tabular-nums text-gray-800"
                        style={{ left: pct(days(w)) }}
                      >
                        {mmdd(w)}
                      </span>
                    ))}
              </div>
            </div>

            {/* 막대 행 */}
            {items.map(({ row, start, end }) => {
              const durationDays = Math.round((end - start) / DAY) + 1
              const estPx = durationDays * dayW // 최소 스케일 기준 예상 px(라벨 노출 판단)
              const barLabel =
                estPx >= 116 ? (
                  <span className="truncate px-2 text-caption font-medium tabular-nums text-white/95">
                    {durationDays === 1 ? mmdd(start) : `${mmdd(start)} ~ ${mmdd(end)}`}
                  </span>
                ) : estPx >= 44 ? (
                  <span className="truncate px-1.5 text-caption font-medium tabular-nums text-white/95">
                    {durationDays}일
                  </span>
                ) : null
              const barStyle = {
                left: pct(days(start)),
                width: pct(durationDays),
                minWidth: 6,
                top: (rowHeight - BAR_H) / 2,
                height: BAR_H,
              }
              const barClass = `absolute flex items-center overflow-hidden rounded-radius-sm text-left ${row.barClass ?? 'bg-gray-300'}`
              return (
                <div
                  key={row.key}
                  className="relative border-b border-gray-100"
                  style={{ height: rowHeight }}
                >
                  {row.onClick ? (
                    <button
                      type="button"
                      onClick={row.onClick}
                      className={`${barClass} transition-opacity duration-fast hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10`}
                      style={barStyle}
                      title={row.title}
                    >
                      {barLabel}
                    </button>
                  ) : (
                    <div className={barClass} style={barStyle} title={row.title}>
                      {barLabel}
                    </div>
                  )}
                </div>
              )
            })}

            {/* 오늘 기준선 — 막대 위에 그려 항상 보이게 한다(그리드/막대 레이어 이후 배치). */}
            {todayInRange && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-2 border-brand"
                style={{ left: pct(days(todayMs)) }}
              >
                <span className="absolute top-1.5 left-0.5 rounded-radius-sm bg-brand px-1.5 py-0.5 text-caption font-semibold leading-none text-white">
                  오늘
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {footer}
    </div>
  )
}
