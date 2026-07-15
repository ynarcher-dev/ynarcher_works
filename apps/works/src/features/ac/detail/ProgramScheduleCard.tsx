import { Badge } from '@ynarcher/ui'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { ExpandAction } from '@/features/ac/detail/PanelExpandAction'
import { MODULE_TYPES } from '@/features/ac/config'
import { useProgramModules, type Program } from '@/features/ac/hooks'
import { useTimelineItems, type TimelineItem } from '@/features/ac/detail/detailHooks'
import { MODULE_BAR_CLASS, moduleStatusMeta } from '@/features/ac/detail/moduleMeta'
import {
  DATE_KEY,
  barsOnDate,
  buildWeeks,
  itemsOnDate,
  timelineRangeLabel,
  toModuleBars,
  type ModuleBar,
} from '@/features/ac/detail/scheduleCompute'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type

/** 월 이동 네비게이션(이전/이번달 라벨/다음). */
function MonthNav({
  month,
  onPrev,
  onNext,
}: {
  month: Dayjs
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="mb-3 flex items-center justify-center gap-1">
      <button
        type="button"
        aria-label="이전 달"
        onClick={onPrev}
        className="grid h-7 w-7 place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[6.5rem] text-center text-body font-semibold text-gray-900">
        {month.format('YYYY년 M월')}
      </span>
      <button
        type="button"
        aria-label="다음 달"
        onClick={onNext}
        className="grid h-7 w-7 place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/** 월간 날짜 그리드(요일 헤더 + 컴팩트 셀: 날짜 + 모듈 기간 바 + 행사 점). */
function CalendarGrid({
  weeks,
  month,
  today,
  selected,
  onSelect,
  bars,
  items,
}: {
  weeks: Dayjs[][]
  month: Dayjs
  today: Dayjs
  selected: string
  onSelect: (key: string) => void
  bars: ModuleBar[]
  items: TimelineItem[]
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAYS.map((w, i) => (
        <div
          key={w}
          className={`py-1 text-center text-caption font-semibold ${
            i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-500'
          }`}
        >
          {w}
        </div>
      ))}
      {weeks.flat().map((day) => {
        const key = day.format(DATE_KEY)
        const inMonth = day.isSame(month, 'month')
        const isToday = day.isSame(today, 'day')
        const isSelected = key === selected
        const dayBars = barsOnDate(bars, key)
        const hasItems = itemsOnDate(items, key).length > 0
        return (
          <button
            type="button"
            key={key}
            onClick={() => onSelect(key)}
            className={`flex min-h-[3.25rem] flex-col gap-1 rounded-radius-sm border p-1 text-left transition-colors duration-fast ${
              isSelected
                ? 'border-info-border bg-info-subtle/60'
                : 'border-gray-200 hover:bg-gray-25'
            } ${inMonth ? 'bg-white' : 'bg-gray-25/60'}`}
          >
            <span className="flex items-center gap-1">
              <span
                className={`text-caption tabular-nums ${
                  isToday
                    ? 'grid h-5 w-5 place-items-center rounded-full bg-brand font-bold text-gray-0'
                    : inMonth
                      ? 'text-gray-700'
                      : 'text-gray-300'
                }`}
              >
                {day.date()}
              </span>
              {hasItems && (
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
              )}
            </span>
            <span className="flex flex-col gap-0.5">
              {dayBars.slice(0, 3).map((b) => (
                <span
                  key={b.moduleType}
                  title={labelOf(b.moduleType)}
                  className={`h-1 rounded-full ${MODULE_BAR_CLASS[b.status] ?? 'bg-gray-300'}`}
                />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 선택 날짜 상세: 해당일 모듈 기간 바 + 세션·행사 목록. */
function SelectedDayDetail({
  bars,
  items,
}: {
  bars: ModuleBar[]
  items: TimelineItem[]
}) {
  return (
    <div className="mt-3 rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2.5">
      {bars.length === 0 && items.length === 0 ? (
        <p className="text-caption text-gray-400">
          선택한 날짜에 등록된 일정이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bars.map((b) => {
            const status = moduleStatusMeta(b.status)
            return (
              <li key={b.moduleType} className="flex items-center gap-2 text-caption">
                <Badge tone={status.tone} size="sm">
                  {status.label}
                </Badge>
                <span className="text-gray-800">{labelOf(b.moduleType)}</span>
                <span className="ml-auto tabular-nums text-gray-400">
                  {b.start} ~ {b.end}
                </span>
              </li>
            )
          })}
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-caption">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span className="text-gray-800">{it.title}</span>
              <span className="ml-auto tabular-nums text-gray-400">
                {it.starts_at ? dayjs(it.starts_at).format('HH:mm') : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 통합 타임라인(상세 개요 우측 패널).
 * 자료 관리·코멘트·변동 이력과 동일한 DetailPanelCard 톤을 쓰며, 제목 옆 일정 건수 뱃지 + 기간 캡션,
 * 월간 캘린더(모듈 기간 바·행사 점), 날짜 선택 시 하단 일정 목록으로 구성한다.
 * `onExpand` 지정 시 헤더에 '전체 보기 →'(타임라인 전체 화면 진입) 액션을 노출한다.
 */
export function ProgramScheduleCard({
  program,
  onExpand,
}: {
  program: Program
  onExpand?: () => void
}) {
  const { data: modules } = useProgramModules(program.id)
  const { data: items } = useTimelineItems(program.id)
  const today = dayjs()
  const initialMonth = (program.start_date ? dayjs(program.start_date) : today).startOf('month')
  const [month, setMonth] = useState<Dayjs>(initialMonth)
  const [selected, setSelected] = useState<string>(today.format(DATE_KEY))

  const bars = useMemo(() => toModuleBars(modules ?? []), [modules])
  const weeks = useMemo(() => buildWeeks(month), [month])
  const timelineItems = items ?? []

  return (
    <DetailPanelCard
      title="통합 타임라인"
      count={timelineItems.length}
      action={<ExpandAction onExpand={onExpand} />}
    >
      <p className="mb-3 text-caption text-gray-400">
        {timelineRangeLabel(program.start_date, program.end_date, bars)}
      </p>
      <MonthNav
        month={month}
        onPrev={() => setMonth((m) => m.subtract(1, 'month'))}
        onNext={() => setMonth((m) => m.add(1, 'month'))}
      />
      <CalendarGrid
        weeks={weeks}
        month={month}
        today={today}
        selected={selected}
        onSelect={setSelected}
        bars={bars}
        items={timelineItems}
      />
      <SelectedDayDetail
        bars={barsOnDate(bars, selected)}
        items={itemsOnDate(timelineItems, selected)}
      />
    </DetailPanelCard>
  )
}
