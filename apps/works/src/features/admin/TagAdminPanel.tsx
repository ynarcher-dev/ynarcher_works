import {
  Button,
  DataTable,
  Input,
  Modal,
  Select,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
  type Tag,
  type TagParentValue,
} from '@/features/admin/hooks'
import type { TagConfig } from '@/features/admin/tagConfig'

interface TagAdminPanelProps {
  config: TagConfig
}

/**
 * 기준정보 태그 관리(ADMIN): 태그 추가/수정/삭제(soft delete).
 * 산업태그·분야태그 등 동일 구조 태그를 설정(config) 주입으로 공용 처리한다.
 * `config.parent`가 있으면 2뎁스 태그(예: 국가 › 권역)로, 상단에 부모(권역) 탭 바를 놓고
 * 선택한 권역의 태그만 테이블로 보여준다. 권역이 늘면 탭도 자동으로 늘어난다.
 */
export function TagAdminPanel({ config }: TagAdminPanelProps) {
  const { table, noun, parent } = config
  const toast = useToast()
  const { data, isLoading } = useTags(table, parent?.column)
  // 부모 태그 목록(예: 권역)은 2뎁스 태그일 때만 조회한다.
  const { data: parentTags } = useTags(parent?.table ?? '', undefined, Boolean(parent))
  const create = useCreateTag(table)
  const update = useUpdateTag(table)
  const remove = useDeleteTag(table)

  const [newName, setNewName] = useState('')
  const [activeParentId, setActiveParentId] = useState('') // 선택된 권역 탭
  const [editing, setEditing] = useState<Tag | null>(null)
  const [editName, setEditName] = useState('')
  const [editParentId, setEditParentId] = useState('')

  // 태그 행에서 부모 FK 값을 읽는다(컬럼명은 config.parent.column이 결정).
  const parentIdOf = (tag: Tag): string =>
    parent ? ((tag as unknown as Record<string, unknown>)[parent.column] as string | null) ?? '' : ''

  // 2뎁스 태그: 권역 탭이 로드되면 첫 권역을 기본 선택한다.
  useEffect(() => {
    const first = parentTags?.[0]
    if (parent && !activeParentId && first) {
      setActiveParentId(first.id)
    }
  }, [parent, activeParentId, parentTags])

  const parentName = (id: string) => parentTags?.find((t) => t.id === id)?.name ?? '-'

  // 2뎁스 태그의 부모 FK 페이로드.
  const parentValue = (id: string): TagParentValue | undefined =>
    parent ? { column: parent.column, id: id || null } : undefined

  // 활성 권역 탭에 속한 태그만 노출(2뎁스). 평면 태그는 전체.
  const rows = useMemo(() => {
    if (!parent) return data ?? []
    return (data ?? []).filter((t) => parentIdOf(t) === activeParentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, parent, activeParentId])

  // 권역이 없는(미지정) 태그가 있으면 마지막에 '미지정' 탭을 덧붙여 유실을 막는다.
  const hasUnassigned = parent ? (data ?? []).some((t) => !parentIdOf(t)) : false
  const parentTabs = parent
    ? [
        ...(parentTags ?? []).map((p) => ({ id: p.id, label: p.name })),
        ...(hasUnassigned ? [{ id: '', label: '미지정' }] : []),
      ]
    : []

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    if (parent && !activeParentId) {
      toast.show(`${parent.noun} 탭을 먼저 선택하세요.`, 'warning')
      return
    }
    try {
      await create.mutateAsync({ name, parent: parentValue(activeParentId) })
      setNewName('')
      toast.show(`'${name}' 태그를 추가했습니다.`, 'success')
    } catch {
      toast.show('추가에 실패했습니다. 이미 존재하는 태그인지 확인하세요.', 'danger')
    }
  }

  const openEdit = (tag: Tag) => {
    setEditing(tag)
    setEditName(tag.name)
    setEditParentId(parentIdOf(tag))
  }

  const submitEdit = async () => {
    if (!editing) return
    const name = editName.trim()
    const parentChanged = parent ? editParentId !== parentIdOf(editing) : false
    if (!name || (name === editing.name && !parentChanged)) {
      setEditing(null)
      return
    }
    if (parent && !editParentId) {
      toast.show(`${parent.noun}을(를) 선택하세요.`, 'warning')
      return
    }
    try {
      await update.mutateAsync({ id: editing.id, name, parent: parentValue(editParentId) })
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

  // 2뎁스는 권역을 탭이 대신하므로 표에서 부모 컬럼을 빼고 태그명만 노출한다.
  const columns: Column<Tag>[] = [
    { key: 'name', header: noun, render: (t) => t.name },
    {
      key: 'action',
      header: '관리',
      align: 'right',
      render: (t) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" onClick={() => openEdit(t)}>
            수정
          </Button>
          <Button variant="outline" onClick={() => del(t)}>
            삭제
          </Button>
        </div>
      ),
    },
  ]

  const addPlaceholder =
    parent && activeParentId ? `'${parentName(activeParentId)}'에 추가할 ${noun}` : `추가할 ${noun} 태그`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-64">
          <Input
            placeholder={addPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
        </div>
        <Button
          onClick={add}
          disabled={!newName.trim() || create.isPending || (Boolean(parent) && !activeParentId)}
        >
          태그 추가
        </Button>
      </div>

      {/* 권역 탭 바(2뎁스 전용). 권역이 늘면 탭도 자동으로 늘어난다. */}
      {parent &&
        (parentTags?.length ? (
          <nav className="flex flex-wrap gap-1 border-b border-gray-200">
            {parentTabs.map((t) => (
              <button
                key={t.id || 'none'}
                type="button"
                onClick={() => setActiveParentId(t.id)}
                className={
                  activeParentId === t.id
                    ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                    : 'px-3 py-2 text-body text-gray-600 hover:text-gray-800'
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
        ) : (
          <p className="text-body text-gray-500">
            먼저 <span className="font-medium">권역태그 관리</span>에서 권역을 등록하세요.
          </p>
        ))}

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
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
        <div className="space-y-3">
          {parent && (
            <Select value={editParentId} onChange={(e) => setEditParentId(e.target.value)}>
              <option value="">{parent.noun} 선택</option>
              {parentTags?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
          <Input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitEdit()
            }}
          />
        </div>
      </Modal>
    </div>
  )
}
