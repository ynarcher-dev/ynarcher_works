import { Button, Input } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import type { OrgLevel } from '@/features/management/panels/departmentsMock'

interface OrgLevelEditorProps {
  levels: OrgLevel[]
  draftNames: Record<string, string>
  onDraftNameChange: (id: string, name: string) => void
  onAddTier: () => void
  onAddParallel: (tier: number) => void
  onRemove: (id: string) => void
  onSave: () => void
  onCancel: () => void
  structureActionsEnabled?: boolean
}

export function OrgLevelEditor({
  levels,
  draftNames,
  onDraftNameChange,
  onAddTier,
  onAddParallel,
  onRemove,
  onSave,
  onCancel,
  structureActionsEnabled = true,
}: OrgLevelEditorProps) {
  const tiers = [...new Set(levels.map((l) => l.tier))].sort((a, b) => a - b)
  const byTier = (t: number) => levels.filter((l) => l.tier === t)

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2">
      <span className="mt-1.5 text-caption font-semibold text-gray-600">조직 레벨</span>
      {tiers.map((t, i) => (
        <div key={t} className="flex items-start">
          {i > 0 && <span className="mx-1 mt-1.5 text-gray-300">›</span>}
          <div className="flex flex-col gap-1">
            {byTier(t).map((lv) => (
              <div
                key={lv.id}
                className="flex items-center gap-0.5 rounded-radius-sm border border-gray-300 bg-white pl-1 pr-0.5"
              >
                <Input
                  value={draftNames[lv.id] ?? lv.name}
                  onChange={(e) => onDraftNameChange(lv.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSave()
                    if (e.key === 'Escape') onCancel()
                  }}
                  className="h-6 w-16 border-0 px-1 text-caption shadow-none focus-visible:ring-0"
                />
                {structureActionsEnabled && (
                  <button
                    type="button"
                    title="레벨 삭제"
                    onClick={() => onRemove(lv.id)}
                    className="flex size-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-brand-700"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {structureActionsEnabled && (
              <button
                type="button"
                title="같은 계층에 병렬 레벨 추가"
                onClick={() => onAddParallel(t)}
                className="flex items-center justify-center gap-0.5 rounded-radius-sm border border-dashed border-gray-300 py-0.5 text-caption text-gray-400 hover:border-gray-400 hover:text-gray-600"
              >
                <Plus size={11} /> 병렬
              </button>
            )}
          </div>
        </div>
      ))}
      {structureActionsEnabled && (
        <div className="flex items-start">
          {tiers.length > 0 && <span className="mx-1 mt-1.5 text-gray-300">›</span>}
          <Button variant="ghost" onClick={onAddTier} className="gap-1 text-gray-600">
            <Plus size={13} /> 하위 계층
          </Button>
        </div>
      )}
    </div>
  )
}
