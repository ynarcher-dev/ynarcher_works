import { Badge, Card } from '@ynarcher/ui'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MODULE_TYPES } from '@/features/ac/config'
import { useProgramModules, type Program } from '@/features/ac/hooks'
import { useTimelineItems } from '@/features/ac/detail/detailHooks'
import { MODULE_BAR_CLASS, moduleStatusMeta } from '@/features/ac/detail/moduleMeta'
import {
  DATE_KEY,
  barsOnDate,
  buildWeeks,
  itemsOnDate,
  timelineRangeLabel,
  toModuleBars,
} from '@/features/ac/detail/scheduleCompute'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type

/**
 * 통합 타임라인(상세 개요 우측 카드).
 * 월간 그리드에 모듈 기간 바(상태별 색) + 세션·행사 점을 표시하고,
 * 날짜 선택 시 하단에 해당일 일정 목록을 보여준다.
 */
export function ProgramScheduleCard({ program }: { program: Program }) {
  const { data: modules } = useProgramModules(program.id)
  const { data: items } = useTimelineItems(program.id)
  const today = dayjs()
  const initialMonth = (program.start_date ? dayjs(program.start_date) : today).startOf('month')
  const [month, setMonth] = useState<Dayjs>(initialMonth)
  const [selected, setSelected] = useState<string>(today.format(DATE_KEY))

  const bars = useMemo(() => toModuleBars(modules ?? []), [modules])
  const weeks = useMemo(() => buildWeeks(month), [month])
  const timelineItems = items ?? []
  const selectedBars = barsOnDate(bars, selected)
  const selectedItems = itemsOnDate(timelineItems, selected)

  return (
    <Card
      title="통합 타임라인"
      subtitle={timelineRangeLabel(program.start_date, program.end_date, bars)}
      actions={<Badge tone="success">{timelineItems.length}개 일정</Badge>}
    >
      {/* 월 네비게이션 */}
      <div className="mb-3 flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setMonth((m) => m.subtract(1, 'month'))}
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
          onClick={() => setMonth((m) => m.add(1, 'month'))}
          className="grid h-7 w-7 place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 요일 헤더 + 날짜 그리드(컴팩트 셀: 날짜 숫자 + 모듈 기간 바 + 행사 점) */}
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
          const hasItems = itemsOnDate(timelineItems, key).length > 0
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(key)}
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

      {/* 선택 날짜 상세 */}
      <div className="mt-3 rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2.5">
        {selectedBars.length === 0 && selectedItems.length === 0 ? (
          <p className="text-caption text-gray-400">
            선택한 날짜에 등록된 일정이 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {selectedBars.map((b) => {
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
            {selectedItems.map((it) => (
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
    </Card>
  )
}
