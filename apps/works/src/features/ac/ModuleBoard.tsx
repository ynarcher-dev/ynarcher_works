import { Badge, Select, Spinner, Switch, useToast } from '@ynarcher/ui'
import { useProgramModules, useToggleModule } from '@/features/ac/hooks'
import { MODULE_TYPES, PARTICIPATION_MODES } from '@/features/ac/config'

/** 프로그램 모듈 보드: 모듈 On/Off + 참여 방식(participation_mode) 설정. (7-1) */
export function ModuleBoard({ programId }: { programId: string }) {
  const toast = useToast()
  const { data, isLoading } = useProgramModules(programId)
  const toggle = useToggleModule(programId)

  if (isLoading) return <Spinner />

  const byType = new Map((data ?? []).map((m) => [m.module_type, m]))

  const onToggle = async (moduleType: string, enabled: boolean) => {
    const current = byType.get(moduleType)
    try {
      await toggle.mutateAsync({
        moduleType,
        enabled,
        participationMode: current?.participation_mode ?? null,
      })
    } catch {
      toast.show('모듈 설정 변경에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const onMode = async (moduleType: string, mode: string) => {
    const current = byType.get(moduleType)
    try {
      await toggle.mutateAsync({
        moduleType,
        enabled: current?.enabled ?? false,
        participationMode: mode,
      })
    } catch {
      toast.show('참여 방식 변경에 실패했습니다.', 'danger')
    }
  }

  return (
    <ul className="space-y-2">
      {MODULE_TYPES.map((def) => {
        const mod = byType.get(def.type)
        const enabled = mod?.enabled ?? false
        return (
          <li
            key={def.type}
            className="flex flex-wrap items-center gap-3 rounded border border-gray-300 bg-white px-4 py-3"
          >
            <Switch
              checked={enabled}
              onChange={(v) => void onToggle(def.type, v)}
              aria-label={`${def.label} 활성화`}
            />
            <span className="min-w-40 text-body font-medium text-gray-800">
              {def.label}
            </span>
            {!def.implemented && <Badge tone="neutral">화면 준비 중</Badge>}
            <div className="flex-1" />
            <Select
              value={mod?.participation_mode ?? ''}
              onChange={(e) => void onMode(def.type, e.target.value)}
              className="max-w-52"
              disabled={!enabled}
            >
              <option value="">참여 방식 선택</option>
              {PARTICIPATION_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </li>
        )
      })}
    </ul>
  )
}
