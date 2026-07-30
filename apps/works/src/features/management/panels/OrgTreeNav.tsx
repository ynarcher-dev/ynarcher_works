import { cn, IconButton } from '@ynarcher/ui'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import type { DeptTreeNode } from '@/features/management/panels/departmentsMock'

interface OrgTreeNavProps {
  tree: DeptTreeNode[]
  /** 현재 선택 부서(표시 범위의 기점). */
  selectedId: string
  /** 접힌 노드 id 집합. */
  collapsed: Set<string>
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  /** 전체 펼치기/접기. 하나라도 접혀 있으면 '펼치기'로 동작한다. */
  onExpandAll: () => void
  onCollapseAll: () => void
  /** 접힌 노드가 하나도 없으면 true(버튼 아이콘·라벨 전환). */
  allExpanded: boolean
  /** 트리가 비었을 때 문구. */
  emptyText?: string
}

interface TreeRowProps
  extends Pick<OrgTreeNavProps, 'selectedId' | 'collapsed' | 'onSelect' | 'onToggle'> {
  node: DeptTreeNode
}

/** 트리의 한 줄(재귀). 토글은 접힘만 담당하고, 이름 클릭이 표시 범위를 옮긴다. */
function TreeRow({ node, selectedId, collapsed, onSelect, onToggle }: TreeRowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isSelected = node.id === selectedId

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 rounded-radius-md pr-1 hover:bg-gray-50',
          isSelected && 'bg-brand-25 hover:bg-brand-25',
        )}
        style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <IconButton
            density="table"
            variant="ghost"
            label={isCollapsed ? '펼치기' : '접기'}
            onClick={() => onToggle(node.id)}
            icon={
              <ChevronRight
                size={14}
                className={cn('transition-transform', isCollapsed ? '' : 'rotate-90')}
              />
            }
          />
        ) : (
          <span className="w-icon-table shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={cn(
            'min-w-0 flex-1 truncate py-1.5 text-left text-body-sm',
            isSelected ? 'font-semibold text-brand-700' : 'text-gray-700 hover:text-gray-900',
          )}
        >
          {node.name}
        </button>
      </div>
      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            selectedId={selectedId}
            collapsed={collapsed}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}

/**
 * 조직 트리 내비게이션(좌측 열). 선택한 부서가 우측 본문의 기점이 된다.
 * OFFICE 부서 정보(인물 카드)와 MANAGEMENT 조직 관리(트리-테이블 편집)가 같은 좌측 열을 쓴다 —
 * 두 화면에서 조직을 고르는 방법이 달라지면 같은 원장을 두 가지로 익혀야 한다.
 *
 * 트리는 이동 수단이라 우측 본문의 정보(레벨·인원)를 반복하지 않고 이름만 세로로 세운다 —
 * 같은 정보를 두 번 그리면 어느 쪽을 봐야 하는지가 흐려진다.
 */
export function OrgTreeNav({
  tree,
  selectedId,
  collapsed,
  onSelect,
  onToggle,
  onExpandAll,
  onCollapseAll,
  allExpanded,
  emptyText = '등록된 조직이 없습니다.',
}: OrgTreeNavProps) {
  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 pr-3">
      <div className="mb-1 flex items-center justify-between pl-1">
        <span className="text-caption font-semibold text-gray-500">조직</span>
        <IconButton
          density="table"
          variant="ghost"
          label={allExpanded ? '전체 접기' : '전체 펼치기'}
          title={allExpanded ? '전체 접기' : '전체 펼치기'}
          onClick={allExpanded ? onCollapseAll : onExpandAll}
          icon={allExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
        />
      </div>
      {tree.length === 0 ? (
        <p className="py-6 text-center text-caption text-gray-500">{emptyText}</p>
      ) : (
        tree.map((root) => (
          <TreeRow
            key={root.id}
            node={root}
            selectedId={selectedId}
            collapsed={collapsed}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))
      )}
    </aside>
  )
}
