import { Badge } from '@ynarcher/ui'
import { MODULE_TYPES } from '@/features/program/config'
import type { ProgramModule } from '@/features/program/hooks'
import { koreanHolidayName } from '@/lib/koreanHolidays'
import {
  MODULE_BAR_CLASS,
  MODULE_META,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'

const DAY = 86_400_000
const HEADER_H = 46 // 월 행(26) + 주 행(20)
const ROW_H = 44
const BAR_H = 24
const LEFT_W = 216 // 좌측 고정 라벨 컬럼(px): 아이콘 + 모듈명 + 상태 태그

const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type
/** 인스턴스 표시명: 모듈명 우선, 없으면 템플릿 라벨. */
const nameOf = (mod: ProgramModule) => mod.title?.trim() || labelOf(mod.module_type)

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

/**
 * 운영 모듈 간트 차트 뷰. settings의 시작/종료일을 고정 px/일 스케일로 배치한다.
 * 월·주 2단 축과 그리드라인, 오늘 기준선을 그리고 좌측 모듈 라벨 컬럼을 가로 스크롤 시 고정한다.
 * 막대 색상은 캘린더와 동일한 상태별 팔레트(MODULE_BAR_CLASS)를 재사용하며,
 * 일정 미등록 모듈은 하단에 별도로 나열한다. 막대·라벨 클릭 시 해당 운영 화면으로 진입한다.
 */
export function ModuleGanttView({
  modules,
  onOpenModule,
}: {
  modules: ProgramModule[]
  onOpenModule: (module: ProgramModule) => void
}) {
  const rows = modules
    .map((mod) => {
      const settings = readModuleSettings(mod.settings)
      const start = settings.start_date ? parseDay(settings.start_date) : NaN
      const end = settings.end_date ? parseDay(settings.end_date) : NaN
      return { mod, settings, start, end }
    })
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end >= r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const undated = modules.filter((m) => !rows.some((r) => r.mod.id === m.id))

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-radius-md border border-dashed border-gray-300 py-8 text-center text-body text-gray-400">
          일정이 등록된 모듈이 없습니다. 모듈 설정에서 시작/종료일을 입력하세요.
        </p>
        {undated.length > 0 && <UndatedList modules={undated} onOpenModule={onOpenModule} />}
      </div>
    )
  }

  const min = Math.min(...rows.map((r) => r.start))
  const max = Math.max(...rows.map((r) => r.end))
  const rangeStart = startOfMonth(min)
  const rangeEnd = nextMonth(max) // 배타적 끝(마지막 모듈이 속한 달의 다음 달 1일)
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
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-radius-md border border-gray-200 bg-white">
        <div className="flex" style={{ minWidth: LEFT_W + minTimelineW }}>
          {/* 좌측 고정 라벨 컬럼 */}
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white"
            style={{ width: LEFT_W }}
          >
            <div
              className="flex items-end border-b border-gray-200 px-3 pb-1.5 text-caption text-gray-400"
              style={{ height: HEADER_H }}
            >
              모듈
            </div>
            {rows.map(({ mod }) => {
              const status = moduleStatusMeta(mod.status)
              const Icon = MODULE_META[mod.module_type]?.icon
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onOpenModule(mod)}
                  className="flex w-full items-center gap-2 border-b border-gray-100 px-3 text-left transition-colors duration-fast hover:bg-gray-25"
                  style={{ height: ROW_H }}
                  title={`${nameOf(mod)} · ${labelOf(mod.module_type)}`}
                >
                  {Icon && (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {nameOf(mod)}
                  </span>
                  <Badge tone={status.tone} size="sm">
                    {status.label}
                  </Badge>
                </button>
              )
            })}
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

            {/* 2단 축(월 / 주) */}
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

            {/* 모듈 막대 행 */}
            {rows.map(({ mod, settings, start, end }) => {
              const status = moduleStatusMeta(mod.status)
              const durationDays = Math.round((end - start) / DAY) + 1
              const estPx = durationDays * dayW // 최소 스케일 기준 예상 px(라벨 노출 판단)
              return (
                <div
                  key={mod.id}
                  className="relative border-b border-gray-100"
                  style={{ height: ROW_H }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenModule(mod)}
                    className={`absolute flex items-center overflow-hidden rounded-radius-sm text-left shadow-soft transition-opacity duration-fast hover:opacity-80 ${MODULE_BAR_CLASS[mod.status] ?? 'bg-gray-300'}`}
                    style={{
                      left: pct(days(start)),
                      width: pct(durationDays),
                      minWidth: 6,
                      top: (ROW_H - BAR_H) / 2,
                      height: BAR_H,
                    }}
                    title={`${nameOf(mod)} · ${settings.start_date} ~ ${settings.end_date} · ${status.label} (${durationDays}일)`}
                  >
                    {estPx >= 116 ? (
                      <span className="truncate px-2 text-caption font-medium tabular-nums text-white/95">
                        {mmdd(start)} ~ {mmdd(end)}
                      </span>
                    ) : estPx >= 44 ? (
                      <span className="truncate px-1.5 text-caption font-medium tabular-nums text-white/95">
                        {durationDays}일
                      </span>
                    ) : null}
                  </button>
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

      {undated.length > 0 && <UndatedList modules={undated} onOpenModule={onOpenModule} />}
    </div>
  )
}

/** 시작/종료일 미등록 모듈의 하단 나열(막대 축 밖). */
function UndatedList({
  modules,
  onOpenModule,
}: {
  modules: ProgramModule[]
  onOpenModule: (module: ProgramModule) => void
}) {
  return (
    <p className="text-caption text-gray-400">
      일정 미등록:{' '}
      {modules.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ' · '}
          <button
            type="button"
            onClick={() => onOpenModule(m)}
            className="text-gray-500 underline-offset-2 hover:underline"
          >
            {nameOf(m)}
          </button>
        </span>
      ))}
    </p>
  )
}
