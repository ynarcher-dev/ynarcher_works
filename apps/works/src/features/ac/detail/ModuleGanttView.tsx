import { MODULE_TYPES } from '@/features/ac/config'
import type { ProgramModule } from '@/features/ac/hooks'
import {
  MODULE_BAR_CLASS,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/ac/detail/moduleMeta'

const DAY = 86_400_000

const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type

/**
 * 운영 모듈 간트 차트 뷰. settings의 시작/종료일 기준으로 기간 막대를 그린다.
 * 막대 색상은 캘린더와 동일한 상태별 팔레트(MODULE_BAR_CLASS)를 재사용하고,
 * 일정 미등록 모듈은 하단에 별도로 나열한다. 행 클릭 시 해당 운영 화면으로 진입한다.
 */
export function ModuleGanttView({
  modules,
  onOpenModule,
}: {
  modules: ProgramModule[]
  onOpenModule: (moduleType: string) => void
}) {
  const rows = modules
    .map((mod) => {
      const settings = readModuleSettings(mod.settings)
      const start = settings.start_date ? new Date(settings.start_date).getTime() : null
      const end = settings.end_date ? new Date(settings.end_date).getTime() : null
      return { mod, settings, start, end }
    })
    .filter((r): r is typeof r & { start: number; end: number } =>
      r.start !== null && r.end !== null && r.end >= r.start,
    )
    .sort((a, b) => a.start - b.start)
  const undated = modules.filter((m) => !rows.some((r) => r.mod.id === m.id))

  const min = rows.length > 0 ? Math.min(...rows.map((r) => r.start)) : 0
  const max = rows.length > 0 ? Math.max(...rows.map((r) => r.end)) : 1
  const span = Math.max(max - min, DAY)

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-radius-md border border-dashed border-gray-300 py-8 text-center text-body text-gray-400">
          일정이 등록된 모듈이 없습니다. 모듈 설정에서 시작/종료일을 입력하세요.
        </p>
      ) : (
        <div className="space-y-1 rounded-radius-md border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-[9rem_1fr] gap-3 pb-1 text-caption tabular-nums text-gray-400">
            <span>{new Date(min).toISOString().slice(0, 10)}</span>
            <span className="text-right">{new Date(max + DAY).toISOString().slice(0, 10)}</span>
          </div>
          {rows.map(({ mod, settings, start, end }) => {
            const status = moduleStatusMeta(mod.status)
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onOpenModule(mod.module_type)}
                className="grid w-full grid-cols-[9rem_1fr] items-center gap-3 rounded-radius-sm px-1 py-1 text-left transition-colors duration-fast hover:bg-gray-25"
              >
                <span className="truncate text-body text-gray-800" title={labelOf(mod.module_type)}>
                  {labelOf(mod.module_type)}
                </span>
                <span className="relative block h-5 rounded-radius-sm bg-gray-50">
                  <span
                    className={`absolute top-0 h-5 rounded-radius-sm ${MODULE_BAR_CLASS[mod.status] ?? 'bg-gray-300'}`}
                    style={{
                      left: `${((start - min) / span) * 100}%`,
                      width: `${Math.max(((end - start + DAY) / span) * 100, 2)}%`,
                    }}
                    title={`${settings.start_date} ~ ${settings.end_date} · ${status.label}`}
                  />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {undated.length > 0 && (
        <p className="text-caption text-gray-400">
          일정 미등록:{' '}
          {undated.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ' · '}
              <button
                type="button"
                onClick={() => onOpenModule(m.module_type)}
                className="text-gray-500 underline-offset-2 hover:underline"
              >
                {labelOf(m.module_type)}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
