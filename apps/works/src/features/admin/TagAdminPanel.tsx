import {
  Button,
  DataTable,
  Input,
  SegmentedToggle,
  Select,
  Spinner,
  Tabs,
  Tooltip,
  tooltipScale,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  useCreateTag,
  useDeleteTag,
  useSetTagMode,
  useSetTagOrder,
  useSetTagOrders,
  useTags,
  useUpdateTag,
  type Tag,
  type TagParentValue,
} from '@/features/admin/hooks'
import { TagEditModal } from '@/features/admin/TagEditModal'
import type { TagConfig } from '@/features/admin/tagConfig'

/** 태그명 정렬 상태. null이면 저장된 노출순위(sort_order) 순서 그대로 본다. */
type NameSort = 'asc' | 'desc' | null

interface TagAdminPanelProps {
  config: TagConfig
}

/**
 * 기준정보 태그 관리: 태그 추가/수정/삭제(soft delete) + 노출순위 조정.
 * 분야태그·영역태그 등 동일 구조 태그를 설정(config) 주입으로 공용 처리하며,
 * ADMIN '태그 관리'와 MANAGEMENT 인사 기준정보가 같은 패널을 쓴다.
 * `config.parent`가 있으면 2뎁스 태그(예: 국가 › 권역)로, 상단에 부모(권역) 탭 바를 놓고
 * 선택한 권역의 태그만 테이블로 보여준다. 권역이 늘면 탭도 자동으로 늘어난다.
 *
 * 노출순위는 여기서 입력한 sort_order가 그대로 각 화면의 선택지 순서가 된다(useTags 정렬 기준,
 * 작은 값이 앞). 2뎁스 태그는 부모 탭 범위 안에서 운용하므로 부모가 다르면 번호가 겹칠 수 있다.
 *
 * 순서 정리는 "보기 → 확정" 두 단계다. 태그명 오름/내림차순은 화면에서만 정렬해 보여주고,
 * '노출순위 10단위 재부여'가 그 순서를 10, 20, 30…으로 저장한다. 10단위로 띄우는 이유는
 * 나중에 사이에 끼워 넣을 자리(15 등)를 남겨 전체 재부여 없이 한 건만 고칠 수 있게 하기 위함이다.
 */
export function TagAdminPanel({ config }: TagAdminPanelProps) {
  const { table, noun, parent, modes } = config
  const toast = useToast()
  const { data, isLoading } = useTags(table, parent?.column, true, Boolean(modes))
  // 부모 태그 목록(예: 권역)은 2뎁스 태그일 때만 조회한다.
  const { data: parentTags } = useTags(parent?.table ?? '', undefined, Boolean(parent))
  const create = useCreateTag(table)
  const update = useUpdateTag(table)
  const remove = useDeleteTag(table)
  const setOrder = useSetTagOrder(table)
  const setOrders = useSetTagOrders(table)
  const setMode = useSetTagMode(table)

  const [newName, setNewName] = useState('')
  // 노출순위 입력의 편집 중 값(행 id → 문자열). 저장하면 비워 서버 값으로 되돌아간다.
  const [orderDraft, setOrderDraft] = useState<Record<string, string>>({})
  const [nameSort, setNameSort] = useState<NameSort>(null)
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
  // 태그명 정렬은 화면 표시 순서만 바꾼다 — 저장은 '노출순위 10단위 재부여'가 맡는다.
  const rows = useMemo(() => {
    const scoped = parent ? (data ?? []).filter((t) => parentIdOf(t) === activeParentId) : data ?? []
    if (!nameSort) return scoped
    const dir = nameSort === 'asc' ? 1 : -1
    return [...scoped].sort((a, b) => a.name.localeCompare(b.name, 'ko') * dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, parent, activeParentId, nameSort])

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

  /**
   * 지금 화면에 보이는 순서대로 노출순위를 10, 20, 30…으로 다시 매긴다.
   * 2뎁스 태그는 선택된 부모 탭 범위(rows)에만 적용된다 — 부모가 다르면 번호가 겹쳐도 무방하다.
   */
  const renumber = async () => {
    const changed = rows
      .map((t, i) => ({ id: t.id, sortOrder: (i + 1) * 10, current: t.sort_order }))
      .filter((it) => it.current !== it.sortOrder)
      .map(({ id, sortOrder }) => ({ id, sortOrder }))
    if (!changed.length) {
      toast.show('이미 10단위로 정리되어 있습니다.', 'info')
      return
    }
    try {
      await setOrders.mutateAsync(changed)
      setOrderDraft({}) // 편집 중이던 입력값은 새 번호로 갈아끼운다.
      toast.show('노출순위를 10단위로 다시 매겼습니다.', 'success')
    } catch {
      toast.show('노출순위 저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  /**
   * 정렬 축은 셋 중 하나다 — 저장된 노출순위, 이름 오름차순, 이름 내림차순.
   *
   * 이전에는 버튼 두 개였고 같은 방향을 다시 누르면 정렬이 풀렸는데, 그 '풀린 상태'에는
   * 화면에 이름이 없었다. 두 버튼이 모두 꺼져 있는 것이 무슨 뜻인지 알 방법이 없었던 셈이다.
   * 세 칸짜리 세그먼트는 그 상태에 이름을 준다.
   */
  const applySort = (key: 'order' | Exclude<NameSort, null>) =>
    setNameSort(key === 'order' ? null : key)

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

  /** 표기 방식 변경(직급·직책 태그 전용). 고르는 즉시 저장한다 — 확정 버튼을 따로 두지 않는다. */
  const changeMode = async (tag: Tag, mode: string) => {
    try {
      await setMode.mutateAsync({ id: tag.id, mode })
    } catch {
      toast.show('표기 방식 저장에 실패했습니다. 권한을 확인하세요.', 'danger')
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
      // 입력창·버튼이 들어가는 두 열(노출순위·관리)은 종류가 답하는 데이터 열이 아니라
      // 조작 자리라, 폭을 예외 통로(className)로 직접 잡는다.
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
              // 스피너(증감 화살표)를 지운다 — 크롬은 이 버튼 자리를 항상 차지해 두어
              // text-center로 가운데 정렬해도 글자가 왼쪽으로 밀려 보인다.
              className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
    { key: 'name', header: noun, primary: true, type: 'name', sortable: true, render: (t) => t.name },
    // 표기 방식(직급·직책 전용): 임직원 이름 옆 호칭을 이 값이 정한다.
    ...(modes
      ? [
          {
            key: 'mode',
            header: (
              <>
                표기 방식
                <Tooltip
                  label="표기 방식"
                  content={
                    '임직원 이름 옆 호칭을 정하는 값입니다.\n직급과 직책 설정이 부딪히면 직급이 이깁니다.'
                  }
                  className={tooltipScale.gap}
                />
              </>
            ),
            // 드롭다운이 들어가는 가변 열 — long 규격의 몫을 받는다.
            type: 'long' as const,
            render: (t: Tag) => (
              <Select
                aria-label={`${t.name} 표기 방식`}
                value={t.display_mode ?? 'DEFAULT'}
                onChange={(e) => changeMode(t, e.target.value)}
              >
                {modes.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            ),
          },
        ]
      : []),
    {
      key: 'action',
      header: '관리',
      align: 'center',
      className: 'w-32',
      render: (t) => (
        <div className="flex justify-center gap-1.5">
          <Button variant="outline" onClick={() => openEdit(t)}>
            수정
          </Button>
          <Button variant="outline-danger" onClick={() => del(t)}>
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
          태그 등록
        </Button>
      </div>

      {/* 권역 탭 바(2뎁스 전용). 권역이 늘면 탭도 자동으로 늘어난다. */}
      {parent &&
        (parentTags?.length ? (
          <Tabs
            items={parentTabs.map((t) => ({ key: t.id || 'none', label: t.label }))}
            value={activeParentId || 'none'}
            onChange={(key) => setActiveParentId(key === 'none' ? '' : key)}
          />
        ) : (
          <p className="text-body text-gray-500">
            먼저 <span className="font-medium">권역태그 관리</span>에서 권역을 등록하세요.
          </p>
        ))}

      {/* 태그 표는 열이 셋뿐이라 화면 폭을 다 쓰면 이름 한 칸이 과하게 벌어진다. 절반만 쓴다.
          표기 방식 열이 붙는 직급·직책 태그만 셀렉트가 눌리지 않게 3/4로 넓힌다. */}
      <div className={`space-y-2 ${modes ? 'lg:w-3/4' : 'lg:w-1/2'}`}>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <SegmentedToggle
            label="태그 정렬"
            value={nameSort ?? 'order'}
            onChange={applySort}
            disabled={!rows.length}
            options={[
              { key: 'order', label: '노출순위' },
              { key: 'asc', label: '이름 오름차순' },
              { key: 'desc', label: '이름 내림차순' },
            ]}
          />
          <Button variant="outline" onClick={renumber} disabled={!rows.length || setOrders.isPending}>
            노출순위 10단위 재부여
          </Button>
        </div>

        {isLoading ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(t) => t.id}
            sortKey={nameSort ? 'name' : undefined}
            sortDir={nameSort ?? undefined}
            onSort={(key) => {
              // 머리글 클릭은 방향만 뒤집는다(해제는 위 세그먼트의 '노출순위'가 맡는다).
              if (key === 'name') setNameSort(nameSort === 'asc' ? 'desc' : 'asc')
            }}
            standardColumns={false}
            // 기본 No.(내림차순)는 노출순위와 정반대로 매겨져 서로 헷갈린다. 여기서 읽어야 할
            // 번호는 노출순위 하나뿐이므로 끈다.
            numbered={false}
            emptyText={`등록된 ${noun} 태그가 없습니다.`}
          />
        )}

      </div>

      <TagEditModal
        tag={editing}
        noun={noun}
        parent={parent}
        parentTags={parentTags}
        name={editName}
        onNameChange={setEditName}
        parentId={editParentId}
        onParentIdChange={setEditParentId}
        onClose={() => setEditing(null)}
        onSubmit={submitEdit}
        pending={update.isPending}
      />
    </div>
  )
}
