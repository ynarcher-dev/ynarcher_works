import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import {
  BOARD_ICON_OPTIONS,
  DEFAULT_BOARD_ICON,
  boardIcon,
} from '@/features/hub/boardIcons'
import { useBoardStore, type BoardDef } from '@/features/hub/boardStore'

/**
 * 게시판 관리(ADMIN): 게시판 생성 및 활성/비활성.
 * 변경은 게시판 레지스트리 스토어에 반영되어 HUB 사이드바·페이지에 즉시 적용된다.
 */
export function BoardAdminPanel() {
  const boards = useBoardStore((s) => s.boards)
  const createBoard = useBoardStore((s) => s.createBoard)
  const setActive = useBoardStore((s) => s.setActive)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(DEFAULT_BOARD_ICON)

  const openCreate = () => {
    setName('')
    setIcon(DEFAULT_BOARD_ICON)
    setCreating(true)
  }

  const submit = () => {
    const label = name.trim()
    if (!label) return
    createBoard(label, icon)
    setCreating(false)
  }

  const deactivate = (b: BoardDef) => {
    if (window.confirm(`'${b.label}' 게시판을 비활성화하시겠습니까? HUB에서 숨겨집니다.`)) {
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
      key: 'type',
      header: '유형',
      align: 'center',
      render: (b) =>
        b.system ? <Badge tone="neutral">기본</Badge> : <Badge tone="info">사용자</Badge>,
    },
    {
      key: 'status',
      header: '상태',
      align: 'center',
      render: (b) =>
        b.active ? (
          <Badge tone="success">활성</Badge>
        ) : (
          <Badge tone="neutral">비활성</Badge>
        ),
    },
    {
      key: 'action',
      header: '관리',
      align: 'center',
      render: (b) =>
        b.active ? (
          <Button variant="outline" size="sm" onClick={() => deactivate(b)}>
            비활성화
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setActive(b.id, true)}>
            활성화
          </Button>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>게시판 생성</Button>
      </div>

      <DataTable
        columns={columns}
        rows={boards}
        rowKey={(b) => b.id}
        numbered
        standardColumns={false}
        emptyText="등록된 게시판이 없습니다."
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="게시판 생성"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              생성
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-caption font-semibold text-gray-600">게시판명</label>
            <Input
              autoFocus
              placeholder="예: 규정·정책"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-semibold text-gray-600">아이콘</label>
            <div className="grid grid-cols-7 gap-1.5">
              {BOARD_ICON_OPTIONS.map((opt) => {
                const selected = opt.key === icon
                const Icon = opt.Icon
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-label={opt.label}
                    aria-pressed={selected}
                    title={opt.label}
                    onClick={() => setIcon(opt.key)}
                    className={`grid aspect-square place-items-center rounded-radius-md border transition-colors duration-fast ${
                      selected
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <Icon aria-hidden className="size-4" />
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-caption text-gray-400">
            생성 시 즉시 활성화되어 HUB 게시판 메뉴에 선택한 아이콘으로 노출됩니다.
          </p>
        </div>
      </Modal>
    </div>
  )
}
