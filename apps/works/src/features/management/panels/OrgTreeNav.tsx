import {
  cn,
  IconButton,
  SidePanelNav,
  SidePanelNavEmpty,
  SidePanelNavGroup,
  sidePanelNavRow,
} from '@ynarcher/ui'
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

/**
 * 트리의 한 줄(재귀). 토글은 접힘만 담당하고, 이름 클릭이 표시 범위를 옮긴다.
 *
 * 행 전체를 버튼으로 쓰는 `SidePanelNavRow`를 쓰지 못하는 이유는 토글이다 — 버튼 안에 버튼을
 * 둘 수 없어 구조가 갈린다. 그래서 구조만 여기 두고 **규격은 `sidePanelNavRow`에서
 * 그대로 가져온다**(값을 다시 적으면 문서함 좌패널과 조용히 어긋난다).
 */
function TreeRow({ node, selectedId, collapsed, onSelect, onToggle }: TreeRowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isSelected = node.id === selectedId

  return (
    <>
      {/* 세로 여백은 이름 버튼이 갖는다 — 토글 버튼이 자기 높이를 갖고 있어 행에 py를 주면
          두 번 더해진다. 들여쓰기는 depth가 정한다. */}
      <div
        className={cn(sidePanelNavRow.row(isSelected), 'py-0 pl-0')}
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
          className={cn(sidePanelNavRow.label(isSelected), 'py-1.5 text-left')}
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
    <SidePanelNav>
      <SidePanelNavGroup
        label="조직"
        action={
          <IconButton
            density="table"
            variant="ghost"
            label={allExpanded ? '전체 접기' : '전체 펼치기'}
            title={allExpanded ? '전체 접기' : '전체 펼치기'}
            onClick={allExpanded ? onCollapseAll : onExpandAll}
            icon={allExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          />
        }
      >
        {tree.length === 0 ? (
          <SidePanelNavEmpty>{emptyText}</SidePanelNavEmpty>
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
      </SidePanelNavGroup>
    </SidePanelNav>
  )
}
