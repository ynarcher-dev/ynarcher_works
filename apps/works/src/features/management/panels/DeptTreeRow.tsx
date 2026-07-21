import { Button, InlineSelect, Input, cn } from '@ynarcher/ui'
import { Check, ChevronRight, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import type { DragEvent } from 'react'
import {
  type DeptTreeNode,
  type DropPos,
  type Employee,
  type OrgLevel,
} from '@/features/management/panels/departmentsMock'

interface DeptTreeRowProps {
  node: DeptTreeNode
  collapsed: Set<string>
  editingId: string | null
  draft: string
  /** 현재 드롭 예정 위치(대상 노드 id + 방향). 표시선 렌더용. */
  dropHint: { id: string; pos: DropPos } | null
  /** 부서 id → 직접 소속 임직원. 행별 인원 표시용. */
  membersByDept: Map<string, Employee[]>
  /** 조직 레벨 정의(레벨 태그 셀렉트용). */
  levels: OrgLevel[]
  onChangeLevel: (id: string, levelId: string) => void
  onManageMembers: (id: string) => void
  onDraftChange: (v: string) => void
  onToggle: (id: string) => void
  onStartEdit: (node: DeptTreeNode) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onAddChild: (parentId: string) => void
  onToggleHrHidden: (id: string, hidden: boolean) => void
  onDelete: (id: string) => void
  onDragStartRow: (id: string) => void
  onDragOverRow: (e: DragEvent, id: string) => void
  onDropRow: (id: string) => void
  onDragEndRow: () => void
  /** false면 읽기전용: 드래그·이름편집·레벨셀렉트·인력배치·액션 버튼을 비활성/숨김. 기본 true. */
  editable?: boolean
  structureActionsEnabled?: boolean
}

/** 행/헤더 공용 그리드 컬럼: 조직명 | 레벨 | 인원 | 액션. 헤더와 행 정렬을 맞춘다. */
export const DEPT_GRID = 'grid grid-cols-[minmax(0,20rem)_6rem_1fr_7.25rem]'

/** 커서 Y 위치를 행 높이로 나눠 앞(<25%)/뒤(>75%)/안쪽(그 사이)을 판정한다. */
export function dropPosFromEvent(e: DragEvent): DropPos {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = (e.clientY - rect.top) / rect.height
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

/** 조직도 트리-테이블의 단일 행(재귀). 들여쓰기는 depth로, 접힘은 collapsed 집합으로 제어한다. */
export function DeptTreeRow(props: DeptTreeRowProps) {
  const { node, collapsed, editingId, dropHint } = props
  const editable = props.editable ?? true
  const structureActionsEnabled = props.structureActionsEnabled ?? true
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isEditing = editable && editingId === node.id
  const isRoot = node.depth === 0
  const hint = dropHint?.id === node.id ? dropHint.pos : null
  const members = props.membersByDept.get(node.id) ?? []
  const levelName = props.levels.find((lv) => lv.id === node.levelId)?.name ?? '-'

  return (
    <>
      <div
        draggable={editable && structureActionsEnabled && !isEditing}
        onDragStart={(e) => {
          if (!editable || !structureActionsEnabled) return
          // Firefox는 setData가 있어야 드래그가 개시된다.
          e.dataTransfer.setData('text/plain', node.id)
          e.dataTransfer.effectAllowed = 'move'
          props.onDragStartRow(node.id)
        }}
        onDragOver={(e) => editable && structureActionsEnabled && props.onDragOverRow(e, node.id)}
        onDrop={() => editable && structureActionsEnabled && props.onDropRow(node.id)}
        onDragEnd={props.onDragEndRow}
        className={cn(
          DEPT_GRID,
          'group relative items-center gap-2 border-b border-gray-100 py-2 pr-2 hover:bg-gray-25',
          hint === 'inside' && 'bg-info-subtle ring-1 ring-inset ring-info/40',
        )}
      >
        {/* 드롭 위치 표시선(형제 앞/뒤) */}
        {hint === 'before' && (
          <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-info" />
        )}
        {hint === 'after' && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-info" />
        )}

        {/* 열1: 조직명(들여쓰기 · 드래그 핸들 · 토글 · 이름) */}
        <div
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: `${node.depth * 20 + 8}px` }}
        >
          {editable && structureActionsEnabled ? (
            <GripVertical
              size={14}
              className="shrink-0 cursor-grab text-gray-300 group-hover:text-gray-400"
              aria-hidden
            />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {hasChildren ? (
            <Button
              variant="ghost"
              onClick={() => props.onToggle(node.id)}
              className="h-6 w-6 shrink-0 px-0"
              aria-label={isCollapsed ? '펼치기' : '접기'}
            >
              <ChevronRight
                size={16}
                className={cn('transition-transform', isCollapsed ? '' : 'rotate-90')}
              />
            </Button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          {isEditing ? (
            <Input
              autoFocus
              value={props.draft}
              onChange={(e) => props.onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') props.onCommitEdit()
                if (e.key === 'Escape') props.onCancelEdit()
              }}
              className="h-7 max-w-56"
            />
          ) : editable ? (
            <button
              type="button"
              onClick={() => props.onStartEdit(node)}
              title="클릭하여 이름 변경"
              className={cn(
                'truncate rounded px-1 text-left hover:bg-gray-100',
                isRoot ? 'text-body font-semibold' : 'text-body',
                node.hrHidden ? 'text-gray-400' : isRoot ? 'text-gray-900' : 'text-gray-700',
              )}
            >
              {node.name}
            </button>
          ) : (
            <span
              className={cn(
                'truncate px-1',
                isRoot ? 'text-body font-semibold' : 'text-body',
                node.hrHidden ? 'text-gray-400' : isRoot ? 'text-gray-900' : 'text-gray-700',
              )}
            >
              {node.name}
            </span>
          )}
          {node.hrHidden && !isEditing && (
            <span
              title="인사관리 컬럼 미노출"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.6875rem] text-gray-600"
            >
              <EyeOff size={11} /> 인사 미노출
            </span>
          )}
        </div>

        {/* 열2: 조직 레벨(노드별 지정 · 인사관리 컬럼 파생) */}
        <div>
          {!isEditing &&
            (editable && structureActionsEnabled ? (
              <InlineSelect
                value={node.levelId}
                onChange={(e) => props.onChangeLevel(node.id, e.target.value)}
                className="w-20"
                title="조직 레벨"
              >
                {props.levels.map((lv) => (
                  <option key={lv.id} value={lv.id}>
                    {lv.name}
                  </option>
                ))}
              </InlineSelect>
            ) : (
              <span className="px-1 text-caption text-gray-600">{levelName}</span>
            ))}
        </div>

        {/* 열3: 소속 인원(클릭 시 인력 배치 모달) */}
        <div className="min-w-0">
          {!isEditing &&
            (editable ? (
              <button
                type="button"
                onClick={() => props.onManageMembers(node.id)}
                title="인력 배치"
                className="flex w-full flex-wrap items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-gray-100"
              >
                {members.length > 0 ? (
                  <>
                    {members.slice(0, 6).map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-caption text-gray-700"
                      >
                        {m.name}
                      </span>
                    ))}
                    {members.length > 6 && (
                      <span className="text-caption text-gray-600">외 {members.length - 6}명</span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-caption text-gray-500">
                    <Users size={13} /> 배치
                  </span>
                )}
              </button>
            ) : (
              <div className="flex w-full flex-wrap items-center gap-1 px-1.5 py-0.5">
                {members.length > 0 ? (
                  <>
                    {members.slice(0, 6).map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-caption text-gray-700"
                      >
                        {m.name}
                      </span>
                    ))}
                    {members.length > 6 && (
                      <span className="text-caption text-gray-600">외 {members.length - 6}명</span>
                    )}
                  </>
                ) : (
                  <span className="text-caption text-gray-300">-</span>
                )}
              </div>
            ))}
        </div>

        {/* 열4: 액션 메뉴(편집 모드에서만 노출) */}
        <div className="flex items-center justify-end gap-0.5">
          {editable && isEditing && (
            <>
              <Button
                variant="ghost"
                title="저장"
                onClick={props.onCommitEdit}
                className="h-7 w-7 px-0 text-info"
              >
                <Check size={14} />
              </Button>
              <Button
                variant="ghost"
                title="취소"
                onClick={props.onCancelEdit}
                className="h-7 w-7 px-0 text-gray-400"
              >
                <X size={14} />
              </Button>
            </>
          )}
          {editable && structureActionsEnabled && !isEditing && (
            <>
              <Button
                variant="ghost"
                title="하위 부서 추가"
                onClick={() => props.onAddChild(node.id)}
                className="h-7 w-7 px-0 text-gray-500"
              >
                <Plus size={15} />
              </Button>
              <Button
                variant="ghost"
                title="이름 변경"
                onClick={() => props.onStartEdit(node)}
                className="h-7 w-7 px-0 text-gray-500"
              >
                <Pencil size={14} />
              </Button>
              <Button
                variant="ghost"
                title={node.hrHidden ? '인사관리 컬럼에 노출' : '인사관리 컬럼에서 숨김'}
                onClick={() => props.onToggleHrHidden(node.id, !node.hrHidden)}
                className={cn(
                  'h-7 w-7 px-0',
                  node.hrHidden ? 'text-info' : 'text-gray-400',
                )}
              >
                {node.hrHidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
              <Button
                variant="ghost"
                title="삭제"
                onClick={() => props.onDelete(node.id)}
                className="h-7 w-7 px-0 text-gray-400 hover:bg-brand-25 hover:text-brand-700"
              >
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 자식(펼침 상태일 때만) */}
      {hasChildren &&
        !isCollapsed &&
        node.children.map((child) => (
          <DeptTreeRow key={child.id} {...props} node={child} />
        ))}
    </>
  )
}
