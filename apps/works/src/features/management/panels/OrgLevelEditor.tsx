import { Button, Input } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import type { OrgLevel } from '@/features/management/panels/departmentsMock'

interface OrgLevelEditorProps {
  levels: OrgLevel[]
  /** 이름 변경 확정(blur/Enter). 변경 없으면 호출돼도 무시된다. */
  onRename: (id: string, name: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

/**
 * 조직 레벨(계층) 정의 바. 여기서 정한 레벨 이름(변수명)이 인사관리 컬럼 헤더가 되고,
 * 각 부서 노드가 어떤 레벨인지는 트리에서 지정한다. 상위→하위 순서는 왼쪽→오른쪽.
 * 입력은 비제어(defaultValue)로 두고 blur/Enter에서 저장한다(키 입력마다 저장 방지).
 */
export function OrgLevelEditor({ levels, onRename, onAdd, onRemove }: OrgLevelEditorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2">
      <span className="text-caption font-semibold text-gray-500">조직 레벨</span>
      {levels.map((lv, i) => (
        <div key={lv.id} className="flex items-center">
          {i > 0 && <span className="mr-2 text-gray-300">›</span>}
          <div className="flex items-center gap-0.5 rounded-radius-sm border border-gray-300 bg-white pl-1 pr-0.5">
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
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={onAdd} className="h-7 gap-1 px-2 text-gray-500">
        <Plus size={13} /> 레벨 추가
      </Button>
    </div>
  )
}
