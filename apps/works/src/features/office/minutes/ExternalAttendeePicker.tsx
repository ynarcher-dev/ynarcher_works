import { IconButton, TokenMultiSelect } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExternalAttendeeSearchModal } from '@/features/office/minutes/ExternalAttendeeSearchModal'
import {
  toExternalPersonLink,
  useDebounced,
  useNetworkPeopleSearch,
} from '@/features/office/minutes/networkPeopleSearch'
import { MINUTE_LINK_TARGETS, type MinuteLink } from '@/features/office/minutes/minuteLinks'

interface Props {
  /** networks 원장을 가리키는 외부 참석자(상호참조). */
  people: MinuteLink[]
  onPeopleChange: (next: MinuteLink[]) => void
  /**
   * 링크로 승격되지 못한 옛 표기('이름/소속' 문자열). 빼는 것만 가능하다 —
   * 새로 담는 경로는 없다(20260903240000 이후 모든 입력은 원장 참조로 들어간다).
   */
  legacyNames: string[]
  onLegacyChange: (next: string[]) => void
}

/**
 * 한 필드가 두 종류를 담는다 — 원장을 가리키는 참석자와, 원장에서 되찾지 못한 옛 문자열.
 * 둘을 다른 칸으로 갈라 놓으면 담당자에게 "이 사람은 왜 저 칸에 있나"를 설명해야 하는데,
 * 그 답(옛 데이터라 매칭이 안 됐다)은 담당자가 할 수 있는 일이 없는 사정이다.
 */
type Item = { kind: 'ref'; link: MinuteLink } | { kind: 'legacy'; text: string }

const itemKey = (i: Item): string =>
  i.kind === 'ref' ? `${i.link.targetType}:${i.link.targetId}` : `legacy:${i.text}`

/**
 * 외부 참석자(사외 인원) 피커. 시스템 계정이 없어 접근 권한(RLS)과 무관하지만, **networks 원장의
 * 실제 레코드를 가리킨다** — 이름을 입력하면 원장을 실시간 검색해 후보를 띄우고, 고르면 그
 * 레코드로 가는 참조가 명단에 담긴다(20260903240000). networks에 없으면 돋보기 모달의 간이
 * 등록으로 유도한다 — 간이 등록은 원장에 새 인물을 만들면서 그 참조를 명단에 담는다.
 *
 * 문자열을 그대로 받지 않는 이유는 종전 방식이 그랬기 때문이다. 원장에서 골라 놓고 이름만
 * 베껴 적으면 그 사람 상세에서 "낀 회의"를 되짚을 수 없고, 이름이 바뀌면 회의록만 옛 이름으로
 * 남는다.
 */
export function ExternalAttendeePicker({
  people,
  onPeopleChange,
  legacyNames,
  onLegacyChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [initialName, setInitialName] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query)
  const { data: hits } = useNetworkPeopleSearch(debouncedQuery)

  const selected = useMemo<Item[]>(
    () => [
      ...people.map((link): Item => ({ kind: 'ref', link })),
      ...legacyNames.map((text): Item => ({ kind: 'legacy', text })),
    ],
    [people, legacyNames],
  )

  // 검색 결과를 후보로 바꾼다. 이미 담긴 사람은 TokenMultiSelect가 키로 걸러 낸다.
  const options = useMemo<Item[]>(
    () =>
      (hits ?? [])
        .map(toExternalPersonLink)
        .filter((l): l is MinuteLink => l !== null)
        .map((link): Item => ({ kind: 'ref', link })),
    [hits],
  )

  const handle = (next: Item[]) => {
    onPeopleChange(next.filter((i): i is Extract<Item, { kind: 'ref' }> => i.kind === 'ref').map((i) => i.link))
    onLegacyChange(
      next.filter((i): i is Extract<Item, { kind: 'legacy' }> => i.kind === 'legacy').map((i) => i.text),
    )
  }

  const add = (link: MinuteLink) => {
    if (people.some((p) => p.targetType === link.targetType && p.targetId === link.targetId)) return
    onPeopleChange([...people, link])
  }
  const remove = (link: MinuteLink) =>
    onPeopleChange(
      people.filter((p) => !(p.targetType === link.targetType && p.targetId === link.targetId)),
    )

  // networks에 없을 때: 입력한 이름을 실어 간이 등록 모달을 연다(문자열 직접 추가는 하지 않는다).
  const openRegister = (name: string) => {
    setInitialName(name)
    setOpen(true)
  }

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <TokenMultiSelect<Item>
          selected={selected}
          onChange={handle}
          options={options}
          getKey={itemKey}
          getLabel={(i) => (i.kind === 'ref' ? (i.link.label ?? '이름 없음') : i.text)}
          // 후보 줄의 보조 텍스트로 구분·소속을 함께 보여 동명이인을 가른다.
          getMeta={(i) =>
            i.kind === 'ref'
              ? [MINUTE_LINK_TARGETS[i.link.targetType].kindLabel, i.link.code]
                  .filter(Boolean)
                  .join(' · ')
              : '원장에서 찾지 못한 옛 표기'
          }
          getSearchText={(i) => (i.kind === 'ref' ? `${i.link.label ?? ''} ${i.link.code ?? ''}` : i.text)}
          onQueryChange={setQuery}
          freeTextHint={(q) => `'${q}'은(는) networks에 없어요 — 간이 등록`}
          onFreeTextSelect={openRegister}
          placeholder="외부 참석자 이름 입력 (networks 검색)"
        />
      </div>
      <IconButton
        icon={<Search className="size-4" />}
        label="networks에서 외부 참석자 검색·간이 등록"
        title="networks에서 검색·간이 등록"
        onClick={() => openRegister('')}
      />
      <ExternalAttendeeSearchModal
        open={open}
        onClose={() => setOpen(false)}
        existing={people}
        initialName={initialName}
        onAdd={add}
        onRemove={remove}
      />
    </div>
  )
}
