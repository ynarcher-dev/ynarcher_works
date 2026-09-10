import { IconButton, TokenMultiSelect } from '@ynarcher/ui'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useDebounced } from '@/lib/useDebounced'
import { useNetworkPeopleSearch, type NetworkPersonHit } from '@/features/networks/personSearch'
import { PersonSearchModal } from '@/features/networks/PersonSearchModal'
import type { NetworkCategory } from '@/features/networks/config'

/**
 * 이 칸이 담는 값. **이름은 언제나 있고 참조는 있을 수도 없을 수도 있다.**
 *
 * 이름을 참조와 함께 들고 다니는 것은 표시값이기 때문이다. `startups.representative`는
 * 포트폴리오 표·통합검색·마스터 목록·M&A 연결 등 스무 곳 가까이에서 직접 읽히므로, 연결된
 * 순간 비우면 그 전부가 빈 칸 처리를 새로 해야 하고 한 곳만 빠뜨려도 대표자 없는 기업으로
 * 보인다(`attachments.file_name`이 링크를 받아들일 때 내린 것과 같은 판단, 2026-09-06).
 *
 * 대가는 사람이 개명해도 이 칸이 따라오지 않는 것이다. 그게 틀렸다고 보지 않는다 —
 * 이 칸이 답하는 것은 '이 기업의 대표자명'이고, 그 사람이 지금 무엇으로 불리는지는
 * 참조를 따라가면 원장이 답한다.
 */
export interface PersonRef {
  name: string
  /** 네트워크 원장 행. null이면 미연결(글자만). */
  networkId: string | null
}

/** 칸에 서는 토큰 하나. 원장을 가리키는 것과 이름만 아는 것 둘 다 이 모양으로 선다. */
interface PersonToken {
  name: string
  networkId: string | null
  /** 후보 줄의 보조 텍스트(소속 · 구분). 동명이인을 가르는 자리다. */
  meta?: string
}

const tokenKey = (t: PersonToken) => t.networkId ?? `text:${t.name}`

const toToken = (hit: NetworkPersonHit): PersonToken => ({
  name: hit.name,
  networkId: hit.id,
  meta: [hit.affiliation, hit.categoryLabel].filter(Boolean).join(' · '),
})

interface Props {
  value: PersonRef
  onChange: (next: PersonRef) => void
  /** 새 인물을 만들 때 소속으로 채울 값(보통 그 기업의 이름). */
  defaultAffiliation?: string
  /** 새로 만드는 사람의 구분. 스타트업 폼에서는 언제나 'startup'이다. */
  createCategory?: NetworkCategory
  placeholder?: string
  disabled?: boolean
}

/**
 * 사람 한 명을 고르는 칸 — **검색이 앞선 피커**다.
 *
 * 세 상태가 있고 화면이 셋을 갈라 보인다(2026-09-10 사용자 확정 B안).
 *   · **연결됨**: 원장 행을 가리키는 토큰.
 *   · **글자만**: 이름은 적혔는데 원장에 누구인지 모른다. 옛 데이터와, 검색해도 없어 그냥
 *     적어 둔 경우가 여기 산다 — 막지 않는 이유는 이름을 아는데 저장하지 못하는 칸이
 *     되면 담당자가 그 사실을 아예 적지 않기 때문이다.
 *   · **비어 있음**.
 *
 * **규격은 회의록 외부 참석자 칸 그대로다**(`TokenMultiSelect` + 돋보기). 같은 원장에서 같은
 * 것을 찾는 두 자리라 손놀림이 같아야 하고, 후보 목록의 층·그림자·행 규격을 이 화면이 새로
 * 정하면 그때부터 그것은 규격이 아니라 취향이 된다(처음에는 이 칸이 자기 드롭다운을 손으로
 * 그렸고, 그래서 층도 그림자도 안내 문구 규칙도 앱의 다른 자리와 어긋나 있었다).
 * 다른 것은 상한 하나뿐이다 — 여기는 한 명이다.
 *
 * 자동으로 잇지 않는다. 이름이 같은 사람은 흔하고(이 원장 한 벌에도 동명이인이 여럿 있다),
 * 자동으로 이으면 담당자는 자기가 다른 사람을 가리켰다는 사실을 영영 모른다. 대신 타이핑과
 * 동시에 후보를 세워 **고르는 편이 적는 것보다 빠르게** 만든다.
 */
export function PersonPickerField({
  value,
  onChange,
  defaultAffiliation,
  createCategory,
  placeholder,
  disabled,
}: Props) {
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const debounced = useDebounced(query)
  const { data: hits } = useNetworkPeopleSearch(debounced)

  const selected = useMemo<PersonToken[]>(
    () => (value.name.trim() ? [{ name: value.name, networkId: value.networkId }] : []),
    [value.name, value.networkId],
  )
  const options = useMemo<PersonToken[]>(() => (hits ?? []).map(toToken), [hits])

  const apply = (next: PersonToken[]) => {
    const one = next[0]
    onChange({ name: one?.name ?? '', networkId: one?.networkId ?? null })
  }

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <TokenMultiSelect<PersonToken>
          selected={selected}
          onChange={apply}
          options={options}
          getKey={tokenKey}
          getLabel={(t) => t.name}
          // 후보 줄의 보조 텍스트로 소속·구분을 함께 보여 동명이인을 가른다.
          getMeta={(t) => t.meta}
          getSearchText={(t) => `${t.name} ${t.meta ?? ''}`}
          onQueryChange={setQuery}
          // 대표자는 한 명이다. 상한에 닿으면 입력 칸이 사라지므로 바꾸려면 먼저 뺀다 —
          // 그 한 번의 손놀림이 "지금 다른 사람으로 바꾸는 중"이라는 사실을 화면에 남긴다.
          max={1}
          // 검색해도 없으면 **이름 그대로** 담는다. 원장에 행을 만드는 것은 돋보기 창의
          // 일이다 — 그 둘은 다른 결정이라(한쪽은 이 기업의 기록, 다른 쪽은 전사 원장에
          // 사람을 세우는 일) 같은 한 줄에 겹쳐 두지 않는다.
          allowFreeText
          createOption={(text) => ({ name: text, networkId: null })}
          freeTextHint={(q) => `'${q}' 이름 그대로 담기 (원장 미연결)`}
          placeholder={placeholder ?? '이름 입력 (원장 검색)'}
          disabled={disabled}
        />
      </div>
      <IconButton
        icon={<Search className="size-4" />}
        label="원장에서 사람 가져오기"
        title="원장에서 검색·간이 등록"
        disabled={disabled}
        onClick={() => setModalOpen(true)}
      />
      <PersonSearchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onPick={(hit) => onChange({ name: hit.name, networkId: hit.id })}
        initialName={value.name}
        defaultAffiliation={defaultAffiliation}
        defaultCategory={createCategory}
      />
    </div>
  )
}

/**
 * 폼의 **두 칸**(이름 · 참조)을 이 피커 하나에 잇는다.
 *
 * 저장 모양이 두 칸인 이유는 위 `PersonRef` 주석 그대로다. 화면에서까지 둘로 두면 이름만
 * 고치고 참조는 옛 사람을 가리키는 저장이 가능해지므로, 고치는 자리는 이 컨트롤 하나다.
 */
interface ControlProps<T extends FieldValues> extends Omit<Props, 'value' | 'onChange'> {
  control: Control<T>
  namePath: FieldPath<T>
  idPath: FieldPath<T>
}

export function PersonPickerControl<T extends FieldValues>({
  control,
  namePath,
  idPath,
  ...rest
}: ControlProps<T>) {
  return (
    <Controller
      control={control}
      name={namePath}
      render={({ field: nameField }) => (
        <Controller
          control={control}
          name={idPath}
          render={({ field: idField }) => (
            <PersonPickerField
              {...rest}
              value={{
                name: String(nameField.value ?? ''),
                networkId: (idField.value as string | null) ?? null,
              }}
              onChange={(v) => {
                nameField.onChange(v.name)
                idField.onChange(v.networkId)
              }}
            />
          )}
        />
      )}
    />
  )
}
