import { Button, cn, Input, Modal, Select, Spinner, useToast } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CATEGORY_OPTIONS, ENTITIES, type EntityKey } from '@/features/networks/config'
import { checkDuplicateName, useCreateEntity } from '@/features/networks/hooks'
import { useDebounced, useNetworkPeopleSearch } from '@/features/office/minutes/networkPeopleSearch'

interface Props {
  open: boolean
  onClose: () => void
  /** 이미 명단에 있는 표기(토글 상태 표시). */
  existing: string[]
  /** 외부 참석자 표기('이름/소속' 또는 '이름')를 명단에 추가한다. */
  onAdd: (display: string) => void
  /** 명단에서 표기를 뺀다(행 재클릭 토글 해제). */
  onRemove: (display: string) => void
  /** 열 때 간이 등록 '이름'에 미리 채울 값(인라인에서 검색해도 없을 때 넘어온 이름). */
  initialName?: string
}

/** 외부 참석자 표기 문자열 — 소속이 있으면 '이름/소속', 없으면 '이름'(기존 자유입력 예시와 동일). */
function toDisplay(name: string, affiliation: string | null | undefined): string {
  const n = name.trim()
  const a = (affiliation ?? '').trim()
  return a ? `${n}/${a}` : n
}

/**
 * 외부 참석자 검색·간이 등록 모달. 상단 검색은 networks 원장(디렉토리 9종) 통합 검색으로,
 * 결과를 입력창 아래 오버레이 드롭다운으로 띄운다 — 결과 개수가 바뀌어도 아래 간이 등록 영역이
 * 들썩이지 않도록 흐름에서 띄운 절대 위치다. 행을 누르면 명단에 추가, 다시 누르면 해제(토글).
 * 하단은 검색해도 없을 때 쓰는 간이 등록 — 이름·소속·구분만 받아 해당 구분 원장에 새 인물을
 * 만들고 곧바로 명단에 담는다.
 *
 * 회의록 외부 참석자는 문자열 명단(영구 FK 아님)이라, 여기서 하는 일은 (1) networks에서 이름을
 * 끌어오거나 (2) networks에 인물을 채우면서 그 이름을 끌어오는 두 가지 편의다. 실제 열람/쓰기
 * 권한은 각 원장 RLS가 강제한다(간이 등록은 networks 쓰기 권한이 없으면 서버가 거절).
 */
export function ExternalAttendeeSearchModal({
  open,
  onClose,
  existing,
  onAdd,
  onRemove,
  initialName,
}: Props) {
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounced(keyword)
  const { data: hits, isFetching } = useNetworkPeopleSearch(debouncedKeyword, open)

  // 간이 등록 폼(이름·소속·구분). 구분(라벨)이 저장 대상 원장을 결정한다 — 기본은 미분류.
  const [newName, setNewName] = useState('')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newCategory, setNewCategory] = useState<EntityKey>('others')
  const create = useCreateEntity(newCategory)

  // 열릴 때 인라인에서 넘어온 이름을 간이 등록 '이름'에 채운다(검색창에도 같은 값을 넣어 후보를 보여줌).
  useEffect(() => {
    if (!open) return
    setNewName(initialName ?? '')
    setKeyword(initialName ?? '')
  }, [open, initialName])

  const has = (display: string) => existing.includes(display)
  const showDropdown = keyword.trim() !== ''

  // 행을 누르면 추가, 다시 누르면 해제(토글).
  const toggle = (display: string) => {
    if (has(display)) onRemove(display)
    else onAdd(display)
  }

  const submitCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.show('이름을 입력하세요.', 'warning')
      return
    }
    try {
      // 이미 같은 구분에 동일 이름이 있으면 새로 만들지 않고 검색해서 고르도록 안내한다.
      if (await checkDuplicateName(newCategory, name)) {
        toast.show('같은 구분에 동일한 이름이 이미 있습니다. 위에서 검색해 선택하세요.', 'warning')
        return
      }
      await create.mutateAsync({
        name,
        affiliation: newAffiliation.trim() || null,
        // 구분은 원장 테이블이 결정하지만, 목록 표시(profile.category)와 일관되게 라벨도 함께 남긴다.
        profile: { category: ENTITIES[newCategory].label },
      })
      onAdd(toDisplay(name, newAffiliation))
      toast.show(`${ENTITIES[newCategory].label} 네트워크에 등록하고 참석자로 추가했습니다.`, 'success')
      setNewName('')
      setNewAffiliation('')
    } catch {
      toast.show('등록에 실패했습니다. networks 쓰기 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="외부 참석자 검색 · 간이 등록"
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      {/* 검색 중에는 오버레이 드롭다운이 들어갈 높이를 확보해 아래 영역이 흔들리지 않게 한다. */}
      <div className={cn('space-y-5', showDropdown && 'min-h-[20rem]')}>
        {/* 검색: networks 원장 통합 검색(이름·소속). 결과는 입력창 아래 절대 위치 드롭다운. */}
        <section className="relative">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름 또는 소속으로 networks 검색"
            aria-label="networks 인물 검색"
            autoFocus
          />
          {/* 결과가 있거나 조회 중일 때만 오버레이를 띄운다 — 결과가 없으면 아래 간이 등록 폼을 가리지 않도록 숨긴다. */}
          {showDropdown && (isFetching || (hits ?? []).length > 0) && (
            <div className="absolute inset-x-0 top-full z-dropdown mt-1 overflow-hidden rounded-radius-md border border-gray-200 bg-white shadow-popover">
              {isFetching ? (
                <div className="flex items-center gap-2 px-3 py-4 text-body-sm text-gray-500">
                  <Spinner />
                  검색 중…
                </div>
              ) : (
                <ul className="max-h-[15rem] divide-y divide-gray-100 overflow-y-auto">
                  {(hits ?? []).map((h) => {
                    const display = toDisplay(h.name, h.affiliation)
                    const added = has(display)
                    return (
                      <li key={`${h.entityTable}:${h.id}`}>
                        {/* 행 클릭 토글: 추가 ↔ 해제. 별도 버튼 없음. */}
                        <button
                          type="button"
                          onClick={() => toggle(display)}
                          className={cn(
                            'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-fast',
                            added ? 'bg-brand/10 hover:bg-brand/15' : 'hover:bg-gray-50',
                          )}
                        >
                          <span
                            className={cn(
                              'grid size-5 shrink-0 place-items-center rounded-full border',
                              added
                                ? 'border-brand bg-brand text-white'
                                : 'border-gray-300 text-transparent',
                            )}
                          >
                            <Check className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body text-gray-900">
                              <span className="font-medium">{h.name}</span>
                              {h.affiliation && (
                                <span className="text-gray-500"> · {h.affiliation}</span>
                              )}
                            </span>
                            <span className="block text-caption text-gray-400">
                              {h.categoryLabel}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* 간이 등록: 검색해도 없을 때 이름·소속·구분만 받아 원장에 만들고 곧바로 추가 */}
        <section className="space-y-2 border-t border-gray-200 pt-4">
          <p className="text-body-sm font-medium text-gray-700">없나요? 간이 등록 후 바로 추가</p>
          <div className="flex flex-wrap items-start gap-2">
            <div className="w-40">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="이름"
                aria-label="이름"
              />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                value={newAffiliation}
                onChange={(e) => setNewAffiliation(e.target.value)}
                placeholder="소속 (선택)"
                aria-label="소속"
              />
            </div>
            <div className="w-32">
              <Select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as EntityKey)}
                aria-label="구분"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={submitCreate} disabled={create.isPending || !newName.trim()}>
              {create.isPending ? '등록 중…' : '등록 후 추가'}
            </Button>
          </div>
          <p className="text-caption text-gray-400">
            선택한 구분의 networks 원장에 새 인물로 등록되고, 회의록 참석자 명단에도 함께 담깁니다.
          </p>
        </section>
      </div>
    </Modal>
  )
}
