import { Badge } from '@ynarcher/ui'
import { MODULE_TYPES, MODULE_VISIBILITY_LABEL, MODULE_VISIBILITY_TONE } from '@/features/ac/config'
import type { ProgramModule } from '@/features/ac/hooks'
import {
  MODULE_META,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/ac/detail/moduleMeta'

const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type

/** 칸반 컬럼 순서: 준비 → 진행 → 완료 (module_status enum 순). 취소 컬럼은 해당 모듈이 있을 때만 노출. */
const BASE_COLUMNS = ['DRAFT', 'OPEN', 'CLOSED']

/**
 * 운영 모듈 칸반 보드 뷰. 모듈을 상태(준비/진행/완료) 컬럼으로 배치한다.
 * 카드 클릭은 목록 뷰와 동일하게 해당 운영 화면으로 진입한다(설정/비활성은 목록 뷰에서).
 */
export function ModuleKanbanView({
  modules,
  onOpenModule,
}: {
  modules: ProgramModule[]
  onOpenModule: (moduleType: string) => void
}) {
  const hasCancelled = modules.some((m) => m.status === 'CANCELLED')
  const columns = hasCancelled ? [...BASE_COLUMNS, 'CANCELLED'] : BASE_COLUMNS

  return (
    <div className={`grid grid-cols-1 gap-3 ${hasCancelled ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
      {columns.map((status) => {
        const meta = moduleStatusMeta(status)
        const items = modules.filter((m) => (m.status ?? 'DRAFT') === status)
        return (
          <div key={status} className="rounded-radius-md bg-gray-25 p-2">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Badge tone={meta.tone} size="sm">
                {meta.label}
              </Badge>
              <span className="text-caption tabular-nums text-gray-400">{items.length}</span>
            </div>
            <ul className="space-y-2">
              {items.map((mod) => {
                const modMeta = MODULE_META[mod.module_type]
                const settings = readModuleSettings(mod.settings)
                const Icon = modMeta?.icon
                return (
                  <li key={mod.id}>
                    <button
                      type="button"
                      onClick={() => onOpenModule(mod.module_type)}
                      className="w-full rounded-radius-md border border-gray-300 bg-white px-3 py-2.5 text-left shadow-soft transition-colors duration-fast hover:border-gray-400"
                    >
                      <span className="flex items-center gap-2">
                        {Icon && (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className="truncate text-body font-semibold text-gray-900">
                          {labelOf(mod.module_type)}
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <Badge tone={MODULE_VISIBILITY_TONE[mod.visibility] ?? 'neutral'} size="sm">
                          {MODULE_VISIBILITY_LABEL[mod.visibility] ?? '비공개'}
                        </Badge>
                        <span className="text-caption tabular-nums text-gray-400">
                          {settings.start_date && settings.end_date
                            ? `${settings.start_date} ~ ${settings.end_date}`
                            : '일정 미등록'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {items.length === 0 && (
                <li className="rounded-radius-md border border-dashed border-gray-200 px-3 py-4 text-center text-caption text-gray-400">
                  해당 상태의 모듈이 없습니다.
                </li>
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
