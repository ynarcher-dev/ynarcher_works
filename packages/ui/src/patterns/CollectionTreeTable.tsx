import { useCallback, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { DensityProvider } from '../density'
import { IconButton } from '../components/IconButton'
import {
  columnWidthScale,
  formText,
  iconScale,
  tableCellDensity,
  tableGridScale,
  tableTextScale,
  type TableStage,
} from '../densityScale'
import {
  collectExpandableIds,
  findParentRowId,
  flattenCollectionTree,
  type CollectionTreeNode,
  type CollectionTreeRow,
} from './collectionTree'

export type {
  CollectionNodeKind,
  CollectionTreeNode,
  CollectionTreeRow,
} from './collectionTree'

/**
 * 아이콘 획 굵기. `packages/ui`는 아이콘 라이브러리에 의존하지 않으므로(`SidePanelNav` 주석
 * 참조) 화살표·종류 표식은 여기서 직접 그린다. **글리프 크기는 상수가 아니라 자리(`stage`)가
 * 내려주는 밀도(`tableCellDensity` → `iconScale`)를 따른다** — 표 밀도를 못 박으면 페이지 자리에
 * 놓였을 때 셀 글자만 커지고 아이콘이 뒤처진다.
 */
const GLYPH_STROKE = 1.8

/**
 * 한 단 들여쓰기의 폭(px)과 화면에서 접어 주는 최대 단.
 *
 * 깊이는 원장이 정하고 제한이 없지만, 들여쓰기를 깊이만큼 그대로 주면 20단짜리 트리에서 이름
 * 칸이 320px 화면에서 사라진다. 그래서 **화면의 들여쓰기만** 여기서 접고, 실제 깊이와 전체
 * 경로는 줄의 `title`(그리고 `aria-level`)이 답한다 — 접는 것은 보이는 폭이지 정보가 아니다.
 */
const INDENT_PX = 14
const INDENT_MAX_DEPTH = 8

/**
 * 표가 줄어들 수 있는 하한.
 *
 * `table-fixed`는 폭이 모자라면 열을 순서대로 굶긴다 — 320px 화면에서 상태·관리 열이 제 폭을
 * 가져가고 나면 이름 열이 0에 수렴해 문항 이름이 화면에서 사라진다. 그래서 표에 하한을 주고,
 * 모자라는 폭은 안쪽 상자의 가로 스크롤이 받는다. 감추는 것보다 밀어 보이는 쪽을 택한다.
 */
const TABLE_MIN_WIDTH = 'min-w-[40rem]'
/** 설명 열이 함께 서는 경우의 하한 — 이름·설명·상태가 각자 읽히려면 한 칸 더 필요하다. */
const TABLE_MIN_WIDTH_WIDE = 'min-w-[52rem]'

const chevronPath = (expanded: boolean) => (expanded ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4')

function Chevron({ expanded, glyph }: { expanded: boolean; glyph: number }) {
  return (
    <svg
      aria-hidden
      width={glyph}
      height={glyph}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={chevronPath(expanded)} />
    </svg>
  )
}

function KindGlyph({ kind, glyph }: { kind: CollectionTreeNode['node_kind']; glyph: number }) {
  return (
    <svg
      aria-hidden
      width={glyph}
      height={glyph}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'FOLDER' ? (
        <path d="M2 4.5A1.5 1.5 0 013.5 3h2.2l1.3 1.6h5.5A1.5 1.5 0 0114 6.1v5.4A1.5 1.5 0 0112.5 13h-9A1.5 1.5 0 012 11.5v-7z" />
      ) : (
        <>
          <path d="M4 2h5l3 3v9H4z" />
          <path d="M9 2v3h3" />
        </>
      )}
    </svg>
  )
}

export interface CollectionTreeTableProps {
  /** 원장 그대로의 마디 목록. 순서·부모 관계는 이 배열이 답하고 화면은 바꾸지 않는다. */
  nodes: readonly CollectionTreeNode[]
  /** 표가 무엇을 담는지 알려주는 한 줄. 화면에는 보이지 않고 보조기술이 읽는다. */
  caption: string
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** 펼친 마디. 주면 화면이 소유하고(제어), 주지 않으면 이 부품이 기억한다. */
  expandedIds?: readonly string[]
  onExpandedChange?: (ids: string[]) => void
  /**
   * 처음 펼쳐 둘 마디. 생략하면 **자식이 있는 마디를 모두 펼친다** — 파일받기 트리는 무엇을
   * 내야 하는지가 화면의 주제라 접힌 채로 시작하면 그 답이 한 단계 뒤로 숨는다.
   */
  defaultExpandedIds?: readonly string[]
  /**
   * 설명 열을 세울지. 마디의 `description`이 한 줄로 서고 넘치면 말줄임한다.
   *
   * 이름 칸에 곁들이지 않고 **제 열**로 두는 이유는 폭 때문이다 — 한 칸에 둘을 담으면 이름과
   * 설명이 서로의 폭을 빼앗아 둘 다 잘리고, 줄마다 잘리는 지점이 달라 세로로 읽히지 않는다.
   */
  showDescription?: boolean
  descriptionLabel?: string
  /**
   * 첨부파일 열(상태 **왼쪽**). 주지 않으면 열 자체가 서지 않는다.
   *
   * 표식을 여기서 그리지 않고 화면에서 받는 이유는 `packages/ui`가 아이콘 라이브러리에 기대지
   * 않기 때문이다 — 목록 화면들이 이미 쓰는 클립(lucide `Paperclip`)을 그대로 넘겨야 같은
   * 표식이 앱 전체에서 한 모양으로 선다.
   */
  renderAttachment?: (node: CollectionTreeNode) => ReactNode
  attachmentLabel?: string
  /** 상태 열. 주지 않으면 열 자체가 서지 않는다. */
  renderStatus?: (node: CollectionTreeNode) => ReactNode
  statusLabel?: string
  /** 관리 열(행 하나에 걸리는 조작). 주지 않으면 열 자체가 서지 않는다. */
  renderActions?: (node: CollectionTreeNode) => ReactNode
  actionsLabel?: string
  /** 이름 열 머리글. */
  nameLabel?: string
  emptyMessage?: ReactNode
  /**
   * 바깥 상자의 예외값(여백·최대 높이 등). 색·테두리·글자를 화면이 바꾸라는 뜻이 아니다.
   */
  className?: string
  /** 표가 놓인 자리. 카드 안이 기본이다. */
  stage?: TableStage
}

/**
 * 폴더 트리를 표로 세우는 공용 부품 — WORKS(문항 편집)와 GUEST(제출 화면)가 함께 쓴다.
 *
 * 표로 세우는 이유는 줄마다 이름 말고 **상태와 조작**이 함께 서기 때문이다(좌패널 트리는 이름
 * 하나만 서므로 `SidePanelNav`가 맞다). 그래서 격자·글자·열 폭은 표의 값(`tableGridScale` 등)을
 * 쓰고, 접근성은 트리와 표를 겸하는 `treegrid`로 알린다.
 *
 * 순수 props 부품이다 — 조회도 저장도 하지 않고, 줄을 미는 일(순서·부모 변경)은 `renderActions`로
 * 받은 화면 쪽 조작이 맡는다.
 */
export function CollectionTreeTable({
  nodes,
  caption,
  selectedId,
  onSelect,
  expandedIds,
  onExpandedChange,
  defaultExpandedIds,
  showDescription = false,
  descriptionLabel = '설명',
  renderAttachment,
  attachmentLabel = '첨부파일',
  renderStatus,
  statusLabel = '상태',
  renderActions,
  actionsLabel = '관리',
  nameLabel = '이름',
  emptyMessage = '항목이 없습니다.',
  className,
  stage = 'card',
}: CollectionTreeTableProps) {
  const grid = tableGridScale[stage]
  const text = tableTextScale[stage]
  const width = columnWidthScale[stage]

  /**
   * 펼침 상태. `null`은 "아직 손대지 않았다"는 뜻이고, 그때는 기본값(전체 펼침 또는
   * `defaultExpandedIds`)을 따른다 — 원장이 나중에 도착해도 새로 온 마디가 함께 펼쳐진다.
   */
  const [ownExpanded, setOwnExpanded] = useState<Set<string> | null>(null)
  const bodyRef = useRef<HTMLTableSectionElement | null>(null)

  const expandedSet = useMemo(() => {
    if (expandedIds) return new Set(expandedIds)
    if (ownExpanded) return ownExpanded
    return new Set(defaultExpandedIds ?? collectExpandableIds(nodes))
  }, [expandedIds, ownExpanded, defaultExpandedIds, nodes])

  const rows = useMemo(() => flattenCollectionTree(nodes, expandedSet), [nodes, expandedSet])

  const commitExpanded = useCallback(
    (next: Set<string>) => {
      if (!expandedIds) setOwnExpanded(next)
      onExpandedChange?.([...next])
    },
    [expandedIds, onExpandedChange],
  )

  const setExpanded = useCallback(
    (id: string, open: boolean) => {
      const next = new Set(expandedSet)
      if (open) next.add(id)
      else next.delete(id)
      commitExpanded(next)
    },
    [expandedSet, commitExpanded],
  )

  const [focusId, setFocusId] = useState<string | null>(null)
  const activeId =
    (focusId && rows.some((r) => r.node.id === focusId) && focusId) ||
    (selectedId && rows.some((r) => r.node.id === selectedId) && selectedId) ||
    rows[0]?.node.id ||
    null

  const focusRow = useCallback((id: string) => {
    setFocusId(id)
    const body = bodyRef.current
    if (!body) return
    const target = body.querySelector<HTMLElement>(`[data-row-id="${cssEscape(id)}"]`)
    target?.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableSectionElement>) => {
      if (rows.length === 0) return
      const current = (event.target as HTMLElement).closest<HTMLElement>('[data-row-id]')
      if (!current) return
      /*
        줄 자체에 선 경우에만 트리 키를 가로챈다. 관리 열에는 화면이 넣은 입력칸·선택상자·버튼이
        서는데, 여기서 방향키·Home·End까지 먹으면 글자 사이 이동과 목록 열기가 막힌다 — 표의
        조작이 셀 안 조작을 이긴다는 뜻이 되어, 키보드만 쓰는 사람에게는 그 칸이 잠긴다.
      */
      if (event.target !== current) return
      const id = current.dataset.rowId
      const index = rows.findIndex((r) => r.node.id === id)
      const row = index >= 0 ? rows[index] : undefined
      if (!row) return
      const next = rows[index + 1]
      const prev = rows[index - 1]
      const first = rows[0]
      const last = rows[rows.length - 1]

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (next) focusRow(next.node.id)
          break
        case 'ArrowUp':
          event.preventDefault()
          if (prev) focusRow(prev.node.id)
          break
        case 'ArrowRight':
          event.preventDefault()
          if (row.hasChildren && !row.expanded) setExpanded(row.node.id, true)
          else if (row.hasChildren && next) focusRow(next.node.id)
          break
        case 'ArrowLeft': {
          event.preventDefault()
          if (row.hasChildren && row.expanded) {
            setExpanded(row.node.id, false)
            break
          }
          const parentId = findParentRowId(rows, index)
          if (parentId) focusRow(parentId)
          break
        }
        case 'Home':
          event.preventDefault()
          if (first) focusRow(first.node.id)
          break
        case 'End':
          event.preventDefault()
          if (last) focusRow(last.node.id)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          onSelect?.(row.node.id)
          break
        default:
          break
      }
    },
    [rows, focusRow, setExpanded, onSelect],
  )

  const columnCount =
    1 +
    (showDescription ? 1 : 0) +
    (renderAttachment ? 1 : 0) +
    (renderStatus ? 1 : 0) +
    (renderActions ? 1 : 0)

  return (
    <DensityProvider value={tableCellDensity[stage]}>
      {/*
        바깥 상자가 테두리를 그리고 넘치는 것을 잘라 둔다. `min-w-0`가 핵심이다 — 이 표가 flex
        칸에 들어가면 기본 `min-width:auto` 때문에 안쪽 내용이 상자를 밀어 **페이지 전체**가
        가로로 밀린다. 가로 스크롤이 필요하면 안쪽 상자가 맡는다.
      */}
      <div
        className={cn(
          'w-full min-w-0 max-w-full overflow-hidden rounded-radius-md border border-gray-300 bg-white shadow-soft',
          className,
        )}
      >
        {/*
          `relative`가 붙어 있어야 한다 — 장식이 아니라 **가로 넘침을 이 상자 안에 가두는 장치**다.
          `sr-only`(캡션과 '필수' 표식)는 `position:absolute`인데, 이 상자가 static이면 포함
          블록이 되지 못해 그 글자들이 스크롤 상자를 빠져나가 **문서**에 걸린다. 그러면 표는
          제대로 잘려 있는데도 320·375px 화면에서 페이지 전체가 가로로 밀린다(표 최소폭 40rem이
          곧 문서 폭이 된다). 이 상자를 포함 블록으로 만들면 그 자리도 상자 안이 된다.
        */}
        <div className="relative w-full overflow-x-auto">
          {/*
            `table-fixed`라야 폭을 선언한 열이 그 폭을 지키고, 이름 열의 긴 글자가 표를 늘리지
            못한다. 공백 없는 200자짜리 문항 이름이 행·버튼·페이지를 미는 일이 여기서 막힌다.
          */}
          <table
            role="treegrid"
            aria-label={caption}
            className={cn(
              'w-full table-fixed border-separate border-spacing-0',
              showDescription ? TABLE_MIN_WIDTH_WIDE : TABLE_MIN_WIDTH,
            )}
          >
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-gray-25">
              <tr role="row">
                <th
                  role="columnheader"
                  scope="col"
                  className={cn(
                    grid.row,
                    // 설명이 함께 설 때만 이름 폭을 묶는다. 이름은 대개 짧고(문서 한 장의 이름)
                    // 넘치면 그 자리에서 접히지만, 설명은 문장이라 폭이 모자라면 바로 잘린다 —
                    // 그래서 남는 폭은 설명에 주고 이름은 1/4로 묶는다(2026-09-14 사용자 지정).
                    // 들여쓰기·글리프가 함께 서는 칸이라 표 하한(52rem)에서도 13rem은 남는다.
                    showDescription && 'w-1/4',
                    'border-b border-gray-300 text-left',
                    grid.cellX,
                    text.head,
                  )}
                >
                  {nameLabel}
                </th>
                {showDescription && (
                  <th
                    role="columnheader"
                    scope="col"
                    className={cn(
                      grid.row,
                      // 이름과 상태가 제 폭을 가진 뒤 **남는 자리를 전부** 설명이 받는다.
                      'border-b border-gray-300 text-left',
                      grid.cellX,
                      text.head,
                    )}
                  >
                    {descriptionLabel}
                  </th>
                )}
                {/*
                  첨부파일 열은 **상태 왼쪽**에 선다(2026-09-14 사용자 지정). 줄에서 답하는 물음의
                  순서가 그렇다 — 무엇을 내야 하는가(이름·설명) → 받아 갈 것이 있는가 → 내 것은
                  어디까지 왔는가. 표식 하나만 놓이는 칸이라 가운데로 모은다.
                */}
                {renderAttachment && (
                  <th
                    role="columnheader"
                    scope="col"
                    className={cn(
                      grid.row,
                      width.count,
                      'border-b border-gray-300 text-center',
                      grid.cellXTight,
                      text.head,
                    )}
                  >
                    {attachmentLabel}
                  </th>
                )}
                {renderStatus && (
                  <th
                    role="columnheader"
                    scope="col"
                    className={cn(
                      grid.row,
                      width.badge,
                      'border-b border-gray-300 text-left',
                      grid.cellXTight,
                      text.head,
                    )}
                  >
                    {statusLabel}
                  </th>
                )}
                {renderActions && (
                  <th
                    role="columnheader"
                    scope="col"
                    className={cn(
                      grid.row,
                      width.count,
                      'border-b border-gray-300 text-right',
                      grid.cellXTight,
                      text.head,
                    )}
                  >
                    {actionsLabel}
                  </th>
                )}
              </tr>
            </thead>
            <tbody role="rowgroup" ref={bodyRef} onKeyDown={onKeyDown}>
              {rows.length === 0 && (
                <tr role="row">
                  <td
                    role="gridcell"
                    colSpan={columnCount}
                    className={cn('py-6 text-center', grid.cellX, text.meta)}
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <CollectionTreeTableRow
                  key={row.node.id}
                  row={row}
                  stage={stage}
                  selected={selectedId === row.node.id}
                  tabbable={activeId === row.node.id}
                  onSelect={onSelect}
                  onFocusRow={setFocusId}
                  onToggle={setExpanded}
                  showDescription={showDescription}
                  renderAttachment={renderAttachment}
                  renderStatus={renderStatus}
                  renderActions={renderActions}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DensityProvider>
  )
}

interface RowProps {
  row: CollectionTreeRow
  stage: TableStage
  selected: boolean
  tabbable: boolean
  onSelect?: (id: string) => void
  /** 실제로 초점이 간 줄을 위로 알린다 — 굴러다니는 `tabIndex`가 화면과 어긋나지 않게 한다. */
  onFocusRow: (id: string) => void
  onToggle: (id: string, open: boolean) => void
  showDescription: boolean
  renderAttachment?: (node: CollectionTreeNode) => ReactNode
  renderStatus?: (node: CollectionTreeNode) => ReactNode
  renderActions?: (node: CollectionTreeNode) => ReactNode
}

function CollectionTreeTableRow({
  row,
  stage,
  selected,
  tabbable,
  onSelect,
  onFocusRow,
  onToggle,
  showDescription,
  renderAttachment,
  renderStatus,
  renderActions,
}: RowProps) {
  const grid = tableGridScale[stage]
  const text = tableTextScale[stage]
  const icon = iconScale[tableCellDensity[stage]]
  const { node, depth, hasChildren, expanded } = row
  const fullPath = row.path.join(' / ')
  const indent = Math.min(depth, INDENT_MAX_DEPTH) * INDENT_PX

  return (
    <tr
      role="row"
      data-row-id={node.id}
      data-depth={depth}
      aria-level={depth + 1}
      aria-posinset={row.index}
      aria-setsize={row.siblingCount}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      tabIndex={tabbable ? 0 : -1}
      onFocus={() => onFocusRow(node.id)}
      onClick={() => onSelect?.(node.id)}
      className={cn(
        'cursor-pointer',
        selected ? 'bg-brand-25' : 'hover:bg-gray-50',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/10',
      )}
    >
      <td role="gridcell" className={cn(grid.row, 'border-b border-gray-200', grid.cellX)}>
        {/* `min-w-0`가 없으면 긴 이름이 셀을 밀어 `truncate`가 일하지 못한다. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {/* 들여쓰기는 빈 상자가 만든다 — 글자에 좌여백을 주면 말줄임 폭 계산에 섞인다. */}
          <span aria-hidden className="shrink-0" style={{ width: `${indent}px` }} />
          {hasChildren ? (
            // 밀도는 `DensityProvider`가 내려준 맥락을 그대로 따른다(prop으로 못 박지 않는다).
            <IconButton
              variant="ghost"
              label={`${node.title} ${expanded ? '접기' : '펼치기'}`}
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation()
                onToggle(node.id, !expanded)
              }}
              icon={<Chevron expanded={expanded} glyph={icon.glyph} />}
            />
          ) : (
            <span aria-hidden className={cn(icon.box, 'shrink-0')} />
          )}
          {/*
            종류 표식은 도메인 구분이지 상태가 아니다 — 색으로 뜻을 더하지 않고 중립 토큰에 두며,
            폴더와 문항은 글리프 모양이 가른다. 색이 뜻을 갖는 자리는 상태 열의 `Badge`뿐이다.
          */}
          <span aria-hidden className="flex shrink-0 items-center justify-center text-gray-500">
            <KindGlyph kind={node.node_kind} glyph={icon.glyph} />
          </span>
          {/*
            이름은 **말줄임하지 않는다**. 좁은 화면에서 `truncate`는 문항 이름을 통째로 감추는데,
            그러면 무엇을 내야 하는지가 툴팁 뒤로 숨어 손가락만 있는 사람에게는 길이 없다.
            공백 없는 긴 이름도 `anywhere`로 끊어 셀 안에서 접는다 — 접는 것은 줄이지, 정보가 아니다.
            전체 경로는 `title`과 선택 시 `onSelect`(화면 쪽 상세)가 함께 답한다.
          */}
          {/*
            필수 표식은 **이름에 붙는다**(2026-09-14 사용자 지정). 줄 끝에 따로 세우면 이름과
            떨어져 상태 배지 옆에 서고, 그러면 무엇이 필수인지를 두 칸 건너 읽게 된다.
          */}
          <span
            title={`${fullPath} (${depth + 1}단)`}
            className={cn(
              'min-w-0 flex-1 break-words [overflow-wrap:anywhere]',
              node.node_kind === 'FOLDER' ? text.primary : text.body,
            )}
          >
            {node.title}
            {/*
              폴더는 이름 뒤에 **몇 항목을 품었는지**를 달고 선다(2026-09-14 사용자 지정) —
              `기본서류(2항목)`. 묶음의 크기는 그 묶음의 성질이라 이름 옆이 제자리이고, 상태 열은
              '얼마나 냈는가'만 답한다.
            */}
            {node.node_kind === 'FOLDER' && hasChildren && (
              <span className={cn('ml-0.5', text.meta)}>({row.childCount}항목)</span>
            )}
            {node.is_required && (
              <span className={cn('ml-0.5', formText.required)}>
                <span aria-hidden>*</span>
                <span className="sr-only">필수</span>
              </span>
            )}
          </span>
          {row.detached && (
            <span className={cn('shrink-0', text.empty)} title="상위 항목을 찾지 못해 최상위에 둔 항목입니다.">
              <span aria-hidden>⚠</span>
              <span className="sr-only">상위 항목 없음</span>
            </span>
          )}
        </div>
      </td>
      {showDescription && (
        <td role="gridcell" className={cn(grid.row, 'border-b border-gray-200', grid.cellX)}>
          {/* 설명은 곁값이라 한 줄만 맛보인다 — 전체 문장은 줄을 눌러 연 화면이 답한다. */}
          <span title={node.description ?? undefined} className={cn('block truncate', text.meta)}>
            {node.description}
          </span>
        </td>
      )}
      {renderAttachment && (
        <td role="gridcell" className={cn(grid.row, 'border-b border-gray-200', grid.cellXTight)}>
          <div className="flex min-w-0 items-center justify-center">{renderAttachment(node)}</div>
        </td>
      )}
      {renderStatus && (
        <td role="gridcell" className={cn(grid.row, 'border-b border-gray-200', grid.cellXTight)}>
          <div className="flex min-w-0 items-center">{renderStatus(node)}</div>
        </td>
      )}
      {renderActions && (
        <td role="gridcell" className={cn(grid.row, 'border-b border-gray-200', grid.cellXTight)}>
          {/*
            액션은 줄바꿈을 허용한다 — 좁은 화면에서 버튼이 한 줄에 못 서면 잘려 사라지는 대신
            아래로 접힌다. 줄 높이는 `min-h`가 지키므로 표의 리듬은 유지된다.
          */}
          {/*
            관리 칸의 클릭은 줄 선택으로 번지지 않는다 — 삭제 버튼을 눌렀는데 그 줄이 함께
            선택되면, 화면 쪽 상세 패널이 방금 지운 줄로 갈아타는 일이 생긴다.
          */}
          <div
            role="presentation"
            onClick={(event) => event.stopPropagation()}
            className="flex min-w-0 flex-wrap items-center justify-end gap-1"
          >
            {renderActions(node)}
          </div>
        </td>
      )}
    </tr>
  )
}

/** `CSS.escape` 대체 — 테스트 환경(jsdom 이전 런타임)까지 같은 선택자를 쓰기 위한 최소 구현. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}
