import { Badge, IconButton } from '@ynarcher/ui'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MODULE_TYPES } from '@/features/program/config'
import { useProgramModules, type Program } from '@/features/program/hooks'
import { useTimelineItems, type TimelineItem } from '@/features/program/detail/detailHooks'
import { MODULE_BAR_CLASS, moduleStatusMeta } from '@/features/program/detail/moduleMeta'
import {
  DATE_KEY,
  barsOnDate,
  buildWeeks,
  itemsOnDate,
  toModuleBars,
  type ModuleBar,
} from '@/features/program/detail/scheduleCompute'

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
      <IconButton
        variant="ghost"
        label="이전 달"
        onClick={onPrev}
        icon={<ChevronLeft className="h-4 w-4" />}
      />
      <span className="min-w-[6.5rem] text-center text-body font-semibold text-gray-900">
        {month.format('YYYY년 M월')}
      </span>
      <IconButton
        variant="ghost"
        label="다음 달"
        onClick={onNext}
        icon={<ChevronRight className="h-4 w-4" />}
      />
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
  rangeStart,
  rangeEnd,
}: {
  weeks: Dayjs[][]
  month: Dayjs
  today: Dayjs
  selected: string
  onSelect: (key: string) => void
  bars: ModuleBar[]
  items: TimelineItem[]
  /** 사업 운영 기간. 이 범위 밖의 날짜는 비활성(회색)으로 표시한다. null이면 제한 없음. */
  rangeStart: Dayjs | null
  rangeEnd: Dayjs | null
}) {
  // 사업 기간 밖(=비활성) 여부. 기간 경계가 없으면 항상 활성으로 본다.
  const isOutOfProgram = (day: Dayjs) =>
    (rangeStart != null && day.isBefore(rangeStart, 'day')) ||
    (rangeEnd != null && day.isAfter(rangeEnd, 'day'))
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAYS.map((w, i) => (
        <div
          key={w}
          className={`py-1 text-center text-caption font-semibold ${
            i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-600'
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
        const disabled = isOutOfProgram(day)
        const dayBars = barsOnDate(bars, key)
        const hasItems = itemsOnDate(items, key).length > 0
        return (
          <button
            type="button"
            key={key}
            disabled={disabled}
            onClick={() => onSelect(key)}
            className={`flex min-h-[3.25rem] flex-col gap-1 rounded-radius-sm border p-1 text-left transition-colors duration-fast ${
              disabled
                ? 'cursor-not-allowed border-gray-100 bg-gray-50/60'
                : isSelected
                  ? 'border-info-border bg-info-subtle/60'
                  : `border-gray-200 hover:bg-gray-25 ${inMonth ? 'bg-white' : 'bg-gray-25/60'}`
            }`}
          >
            <span className="flex items-center gap-1">
              <span
                className={`text-caption tabular-nums ${
                  disabled
                    ? 'text-gray-300'
                    : isToday
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
        <p className="text-caption text-gray-500">
          선택한 날짜에 등록된 일정이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bars.map((b) => {
            const status = moduleStatusMeta(b.status)
            return (
              <li key={b.moduleType} className="flex items-center gap-2 text-caption">
                <Badge tone={status.tone}>
                  {status.label}
                </Badge>
                <span className="text-gray-800">{labelOf(b.moduleType)}</span>
                <span className="ml-auto tabular-nums text-gray-600">
                  {b.start} ~ {b.end}
                </span>
              </li>
            )
          })}
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-caption">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <span className="text-gray-800">{it.title}</span>
              <span className="ml-auto tabular-nums text-gray-600">
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
 * 자료 관리·코멘트·변동 이력과 동일한 DetailPanelCard 톤을 쓰며, 제목 옆 일정 건수 뱃지 +
 * 월간 캘린더(모듈 기간 바·행사 점), 날짜 선택 시 하단 일정 목록으로 구성한다.
 * 캘린더는 오늘 날짜가 속한 달을 기본으로 열고, 사업 운영 기간 밖의 날짜는 비활성(회색)으로 표시한다.
 */
export function ProgramScheduleCard({ program }: { program: Program }) {
  const { data: modules } = useProgramModules(program.id)
  const { data: items } = useTimelineItems(program.id)
  const today = dayjs()
  // 기본 달은 사업 시작일이 아니라 오늘 기준으로 연다.
  const [month, setMonth] = useState<Dayjs>(today.startOf('month'))
  const [selected, setSelected] = useState<string>(today.format(DATE_KEY))

  // 사업 운영 기간(캘린더 비활성 처리 기준). 값이 없으면 제한 없음.
  const rangeStart = program.start_date ? dayjs(program.start_date) : null
  const rangeEnd = program.end_date ? dayjs(program.end_date) : null

  const bars = useMemo(() => toModuleBars(modules ?? []), [modules])
  const weeks = useMemo(() => buildWeeks(month), [month])
  const timelineItems = items ?? []

  return (
    <DetailPanelCard title="통합 타임라인" count={timelineItems.length}>
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
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />
      <SelectedDayDetail
        bars={barsOnDate(bars, selected)}
        items={itemsOnDate(timelineItems, selected)}
      />
    </DetailPanelCard>
  )
}
