import { Button } from '@ynarcher/ui'
import type { DeptNode } from '@/features/management/panels/departmentsMock'

interface DeletedDeptListProps {
  /** 삭제 기점 노드들(하위는 함께 딸려가므로 기점만 세운다). */
  nodes: DeptNode[]
  onRestore: (id: string) => void
}

/**
 * 삭제된 조직 목록 — 복원만 제공한다(물리 삭제는 정책상 금지).
 * 조직도 본문과 같은 테두리를 쓰면 아직 살아있는 조직처럼 읽혀서 점선 테두리로 떼어 놓는다.
 */
export function DeletedDeptList({ nodes, onRestore }: DeletedDeptListProps) {
  if (nodes.length === 0) return null
  return (
    <div className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 p-3">
      <p className="mb-2 text-caption font-semibold text-gray-600">삭제된 조직</p>
      <ul className="space-y-1">
        {nodes.map((n) => (
          <li key={n.id} className="flex items-center gap-2 text-body text-gray-400">
            <span className="line-through">{n.name}</span>
            <span className="text-caption">(폐지)</span>
            <Button
              variant="ghost"
              onClick={() => onRestore(n.id)}
              className="ml-auto h-7 gap-1 px-2 text-gray-600"
            >
              복원
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
