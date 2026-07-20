import { Badge, Button, DataTable, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { BoardFormModal, type BoardFormValue } from '@/features/admin/BoardFormModal'
import { boardIcon } from '@/features/hub/boardIcons'
import { BOARD_KIND_LABEL, useBoardStore, type BoardDef } from '@/features/hub/boardStore'

/**
 * 게시판 관리(ADMIN): 게시판·자료실 생성, 이름·아이콘 수정, 활성/비활성.
 * 변경은 게시판 레지스트리 스토어에 반영되어 OFFICE 사이드바·페이지에 즉시 적용된다.
 */
export function BoardAdminPanel() {
  const boards = useBoardStore((s) => s.boards)
  const createBoard = useBoardStore((s) => s.createBoard)
  const updateBoard = useBoardStore((s) => s.updateBoard)
  const setActive = useBoardStore((s) => s.setActive)

  // 모달 상태: null이면 닫힘, 'create'면 생성, BoardDef면 해당 게시판 수정.
  const [form, setForm] = useState<'create' | BoardDef | null>(null)
  const editing = form && form !== 'create' ? form : undefined

  const submit = (value: BoardFormValue) => {
    if (editing) updateBoard(editing.id, { label: value.label, icon: value.icon })
    else createBoard(value.label, value.icon, value.kind)
    setForm(null)
  }

  const deactivate = (b: BoardDef) => {
    const kindLabel = BOARD_KIND_LABEL[b.kind]
    if (window.confirm(`'${b.label}' ${kindLabel}을(를) 비활성화하시겠습니까? OFFICE에서 숨겨집니다.`)) {
      setActive(b.id, false)
    }
  }

  const columns: Column<BoardDef>[] = [
    {
      key: 'label',
      header: '게시판명',
      render: (b) => {
        const Icon = boardIcon(b.icon)
        return (
          <span className="flex items-center gap-2">
            <Icon aria-hidden className="size-4 text-gray-500" />
            <span className="text-gray-800">{b.label}</span>
          </span>
        )
      },
    },
    {
      key: 'kind',
      header: '구분',
      align: 'center',
      render: (b) => (
        <Badge tone={b.kind === 'ARCHIVE' ? 'warning' : 'info'}>
          {BOARD_KIND_LABEL[b.kind]}
        </Badge>
      ),
    },
    {
      key: 'type',
      header: '유형',
      align: 'center',
      render: (b) =>
        b.isSystem ? <Badge tone="neutral">기본</Badge> : <Badge tone="info">사용자</Badge>,
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      render: (b) =>
        b.isActive ? (
          <Badge tone="success">활성</Badge>
        ) : (
          <Badge tone="neutral">비활성</Badge>
        ),
    },
    {
      key: 'action',
      header: '관리',
      align: 'center',
      render: (b) => (
        // 이름·아이콘 수정은 기본 게시판을 포함해 항상 허용한다(구분·slug는 잠긴다).
        <span className="flex items-center justify-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setForm(b)}>
            수정
          </Button>
          {b.isActive ? (
            <Button variant="outline" size="sm" onClick={() => deactivate(b)}>
              비활성화
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setActive(b.id, true)}>
              활성화
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setForm('create')}>게시판·자료실 생성</Button>
      </div>

      <DataTable
        columns={columns}
        rows={[...boards].sort(
          (a, b) =>
            a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
        )}
        rowKey={(b) => b.id}
        numbered
        standardColumns={false}
        emptyText="등록된 게시판이 없습니다."
      />

      <BoardFormModal
        open={form !== null}
        board={editing}
        onClose={() => setForm(null)}
        onSubmit={submit}
      />
    </div>
  )
}
