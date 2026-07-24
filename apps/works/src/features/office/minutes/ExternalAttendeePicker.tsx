import { IconButton, TokenMultiSelect } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ExternalAttendeeSearchModal } from '@/features/office/minutes/ExternalAttendeeSearchModal'
import { useDebounced, useNetworkPeopleSearch } from '@/features/office/minutes/networkPeopleSearch'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

/** 외부 참석자 표기 문자열 — 소속이 있으면 '이름/소속', 없으면 '이름'. */
function toDisplay(name: string, affiliation: string | null | undefined): string {
  const a = (affiliation ?? '').trim()
  return a ? `${name}/${a}` : name
}

/**
 * 외부참석자(사외 인원) 피커. 시스템 계정이 없어 접근 권한(RLS)과 무관한 단순 문자열 명단이며,
 * 이름을 입력하면 networks 원장을 실시간 검색해 드롭다운으로 후보('이름/소속')를 띄운다. 후보를
 * 고르면 명단에 담긴다. networks에 없으면 문자열을 그대로 넣지 않고(그건 networks에 등록되지
 * 않으므로) 돋보기 모달의 간이 등록으로 유도한다 — 간이 등록은 networks 원장에 실제로 새 인물을
 * 만들면서 명단에도 담는다. 명단은 문자열 저장이라 여기서 고른 값은 표기 문자열일 뿐이다.
 */
export function ExternalAttendeePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [initialName, setInitialName] = useState('')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query)
  const { data: hits } = useNetworkPeopleSearch(debouncedQuery)

  // networks 검색 결과를 인라인 드롭다운 후보(표기 문자열)로 변환한다. 중복 표기는 제거.
  const options = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const h of hits ?? []) {
      const d = toDisplay(h.name, h.affiliation)
      if (!seen.has(d)) {
        seen.add(d)
        out.push(d)
      }
    }
    return out
  }, [hits])

  const add = (display: string) => {
    const d = display.trim()
    if (!d || value.includes(d)) return
    onChange([...value, d])
  }
  const remove = (display: string) => onChange(value.filter((v) => v !== display))

  // networks에 없을 때: 입력한 이름을 실어 간이 등록 모달을 연다(문자열 직접 추가는 하지 않는다).
  const openRegister = (name: string) => {
    setInitialName(name)
    setOpen(true)
  }

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <TokenMultiSelect<string>
          selected={value}
          onChange={onChange}
          options={options}
          getKey={(s) => s}
          getLabel={(s) => s}
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
        existing={value}
        initialName={initialName}
        onAdd={add}
        onRemove={remove}
      />
    </div>
  )
}
