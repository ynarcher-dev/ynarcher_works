import { Fragment, type ReactNode } from 'react'
import { Input, type InputProps } from '../components/Input'
import { Select } from '../components/Select'
import { IconButton } from '../components/IconButton'
import { cn } from '../utils/cn'
import { tableText } from '../densityScale'
import type { HierarchyGridCell, HierarchyGridGroup, HierarchyGridRow } from './hierarchyGrid'

export interface HierarchyTableColumn {
  key: string
  label: ReactNode
  className?: string
}

export interface HierarchyTableProps<T extends { id: string }> {
  caption: string
  levels: readonly string[]
  groups: readonly HierarchyGridGroup<T>[]
  columns: readonly HierarchyTableColumn[]
  /** 셀의 내용만 반환한다. 병합과 td는 공용 표가 소유한다. */
  renderHierarchyCell: (cell: HierarchyGridCell, level: number) => ReactNode
  /** 페이지별 데이터 열의 td들을 반환한다. */
  renderCells: (row: HierarchyGridRow<T>, index: number) => ReactNode
  renderActions?: (row: HierarchyGridRow<T>, index: number) => ReactNode
  /** 소계 등 페이지별 tr들을 반환한다. */
  renderGroupFooter?: (group: HierarchyGridGroup<T>) => ReactNode
  footer?: ReactNode
  emptyContent?: ReactNode
  mode?: 'edit' | 'view'
  /**
   * 맨 앞에 줄 번호(No.) 열을 세운다. 계층 표의 번호는 **잎 하나에 하나**다 — 화면에서
   * 한 줄로 보이는 것이 그것이고, 담당자가 "3번 문항"이라고 부르는 것도 그것이다.
   */
  numbered?: boolean
}

/** 품의에서 사용하는 가로 계층 표. 금액·파일·저장 API에 의존하지 않는다. */
export function HierarchyTable<T extends { id: string }>({
  caption, levels, groups, columns, renderHierarchyCell, renderCells,
  renderActions, renderGroupFooter, footer, emptyContent = '항목이 없습니다.', mode = 'edit',
  numbered = false,
}: HierarchyTableProps<T>) {
  const names = levels.length ? levels : ['1단계']
  const editing = mode === 'edit'
  const padding = editing ? 'px-2 py-1.5' : 'px-3 py-1.5'
  /**
   * 표의 최소 폭은 **단계 수를 따라 늘어난다.** 고정 폭이면 단계를 늘릴 때마다 이름 칸이
   * 서로를 밀어내 글자 두어 개도 못 담는 칸이 되는데, 계층 표에서 먼저 읽어야 하는 것이
   * 이름이다. 남는 폭이 없으면 칸을 줄이는 대신 감싼 칸이 가로로 스크롤한다.
   * 단계 몫 9rem은 `w-36`(이름 칸)과 같고, 나머지는 지금까지의 최소 폭(2단계 기준
   * 편집 56rem·읽기 48rem)에서 그 몫을 뺀 값이다.
   */
  const minWidth = `${(editing ? 38 : 30) + names.length * 9 + (numbered ? 3 : 0)}rem`
  return (
    <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-gray-200 bg-gray-25">
            {numbered && (
              <th scope="col" className={cn('w-10 text-right', padding, tableText.head)}>
                No.
              </th>
            )}
            {names.map((name, level) => (
              <th
                key={level}
                scope="col"
                // 이름 칸은 그 아래로는 줄지 않는다 — 이름+추가(+) 버튼이 서는 최소 폭이다.
                className={cn('w-36 min-w-[8rem] text-left', padding, tableText.head)}
              >
                {name || `${level + 1}단계`}
              </th>
            ))}
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn('text-left', padding, tableText.head, column.className)}>
                {column.label}
              </th>
            ))}
            {renderActions && <th scope="col" className={cn('w-24 text-center', padding)}><span className="sr-only">줄 조작</span></th>}
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr className="border-b border-gray-200 bg-gray-25">
              <td colSpan={(numbered ? 1 : 0) + names.length + columns.length + (renderActions ? 1 : 0)} className={padding}>{emptyContent}</td>
            </tr>
          )}
          {groups.map((group) => (
            <Fragment key={group.rows[0]?.row.id ?? group.rootIndex}>
              {group.rows.map((row, localIndex) => (
                <tr key={row.row.id} className="border-b border-gray-100">
                  {numbered && (
                    <td
                      className={cn(
                        'border-r border-gray-100 text-right align-middle text-gray-500',
                        editing ? 'px-2 py-1' : 'px-3 py-1.5',
                        tableText.meta,
                      )}
                    >
                      {group.startIndex + localIndex + 1}
                    </td>
                  )}
                  {names.map((_, level) => {
                    const cell = row.cells[level]
                    if (cell === null) return null
                    return (
                      <td key={level} rowSpan={cell?.rowSpan} className={cn(
                        'border-r border-gray-100 align-middle',
                        editing ? 'h-px px-2 py-1' : 'px-3 py-1.5',
                        !editing && tableText.body,
                      )}>
                        {cell ? renderHierarchyCell(cell, level) : null}
                      </td>
                    )
                  })}
                  {renderCells(row, group.startIndex + localIndex)}
                  {renderActions && <td className="px-2 py-1">{renderActions(row, group.startIndex + localIndex)}</td>}
                </tr>
              ))}
              {renderGroupFooter?.(group)}
            </Fragment>
          ))}
          {footer}
        </tbody>
      </table>
    </div>
  )
}

function HierarchyGlyph({ kind }: { kind: 'plus' | 'up' | 'down' | 'delete' }) {
  const paths = { plus: 'M8 3v10M3 8h10', up: 'M8 13V3M3 8l5-5 5 5', down: 'M8 3v10M3 8l5 5 5-5', delete: 'M3 4h10M6 4V2h4v2M5 6v7h6V6' }
  return <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg>
}

export interface HierarchyNameInputProps extends Omit<InputProps, 'action' | 'actionLabel' | 'onActionClick'> {
  levelLabel: string
  onAdd?: () => void
}

/**
 * 계층 이름 칸. **세로로도 자기 칸을 다 쓴다** — 자식을 여럿 거느려 세로로 병합된 분류
 * 칸에서 입력이 위쪽에만 붙어 있으면, 그 분류가 어디까지 걸치는지 테두리 선으로만 읽힌다.
 * `w-full`은 Input이 이미 들고 오고, 세로는 td(h-px) → 감싼 칸(h-full) → 여기로 이어진다.
 */
export function HierarchyNameInput({ levelLabel, onAdd, ...props }: HierarchyNameInputProps) {
  return <div className="flex h-full w-full items-stretch [&>div]:h-full"><Input density="table" className="h-full min-h-8"
    aria-label={levelLabel} {...props}
    action={onAdd ? <HierarchyGlyph kind="plus" /> : undefined}
    actionLabel={`${levelLabel} 추가`} onActionClick={onAdd}
  /></div>
}

export interface HierarchyLevelFieldsProps {
  levels: readonly string[]
  onCountChange: (count: number) => void
  onNameChange: (level: number, name: string) => void
  disabled?: boolean
  /** 현재 단계가 이 값보다 많아도 기존 선택지를 유지한다. */
  maxLevels?: number
}

export function HierarchyLevelFields({ levels, onCountChange, onNameChange, disabled, maxLevels = 5 }: HierarchyLevelFieldsProps) {
  const names = levels.length ? levels : ['1단계']
  return (
    <div className="grid gap-3 rounded-radius-md border border-gray-200 bg-gray-25 p-3 sm:grid-cols-[9rem_1fr]">
      <label className="space-y-1">
        <span className={tableText.head}>분류 단계 수</span>
        <Select density="table" value={String(names.length)} disabled={disabled} onChange={(e) => onCountChange(Number(e.target.value))}>
          {Array.from({ length: Math.max(maxLevels, names.length) }, (_, i) => <option key={i} value={i + 1}>{i + 1}단계</option>)}
        </Select>
      </label>
      <div className="min-w-0 space-y-1">
        <span className={tableText.head}>단계별 이름</span>
        <div className="relative min-w-0 max-w-full overflow-x-auto pb-1">
          <div className="flex min-w-max flex-nowrap items-center gap-2">
            {names.map((name, level) => <div key={level} className="w-28 shrink-0">
              <Input density="table" className="w-full" aria-label={`${level + 1}단계 이름`} placeholder={`${level + 1}단계`}
                value={name} disabled={disabled} onChange={(e) => onNameChange(level, e.target.value)} />
            </div>)}
          </div>
        </div>
      </div>
    </div>
  )
}

export interface HierarchyRowActionsProps {
  canMoveUp: boolean
  canMoveDown: boolean
  canRemove: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

export function HierarchyRowActions({ canMoveUp, canMoveDown, canRemove, onMoveUp, onMoveDown, onRemove }: HierarchyRowActionsProps) {
  return <div className="flex items-center justify-end gap-0.5">
    <IconButton density="table" variant="ghost" label="위로" disabled={!canMoveUp} onClick={onMoveUp} icon={<HierarchyGlyph kind="up" />} />
    <IconButton density="table" variant="ghost" label="아래로" disabled={!canMoveDown} onClick={onMoveDown} icon={<HierarchyGlyph kind="down" />} />
    <IconButton density="table" variant="ghost" danger label="줄 삭제" disabled={!canRemove} onClick={onRemove} icon={<HierarchyGlyph kind="delete" />} />
  </div>
}
