import { Badge, Card, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import {
  MODULE_TYPES,
  MODULE_VISIBILITY_LABEL,
  MODULE_VISIBILITY_TONE,
} from '@/features/ac/config'
import { useProgramModules, useToggleModule, type ProgramModule } from '@/features/ac/hooks'
import { AddModulesModal } from '@/features/ac/detail/AddModulesModal'
import { ModuleSettingsModal } from '@/features/ac/detail/ModuleSettingsModal'
import {
  MODULE_META,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/ac/detail/moduleMeta'

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
 * 운영 모듈 보드(상세 개요 좌측 카드).
 * 활성 모듈을 카드로 나열하고(상태 배지·기간·메모, 호버 시 설정/비활성),
 * 하단 점선 카드로 비활성 모듈을 일괄 추가한다.
 */
export function ModuleBoardCard({
  programId,
  onOpenModule,
}: {
  programId: string
  onOpenModule: (moduleType: string) => void
}) {
  const toast = useToast()
  const { data, isLoading } = useProgramModules(programId)
  const toggle = useToggleModule(programId)
  const [editTarget, setEditTarget] = useState<ProgramModule | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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
      subtitle="이 프로그램에서 운영할 모듈을 켜고 끕니다. 카드를 누르면 해당 운영 화면으로 이동합니다."
    >
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

      {editTarget && (
        <ModuleSettingsModal
          programId={programId}
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
