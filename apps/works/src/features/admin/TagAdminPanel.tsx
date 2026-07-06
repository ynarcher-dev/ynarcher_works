import {
  Button,
  DataTable,
  Input,
  Modal,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
  type Tag,
} from '@/features/admin/hooks'
import type { TagConfig } from '@/features/admin/tagConfig'

interface TagAdminPanelProps {
  config: TagConfig
}

/**
 * 기준정보 태그 관리(ADMIN): 태그 추가/수정/삭제(soft delete).
 * 산업태그·분야태그 등 동일 구조 태그를 설정(config) 주입으로 공용 처리한다.
 */
export function TagAdminPanel({ config }: TagAdminPanelProps) {
  const { table, noun } = config
  const toast = useToast()
  const { data, isLoading } = useTags(table)
  const create = useCreateTag(table)
  const update = useUpdateTag(table)
  const remove = useDeleteTag(table)

  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Tag | null>(null)
  const [editName, setEditName] = useState('')

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await create.mutateAsync(name)
      setNewName('')
      toast.show(`'${name}' 태그를 추가했습니다.`, 'success')
    } catch {
      toast.show('추가에 실패했습니다. 이미 존재하는 태그인지 확인하세요.', 'danger')
    }
  }

  const openEdit = (tag: Tag) => {
    setEditing(tag)
    setEditName(tag.name)
  }

  const submitEdit = async () => {
    if (!editing) return
    const name = editName.trim()
    if (!name || name === editing.name) {
      setEditing(null)
      return
    }
    try {
      await update.mutateAsync({ id: editing.id, name })
      setEditing(null)
      toast.show('태그를 수정했습니다.', 'success')
    } catch {
      toast.show('수정에 실패했습니다. 이미 존재하는 태그인지 확인하세요.', 'danger')
    }
  }

  const del = async (tag: Tag) => {
    if (!window.confirm(`'${tag.name}' ${noun} 태그를 삭제하시겠습니까?`)) return
    try {
      await remove.mutateAsync(tag.id)
      toast.show('태그를 삭제했습니다.', 'success')
    } catch {
      toast.show('삭제에 실패했습니다.', 'danger')
    }
  }

  const columns: Column<Tag>[] = [
    { key: 'name', header: noun, render: (t) => t.name },
    {
      key: 'action',
      header: '관리',
      align: 'right',
      render: (t) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
            수정
          </Button>
          <Button variant="outline" size="sm" onClick={() => del(t)}>
            삭제
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-64">
          <Input
            placeholder={`추가할 ${noun} 태그`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
        </div>
        <Button onClick={add} disabled={!newName.trim() || create.isPending}>
          태그 추가
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(t) => t.id}
          standardColumns={false}
          emptyText={`등록된 ${noun} 태그가 없습니다.`}
        />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${noun} 태그 수정`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button onClick={submitEdit} disabled={!editName.trim() || update.isPending}>
              수정
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitEdit()
          }}
        />
      </Modal>
    </div>
  )
}
