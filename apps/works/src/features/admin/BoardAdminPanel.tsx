import { Badge, Button, DataTable, Spinner, useToast, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { BoardFormModal, type BoardFormValue } from '@/features/admin/BoardFormModal'
import { boardIcon } from '@/features/hub/boardIcons'
import {
  useBoards,
  useCreateBoard,
  useSetBoardActive,
  useUpdateBoard,
} from '@/features/hub/boardHooks'
import { BOARD_KIND_LABEL, type BoardDef } from '@/features/hub/boardStore'

/**
 * 게시판 관리(ADMIN): 게시판·자료실 생성, 이름·아이콘 수정, 활성/비활성.
 * 변경은 public.boards에 저장되어 OFFICE 사이드바·페이지에 즉시 반영된다(RLS: 쓰기는 admin 전용).
 */
export function BoardAdminPanel() {
  const toast = useToast()
  const { data: boards, isLoading } = useBoards()
  const createBoard = useCreateBoard()
  const updateBoard = useUpdateBoard()
  const setActive = useSetBoardActive()

  // 모달 상태: null이면 닫힘, 'create'면 생성, BoardDef면 해당 게시판 수정.
  const [form, setForm] = useState<'create' | BoardDef | null>(null)
  const editing = form && form !== 'create' ? form : undefined

  const submit = async (value: BoardFormValue) => {
    try {
      if (editing) {
        await updateBoard.mutateAsync({ id: editing.id, label: value.label, icon: value.icon })
        toast.show('게시판을 수정했습니다.', 'success')
      } else {
        await createBoard.mutateAsync(value)
        toast.show('게시판을 생성했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const changeActive = async (b: BoardDef, isActive: boolean) => {
    try {
      await setActive.mutateAsync({ id: b.id, isActive })
      toast.show(isActive ? '활성화했습니다.' : '비활성화했습니다.', 'success')
    } catch {
      toast.show('변경에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const deactivate = (b: BoardDef) => {
    const kindLabel = BOARD_KIND_LABEL[b.kind]
    if (window.confirm(`'${b.label}' ${kindLabel}을(를) 비활성화하시겠습니까? OFFICE에서 숨겨집니다.`)) {
      void changeActive(b, false)
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
          <Button variant="outline" onClick={() => setForm(b)}>
            수정
          </Button>
          {b.isActive ? (
            <Button variant="outline" onClick={() => deactivate(b)}>
              비활성화
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void changeActive(b, true)}>
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

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <DataTable
          columns={columns}
          // 정렬(종류 › 표시순 › 이름)은 서버 쿼리가 이미 적용한다.
          rows={boards ?? []}
          rowKey={(b) => b.id}
          numbered
          standardColumns={false}
          emptyText="등록된 게시판이 없습니다."
        />
      )}

      <BoardFormModal
        open={form !== null}
        board={editing}
        onClose={() => setForm(null)}
        onSubmit={submit}
      />
    </div>
  )
}
