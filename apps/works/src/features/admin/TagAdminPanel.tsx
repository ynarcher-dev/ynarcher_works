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
  useSetTagOrder,
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
 * 기준정보 태그 관리: 태그 추가/수정/삭제(soft delete) + 노출순위 조정.
 * 산업태그·분야태그 등 동일 구조 태그를 설정(config) 주입으로 공용 처리하며,
 * ADMIN '태그 관리'와 MANAGEMENT 인사 기준정보가 같은 패널을 쓴다.
 * `config.parent`가 있으면 2뎁스 태그(예: 국가 › 권역)로, 상단에 부모(권역) 탭 바를 놓고
 * 선택한 권역의 태그만 테이블로 보여준다. 권역이 늘면 탭도 자동으로 늘어난다.
 *
 * 노출순위는 여기서 입력한 sort_order가 그대로 각 화면의 선택지 순서가 된다(useTags 정렬 기준,
 * 작은 값이 앞). 2뎁스 태그는 부모 탭 범위 안에서 운용하므로 부모가 다르면 번호가 겹칠 수 있다.
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
  const setOrder = useSetTagOrder(table)

  const [newName, setNewName] = useState('')
  // 노출순위 입력의 편집 중 값(행 id → 문자열). 저장하면 비워 서버 값으로 되돌아간다.
  const [orderDraft, setOrderDraft] = useState<Record<string, string>>({})
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
      // 새 태그는 현재 범위의 맨 뒤에 붙인다(기본값 0으로 두면 목록 맨 앞에 끼어든다).
      await create.mutateAsync({
        name,
        parent: parentValue(activeParentId),
        sortOrder: rows.reduce((max, t) => Math.max(max, t.sort_order), 0) + 1,
      })
      setNewName('')
      toast.show(`'${name}' 태그를 추가했습니다.`, 'success')
    } catch {
      toast.show('추가에 실패했습니다. 이미 존재하는 태그인지 확인하세요.', 'danger')
    }
  }

  /** 노출순위 입력 확정(Enter·포커스 아웃). 값이 그대로면 저장하지 않는다. */
  const commitOrder = async (tag: Tag) => {
    const raw = orderDraft[tag.id]
    const clear = () => setOrderDraft(({ [tag.id]: _, ...rest }) => rest)
    if (raw === undefined) return
    const next = Number.parseInt(raw, 10)
    if (Number.isNaN(next) || next < 0 || next === tag.sort_order) {
      clear()
      return
    }
    try {
      await setOrder.mutateAsync({ id: tag.id, sortOrder: next })
      clear()
    } catch {
      toast.show('노출순위 저장에 실패했습니다. 권한을 확인하세요.', 'danger')
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
  // 노출순위는 저장된 sort_order를 그대로 입력·수정한다(작은 값이 앞). 값이 겹쳐도 막지 않고
  // 이름순으로 갈린다 — 중간에 하나를 끼워 넣으려고 같은 번호를 쓰는 운영을 허용하기 위함이다.
  const columns: Column<Tag>[] = [
    {
      key: 'order',
      header: '노출순위',
      align: 'center',
      className: 'w-24',
      render: (t) => (
        <span className="flex justify-center">
          <span className="w-16">
            <Input
              type="number"
              min={0}
              className="text-center"
              aria-label={`${t.name} 노출순위`}
              value={orderDraft[t.id] ?? String(t.sort_order)}
              onChange={(e) => setOrderDraft((d) => ({ ...d, [t.id]: e.target.value }))}
              onBlur={() => commitOrder(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </span>
        </span>
      ),
    },
    { key: 'name', header: noun, primary: true, render: (t) => t.name },
    {
      key: 'action',
      header: '관리',
      align: 'right',
      className: 'w-40',
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
          // 기본 No.(내림차순)는 노출순위와 정반대로 매겨져 서로 헷갈린다. 여기서 읽어야 할
          // 번호는 노출순위 하나뿐이므로 끈다.
          numbered={false}
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
