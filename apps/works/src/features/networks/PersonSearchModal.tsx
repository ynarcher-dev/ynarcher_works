import { Button, DataTable, EmptyValue, Field, Input, Modal, Select, useToast, type Column } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useDebounced } from '@/lib/useDebounced'
import { CATEGORY_OPTIONS, type NetworkCategory } from '@/features/networks/config'
import { checkDuplicateName, useCreateNetwork } from '@/features/networks/hooks'
import { useNetworkPeopleSearch, type NetworkPersonHit } from '@/features/networks/personSearch'

interface Props {
  open: boolean
  onClose: () => void
  /** 고른 사람 한 명을 돌려준다. 창은 고르는 즉시 닫힌다(고를 것이 하나뿐이다). */
  onPick: (hit: NetworkPersonHit) => void
  /** 열 때 검색어·등록 이름에 미리 채울 값(칸에 이미 적혀 있던 이름). */
  initialName?: string
  /** 새로 만들 때 소속으로 채울 값(보통 그 기업의 이름). */
  defaultAffiliation?: string
  /** 새로 만들 때의 기본 구분. 스타트업 폼에서는 'startup'이다. */
  defaultCategory?: NetworkCategory
}

/**
 * 네트워크 원장에서 **사람 한 명을 가져오는** 창.
 *
 * 칸 안의 후보 목록과 하는 일이 같은데도 창을 따로 두는 이유는 **보이는 것이 다르기**
 * 때문이다. 칸에서는 이름과 소속 한 줄이 전부라 동명이인 앞에서 담당자가 고를 근거가
 * 모자란다 — 여기서는 구분까지 표로 서서 "어느 홍길동인가"를 그 자리에서 가른다.
 *
 * 회의록의 외부 참석자 창과 같은 손놀림이다(검색 → 고르기, 없으면 그 자리에서 간이 등록).
 * 두 곳이 같은 원장에서 같은 것을 찾으므로 손놀림도 같아야 한다.
 */
export function PersonSearchModal({
  open,
  onClose,
  onPick,
  initialName,
  defaultAffiliation,
  defaultCategory,
}: Props) {
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const debounced = useDebounced(keyword)
  const { data: hits, isFetching } = useNetworkPeopleSearch(debounced, open)

  // 간이 등록 폼. 검색해도 없을 때 쓰는 자리라 검색 결과 아래에 선다.
  const [newName, setNewName] = useState('')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newCategory, setNewCategory] = useState<NetworkCategory | ''>('')
  const create = useCreateNetwork()

  // 열 때 칸에 적혀 있던 이름을 검색어와 등록 이름에 함께 채운다 — 담당자가 방금 적은 말을
  // 다시 타이핑하게 두지 않는다.
  useEffect(() => {
    if (!open) return
    setKeyword(initialName ?? '')
    setNewName(initialName ?? '')
    setNewAffiliation(defaultAffiliation ?? '')
    setNewCategory(defaultCategory ?? '')
  }, [open, initialName, defaultAffiliation, defaultCategory])

  const submitCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.show('이름을 입력하세요.', 'warning')
      return
    }
    try {
      // 같은 이름이 이미 있으면 새로 만들지 않는다 — 위에서 찾아 고르는 편이 언제나 낫다.
      if (await checkDuplicateName(name)) {
        toast.show('같은 이름이 이미 있습니다. 위에서 검색해 고르십시오.', 'warning')
        return
      }
      const id = await create.mutateAsync({
        name,
        affiliation: newAffiliation.trim() || null,
        category: newCategory || null,
        profile: { source: 'person_picker' },
      })
      onPick({ id, name, affiliation: newAffiliation.trim() || null, categoryLabel: '' })
      onClose()
      toast.show(`${name}을(를) 원장에 등록하고 연결했습니다.`, 'success')
    } catch {
      toast.show('등록에 실패했습니다. 네트워크 원장 쓰기 권한을 확인하세요.', 'danger')
    }
  }

  const columns: Column<NetworkPersonHit>[] = [
    { key: 'name', header: '이름', type: 'name', render: (r) => r.name },
    { key: 'affiliation', header: '소속', type: 'long', render: (r) => r.affiliation || <EmptyValue /> },
    { key: 'category', header: '구분', type: 'text', render: (r) => r.categoryLabel || <EmptyValue /> },
  ]

  return (
    <Modal open={open} onClose={onClose} title="원장에서 사람 가져오기" size="lg">
      <div className="space-y-4">
        <Field label="검색" hint="이름 또는 소속으로 네트워크 원장을 찾습니다.">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름 또는 소속"
          />
        </Field>

        <DataTable
          columns={columns}
          rows={hits ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => {
            onPick(r)
            onClose()
          }}
          emptyText={
            keyword.trim() === ''
              ? '이름 또는 소속을 입력하면 원장을 찾습니다.'
              : isFetching
                ? '찾는 중…'
                : '원장에 없습니다. 아래에서 새 인물로 등록할 수 있습니다.'
          }
        />

        {/* 검색해도 없을 때 쓰는 자리. 구분을 비워도 등록된다 — 명함 정리·회의 직후처럼
            이름과 소속만 들고 들어오는 자리가 있고, 구분을 몰라 등록 자체가 막히는 것보다
            비워 둔 채 넣고 목록의 '미지정'으로 다시 찾아 채우는 편이 낫다(2026-09-05). */}
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Field label="이름" required>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Field label="소속">
            <Input value={newAffiliation} onChange={(e) => setNewAffiliation(e.target.value)} />
          </Field>
          <Field label="구분">
            <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value as NetworkCategory | '')}>
              <option value="">미지정</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
        <Button disabled={create.isPending} onClick={() => void submitCreate()}>
          새 인물로 등록하고 연결
        </Button>
      </div>
    </Modal>
  )
}
