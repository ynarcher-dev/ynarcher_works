import { Button, Input } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import type { OrgLevel } from '@/features/management/panels/departmentsMock'

interface OrgLevelEditorProps {
  levels: OrgLevel[]
  /** 이름 변경 확정(blur/Enter). 변경 없으면 호출돼도 무시된다. */
  onRename: (id: string, name: string) => void
  /** 맨 오른쪽에 새 티어(하위 볼륨) 추가. */
  onAddTier: () => void
  /** 해당 티어에 병렬 레벨 추가(같은 볼륨). */
  onAddParallel: (tier: number) => void
  onRemove: (id: string) => void
}

/**
 * 조직 레벨(티어) 정의 바. 티어는 왼쪽→오른쪽(상위→하위), 같은 티어의 병렬 레벨(예: 본부·실)은
 * 세로로 쌓인다. 여기서 정한 레벨 이름이 인사관리 컬럼(티어당 1개, 병렬은 '/'로 합침) 헤더가 된다.
 * 입력은 비제어(defaultValue)로 두고 blur/Enter에서 저장한다(키 입력마다 저장 방지).
 */
export function OrgLevelEditor({
  levels,
  onRename,
  onAddTier,
  onAddParallel,
  onRemove,
}: OrgLevelEditorProps) {
  const tiers = [...new Set(levels.map((l) => l.tier))].sort((a, b) => a - b)
  const byTier = (t: number) => levels.filter((l) => l.tier === t)

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2">
      <span className="mt-1.5 text-caption font-semibold text-gray-500">조직 레벨</span>
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
                  key={lv.name}
                  defaultValue={lv.name}
                  onBlur={(e) => onRename(lv.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="h-6 w-16 border-0 px-1 text-caption shadow-none focus-visible:ring-0"
                />
                <button
                  type="button"
                  title="레벨 삭제"
                  onClick={() => onRemove(lv.id)}
                  className="flex size-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-brand-700"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              title="이 티어에 병렬 레벨 추가"
              onClick={() => onAddParallel(t)}
              className="flex items-center justify-center gap-0.5 rounded-radius-sm border border-dashed border-gray-300 py-0.5 text-caption text-gray-400 hover:border-gray-400 hover:text-gray-600"
            >
              <Plus size={11} /> 병렬
            </button>
          </div>
        </div>
      ))}
      <div className="flex items-start">
        {tiers.length > 0 && <span className="mx-1 mt-1.5 text-gray-300">›</span>}
        <Button variant="ghost" size="sm" onClick={onAddTier} className="h-7 gap-1 px-2 text-gray-500">
          <Plus size={13} /> 새 티어
        </Button>
      </div>
    </div>
  )
}
