import { IconButton, TokenMultiSelect } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExternalAttendeeSearchModal } from '@/features/office/minutes/ExternalAttendeeSearchModal'
import { useDebounced } from '@/lib/useDebounced'
import { useNetworkPeopleSearch } from '@/features/networks/personSearch'
import {
  addUnlinkedAttendee,
  toExternalPersonLink,
} from '@/features/office/minutes/networkPeopleSearch'
import { MINUTE_LINK_TARGETS, type MinuteLink } from '@/features/office/minutes/minuteLinks'
import {
  toStartupRepresentativeLink,
  useStartupRepresentativeSearch,
} from '@/features/office/minutes/startupRepresentativeSearch'

interface Props {
  /** NETWORKS 인물 또는 STARTUP 대표자를 가리키는 외부 참석자(상호참조). */
  people: MinuteLink[]
  onPeopleChange: (next: MinuteLink[]) => void
  /**
   * NETWORKS에서 찾지 못해 회의록에만 남기는 표기('이름/소속' 문자열).
   */
  legacyNames: string[]
  onLegacyChange: (next: string[]) => void
}

/**
 * 한 필드가 두 종류를 담는다 — 원장을 가리키는 참석자와, 원장에서 찾지 못한 문자열.
 * 둘을 다른 칸으로 갈라 놓으면 담당자에게 "이 사람은 왜 저 칸에 있나"를 설명해야 하는데,
 * 그 답(옛 데이터라 매칭이 안 됐다)은 담당자가 할 수 있는 일이 없는 사정이다.
 */
type Item = { kind: 'ref'; link: MinuteLink } | { kind: 'legacy'; text: string }

const itemKey = (i: Item): string =>
  i.kind === 'ref' ? `${i.link.targetType}:${i.link.targetId}` : `legacy:${i.text}`

/**
 * 외부 참석자(사외 인원) 피커. NETWORKS 인물은 사람 원장을, STARTUP 대표자는 기업 원장을
 * 직접 가리킨다. 후자를 고르더라도 NETWORKS·게스트 신원은 만들지 않는다. 어느 원장에서도
 * 찾지 못하면 이름·소속 표기를 회의록에만 남긴다.
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
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query)
  const { data: networkHits } = useNetworkPeopleSearch(debouncedQuery)
  const { data: startupHits } = useStartupRepresentativeSearch(debouncedQuery)

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
      [
        ...(networkHits ?? []).map(toExternalPersonLink),
        ...(startupHits ?? []).map(toStartupRepresentativeLink),
      ]
        .filter((l): l is MinuteLink => l !== null)
        .map((link): Item => ({ kind: 'ref', link })),
    [networkHits, startupHits],
  )

  const handle = (next: Item[]) => {
    onPeopleChange(next.filter((i): i is Extract<Item, { kind: 'ref' }> => i.kind === 'ref').map((i) => i.link))
    onLegacyChange(
      next.filter((i): i is Extract<Item, { kind: 'legacy' }> => i.kind === 'legacy').map((i) => i.text),
    )
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
              : '회의록에만 적힌 참석자'
          }
          getSearchText={(i) => (i.kind === 'ref' ? `${i.link.label ?? ''} ${i.link.code ?? ''}` : i.text)}
          onQueryChange={setQuery}
          freeTextHint={(q) => `'${q}'을(를) 회의록에만 추가 (원장 등록 안 함)`}
          onFreeTextSelect={(value) => onLegacyChange(addUnlinkedAttendee(legacyNames, value))}
          placeholder="외부 참석자 이름 또는 이름/소속 입력"
        />
      </div>
      <IconButton
        icon={<Search className="size-4" />}
        label="원장에서 외부 참석자 찾기"
        title="원장에서 찾기"
        onClick={() => setOpen(true)}
      />
      <ExternalAttendeeSearchModal
        open={open}
        onClose={() => setOpen(false)}
        existing={people}
        legacyNames={legacyNames}
        onApply={onPeopleChange}
        onLegacyApply={onLegacyChange}
      />
    </div>
  )
}
