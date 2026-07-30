import { cn, IconButton, Input, Select } from '@ynarcher/ui'
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState, type DragEvent } from 'react'
import type { OrgEditing } from '@/features/management/orgEditHooks'
import {
  canDrop,
  collapsibleIds,
  filterTree,
  type DeptTreeNode,
  type DropPos,
} from '@/features/management/panels/departmentsMock'

/** 커서 Y 위치를 행 높이로 나눠 앞(<25%)/뒤(>75%)/안쪽(그 사이)을 판정한다. */
function dropPosFromEvent(e: DragEvent): DropPos {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientY - rect.top) / rect.height
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

interface RowProps {
  node: DeptTreeNode
  editing: OrgEditing
  selectedId: string
  onSelect: (id: string) => void
  collapsed: Set<string>
  onToggle: (id: string) => void
  drag: {
    id: string | null
    hint: { id: string; pos: DropPos } | null
    onStart: (id: string) => void
    onOver: (e: DragEvent, id: string) => void
    onDrop: (id: string) => void
    onEnd: () => void
  }
}

/**
 * 편집 트리의 한 줄(재귀). 조직명을 누르면 그 자리에서 이름을 고치고, 옆 셀렉트로 레벨을 정한다 —
 * 이름과 레벨은 "이 조직이 무엇인가"를 이루는 한 쌍이라 한 줄에 붙여 둔다.
 * 선택(우측 인력 배치의 대상)은 이름 클릭이 아니라 행 클릭이 옮긴다.
 */
function Row({ node, editing, selectedId, onSelect, collapsed, onToggle, drag }: RowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isSelected = node.id === selectedId
  const isEditing = editing.editingId === node.id
  const hint = drag.hint?.id === node.id ? drag.hint.pos : null

  return (
    <>
      <div
        draggable={!isEditing}
        onDragStart={(e) => {
          // Firefox는 setData가 있어야 드래그가 개시된다.
          e.dataTransfer.setData('text/plain', node.id)
          e.dataTransfer.effectAllowed = 'move'
          drag.onStart(node.id)
        }}
        onDragOver={(e) => drag.onOver(e, node.id)}
        onDrop={() => drag.onDrop(node.id)}
        onDragEnd={drag.onEnd}
        onClick={() => onSelect(node.id)}
        className={cn(
          'group relative flex items-center gap-1 rounded-radius-md py-0.5 pr-1 hover:bg-gray-50',
          isSelected && 'bg-brand-25 hover:bg-brand-25',
          hint === 'inside' && 'ring-1 ring-inset ring-info/50',
        )}
        style={{ paddingLeft: `${node.depth * 14 + 2}px` }}
      >
        {hint === 'before' && (
          <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-info" />
        )}
        {hint === 'after' && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-info" />
        )}

        <GripVertical
          size={13}
          className="shrink-0 cursor-grab text-gray-300 group-hover:text-gray-400"
          aria-hidden
        />
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

        {isEditing ? (
          <Input
            autoFocus
            value={editing.draft}
            onChange={(e) => editing.setDraft(e.target.value)}
            onBlur={editing.commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') editing.commitRename()
              if (e.key === 'Escape') editing.cancelRename()
            }}
            className="h-7 min-w-[8rem] flex-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => editing.startRename(node)}
            title="클릭하여 이름 변경"
            className={cn(
              // 이름 칸은 8rem 아래로 줄지 않는다 — 레벨 셀렉트·액션이 고정폭이라 그냥 두면
              // 깊은 조직에서 이름만 0에 수렴해 무엇을 고치는지 알 수 없게 된다.
              'min-w-[8rem] flex-1 truncate rounded px-1 py-1 text-left text-body-sm hover:bg-gray-100',
              node.hrHidden ? 'text-gray-400' : 'text-gray-800',
              isSelected && 'font-semibold text-brand-700',
            )}
          >
            {node.name}
          </button>
        )}

        <Select
          value={node.levelId}
          onChange={(e) => editing.changeNodeLevel(node.id, e.target.value)}
          density="table"
          className="w-32 shrink-0"
          title="조직 레벨"
        >
          {editing.levels.map((lv) => (
            <option key={lv.id} value={lv.id}>
              {lv.name}
            </option>
          ))}
        </Select>

        <span
          className={cn(
            'flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
            isSelected && 'opacity-100',
          )}
        >
          <IconButton
            density="table"
            variant="ghost"
            label="하위 조직 추가"
            title="하위 조직 추가"
            onClick={() => void editing.addDept(node.id)}
            icon={<Plus size={14} />}
          />
          <IconButton
            density="table"
            variant="ghost"
            label={node.hrHidden ? '인사관리 컬럼에 노출' : '인사관리 컬럼에서 숨김'}
            title={node.hrHidden ? '인사관리 컬럼에 노출' : '인사관리 컬럼에서 숨김'}
            onClick={() => editing.toggleHrHidden(node.id, !node.hrHidden)}
            icon={node.hrHidden ? <EyeOff size={13} /> : <Eye size={13} />}
            className={node.hrHidden ? 'text-info' : undefined}
          />
          <IconButton
            density="table"
            variant="ghost"
            danger
            label="삭제"
            title="삭제"
            onClick={() => editing.remove(node.id)}
            icon={<Trash2 size={13} />}
          />
        </span>
      </div>

      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <Row
            key={child.id}
            node={child}
            editing={editing}
            selectedId={selectedId}
            onSelect={onSelect}
            collapsed={collapsed}
            onToggle={onToggle}
            drag={drag}
          />
        ))}
    </>
  )
}

interface OrgEditTreeProps {
  editing: OrgEditing
  /** 우측 인력 배치의 대상 조직. */
  selectedId: string
  onSelect: (id: string) => void
  /** 툴바 검색어(조직명). 걸린 노드와 그 조상만 남긴다. */
  keyword: string
}

/**
 * 직접 편집의 좌측 패널 — 조직을 만들고, 이름을 고치고, 레벨을 정하고, 자리를 옮긴다.
 *
 * 조직의 골격(무엇이 있고 어디에 붙는가)은 전부 이 한 곳에서 다룬다. 예전처럼 골격을 우측 표에서도
 * 고칠 수 있게 두면 같은 일을 하는 자리가 둘이 되어, 어느 쪽이 "진짜"인지 매번 되짚게 된다.
 * 우측은 그래서 사람 배치만 맡는다.
 */
export function OrgEditTree({ editing, selectedId, onSelect, keyword }: OrgEditTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [hint, setHint] = useState<{ id: string; pos: DropPos } | null>(null)

  const tree = filterTree(editing.tree, keyword)
  const allExpanded = collapsed.size === 0

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const drag = {
    id: dragId,
    hint,
    onStart: setDragId,
    onOver: (e: DragEvent, id: string) => {
      if (!dragId || !canDrop(editing.nodes, dragId, id)) return
      e.preventDefault()
      const pos = dropPosFromEvent(e)
      setHint((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }))
    },
    onDrop: (id: string) => {
      if (dragId && hint?.id === id) editing.move(dragId, id, hint.pos)
      setDragId(null)
      setHint(null)
    },
    onEnd: () => {
      setDragId(null)
      setHint(null)
    },
  }

  const addRoot = async () => onSelect(await editing.addDept(null))

  return (
    // 편집 트리는 한 줄에 이름·레벨·액션이 함께 서므로 조회용 트리(w-60)보다 넓어야 한다.
    // 가장 깊은 조직에서도 이름 8rem + 레벨 8rem + 액션이 잘리지 않는 폭으로 잡았다.
    <aside className="w-[30rem] shrink-0 border-r border-gray-200 pr-3">
      <div className="mb-1 flex items-center justify-between pl-1">
        <span className="text-caption font-semibold text-gray-500">조직</span>
        <span className="flex items-center gap-0.5">
          <IconButton
            density="table"
            variant="ghost"
            label="최상위 조직 추가"
            title="최상위 조직 추가"
            onClick={() => void addRoot()}
            icon={<Plus size={14} />}
          />
          <IconButton
            density="table"
            variant="ghost"
            label={allExpanded ? '전체 접기' : '전체 펼치기'}
            title={allExpanded ? '전체 접기' : '전체 펼치기'}
            onClick={() =>
              setCollapsed(allExpanded ? collapsibleIds(editing.tree) : new Set<string>())
            }
            icon={allExpanded ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
          />
        </span>
      </div>
      {tree.length === 0 ? (
        <p className="py-6 text-center text-caption text-gray-500">
          {keyword.trim() ? '검색 결과가 없습니다.' : '‘＋’로 첫 조직을 추가하세요.'}
        </p>
      ) : (
        tree.map((root) => (
          <Row
            key={root.id}
            node={root}
            editing={editing}
            selectedId={selectedId}
            onSelect={onSelect}
            collapsed={collapsed}
            onToggle={toggle}
            drag={drag}
          />
        ))
      )}
    </aside>
  )
}
