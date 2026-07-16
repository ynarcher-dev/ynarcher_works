import { Badge, Card, Spinner, useToast } from '@ynarcher/ui'
import { ChartGantt, List, Pencil, Plus, SquareKanban, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import {
  MODULE_TYPES,
  MODULE_VISIBILITY_LABEL,
  MODULE_VISIBILITY_TONE,
} from '@/features/ac/config'
import {
  useProgramModules,
  useToggleModule,
  type Program,
  type ProgramModule,
} from '@/features/ac/hooks'
import { AddModulesModal } from '@/features/ac/detail/AddModulesModal'
import { ModuleGanttView } from '@/features/ac/detail/ModuleGanttView'
import { ModuleKanbanView } from '@/features/ac/detail/ModuleKanbanView'
import { ModuleSettingsModal } from '@/features/ac/detail/ModuleSettingsModal'
import {
  MODULE_META,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/ac/detail/moduleMeta'

type BoardView = 'list' | 'kanban' | 'gantt'

const VIEW_OPTIONS: { key: BoardView; label: string; icon: LucideIcon }[] = [
  { key: 'list', label: '목록', icon: List },
  { key: 'kanban', label: '칸반', icon: SquareKanban },
  { key: 'gantt', label: '간트', icon: ChartGantt },
]

const typeOrder = new Map(MODULE_TYPES.map((d, i) => [d.type, i]))
const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type

/** 활성 모듈 정렬: 시작일 오름차순 → 모듈 표준 순서. */
function sortModules(modules: ProgramModule[]): ProgramModule[] {
  return [...modules].sort((a, b) => {
    const sa = readModuleSettings(a.settings).start_date ?? '9999'
    const sb = readModuleSettings(b.settings).start_date ?? '9999'
    if (sa !== sb) return sa.localeCompare(sb)
    return (typeOrder.get(a.module_type) ?? 99) - (typeOrder.get(b.module_type) ?? 99)
  })
}

/**
 * 운영 모듈 보드(상세 개요 좌측 카드). 헤더 토글로 목록·칸반·간트 3개 뷰를 전환한다.
 * 목록 뷰: 활성 모듈 카드 나열(상태 배지·기간·메모, 호버 시 설정/비활성) + 하단 점선 카드로 모듈 추가.
 * 칸반 뷰: 상태(준비/진행/완료) 컬럼 배치. 간트 뷰: 일정 기간 막대. 편집은 목록 뷰에서만 제공한다.
 */
export function ModuleBoardCard({
  program,
  onOpenModule,
}: {
  program: Program
  onOpenModule: (moduleType: string) => void
}) {
  const programId = program.id
  const toast = useToast()
  const { data, isLoading } = useProgramModules(programId)
  const toggle = useToggleModule(programId)
  const [editTarget, setEditTarget] = useState<ProgramModule | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<BoardView>('list')

  if (isLoading) {
    return (
      <Card title="운영 모듈">
        <Spinner />
      </Card>
    )
  }

  const modules = data ?? []
  const enabled = sortModules(modules.filter((m) => m.enabled))
  const disabledTypes = MODULE_TYPES.map((d) => d.type).filter(
    (t) => !modules.some((m) => m.module_type === t && m.enabled),
  )

  const onDisable = async (mod: ProgramModule) => {
    if (!window.confirm(`'${labelOf(mod.module_type)}' 모듈을 끄시겠습니까? 데이터는 보존됩니다.`)) return
    try {
      await toggle.mutateAsync({
        moduleType: mod.module_type,
        enabled: false,
        participationMode: mod.participation_mode,
      })
    } catch {
      toast.show('모듈 비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title="운영 모듈"
      actions={
        <span className="flex rounded-radius-md border border-gray-300 bg-white p-0.5">
          {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              title={`${label} 보기`}
              aria-label={`${label} 보기`}
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`grid h-7 w-8 place-items-center rounded-radius-sm transition-colors duration-fast ${
                view === key
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-400 hover:bg-gray-25 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </span>
      }
    >
      {view === 'kanban' && <ModuleKanbanView modules={enabled} onOpenModule={onOpenModule} />}
      {view === 'gantt' && <ModuleGanttView modules={enabled} onOpenModule={onOpenModule} />}
      {view === 'list' && (
        <>
          <ul className="space-y-3">
            {enabled.map((mod) => {
              const meta = MODULE_META[mod.module_type]
              const status = moduleStatusMeta(mod.status)
              const settings = readModuleSettings(mod.settings)
              const Icon = meta?.icon
              return (
                <li key={mod.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenModule(mod.module_type)}
                    className="w-full rounded-radius-md border border-gray-300 bg-white px-4 py-3 text-left transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25"
                  >
                    <span className="flex items-center gap-2">
                      {Icon && (
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
                          <Icon className="h-4 w-4" />
                        </span>
                      )}
                      <span className="text-body font-semibold text-gray-900">
                        {labelOf(mod.module_type)}
                      </span>
                      <Badge tone={status.tone} size="sm">
                        {status.label}
                      </Badge>
                      <Badge tone={MODULE_VISIBILITY_TONE[mod.visibility] ?? 'neutral'} size="sm">
                        {MODULE_VISIBILITY_LABEL[mod.visibility] ?? '비공개'}
                      </Badge>
                    </span>
                    <span className="mt-2 block text-body text-gray-600">
                      {settings.memo ?? meta?.description ?? ''}
                    </span>
                    <span className="mt-1 block text-caption tabular-nums text-gray-400">
                      {settings.start_date && settings.end_date
                        ? `${settings.start_date} ~ ${settings.end_date}`
                        : '일정 미등록'}
                    </span>
                  </button>
                  {/* 호버 액션: 설정(연필)/비활성(X). 카드 클릭과 분리된 우상단 아이콘. */}
                  <span className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100">
                    <button
                      type="button"
                      title="모듈 설정"
                      aria-label={`${labelOf(mod.module_type)} 설정`}
                      onClick={() => setEditTarget(mod)}
                      className="grid h-7 w-7 place-items-center rounded-radius-sm border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="모듈 끄기"
                      aria-label={`${labelOf(mod.module_type)} 끄기`}
                      onClick={() => void onDisable(mod)}
                      className="grid h-7 w-7 place-items-center rounded-radius-sm border border-gray-300 bg-white text-gray-500 hover:bg-red-50 hover:text-brand"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              )
            })}
            {enabled.length === 0 && (
              <li className="rounded-radius-md border border-gray-200 bg-gray-25 px-4 py-6 text-center text-body text-gray-400">
                활성화된 모듈이 없습니다. 아래에서 모듈을 추가하세요.
              </li>
            )}
          </ul>

          {disabledTypes.length > 0 && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-3 flex w-full flex-col items-center gap-1 rounded-radius-md border border-dashed border-gray-300 px-4 py-5 text-gray-500 transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25 hover:text-gray-700"
            >
              <Plus className="h-5 w-5" />
              <span className="text-body font-medium">모듈 추가</span>
            </button>
          )}
        </>
      )}

      {editTarget && (
        <ModuleSettingsModal
          program={program}
          module={editTarget}
          label={labelOf(editTarget.module_type)}
          onClose={() => setEditTarget(null)}
        />
      )}
      <AddModulesModal
        programId={programId}
        open={addOpen}
        disabledTypes={disabledTypes}
        onClose={() => setAddOpen(false)}
      />
    </Card>
  )
}
