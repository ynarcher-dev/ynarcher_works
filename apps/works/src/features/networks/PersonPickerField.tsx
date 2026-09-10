import { Badge, Button, IconButton, Input, useToast } from '@ynarcher/ui'
import { Link2Off, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { useDebounced } from '@/lib/useDebounced'
import { useNetworkPeopleSearch } from '@/features/networks/personSearch'
import { useCreateNetwork } from '@/features/networks/hooks'

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

interface Props {
  value: PersonRef
  onChange: (next: PersonRef) => void
  /** 새 인물을 만들 때 소속으로 채울 값(보통 그 기업의 이름). */
  defaultAffiliation?: string
  /** 새로 만드는 사람의 구분. 스타트업 폼에서는 언제나 'startup'이다. */
  createCategory?: string
  placeholder?: string
  disabled?: boolean
}

/**
 * 사람 한 명을 고르는 칸 — **검색이 앞선 피커**다.
 *
 * 세 상태가 있고 화면이 셋을 갈라 보인다(2026-09-10 사용자 확정 B안).
 *   · **연결됨**: 원장 행을 가리킨다. 이름 옆에 연결 표시가 서고, 끊으면 글자만 남는다.
 *   · **글자만**: 이름은 적혔는데 원장에 누구인지 모른다. 옛 데이터와, 검색해도 없어 그냥
 *     적어 둔 경우가 여기 산다 — 막지 않는 이유는 이름을 아는데 저장하지 못하는 칸이
 *     되면 담당자가 그 사실을 아예 적지 않기 때문이다.
 *   · **비어 있음**.
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
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const keyword = useDebounced(value.name)
  // 이미 연결된 칸에서는 찾지 않는다 — 고를 것이 없다.
  const { data: hits } = useNetworkPeopleSearch(keyword, open && !value.networkId)
  const create = useCreateNetwork()

  const linked = Boolean(value.networkId)
  const candidates = hits ?? []

  if (linked) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-radius-md border border-gray-200 bg-gray-50 px-2">
        <span className="truncate text-body text-gray-800">{value.name}</span>
        <Badge tone="info">연결됨</Badge>
        <span className="grow" />
        {!disabled && (
          <IconButton
            icon={<Link2Off />}
            label="원장 연결 끊기"
            title="연결을 끊으면 이름만 남습니다."
            onClick={() => onChange({ name: value.name, networkId: null })}
          />
        )}
      </div>
    )
  }

  const submitCreate = async () => {
    const name = value.name.trim()
    if (!name) return
    try {
      const id = await create.mutateAsync({
        name,
        affiliation: defaultAffiliation?.trim() || null,
        category: createCategory ?? null,
        profile: { source: 'startup_form' },
      })
      onChange({ name, networkId: id })
      setOpen(false)
      toast.show(`${name}을(를) 네트워크 원장에 등록하고 연결했습니다.`, 'success')
    } catch {
      toast.show('등록에 실패했습니다. 네트워크 원장 쓰기 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="relative">
      <Input
        value={value.name}
        placeholder={placeholder ?? '이름을 입력해 원장에서 찾습니다'}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value, networkId: null })}
        onFocus={() => setOpen(true)}
        // 후보를 누르는 것도 blur라 닫기를 한 박자 늦춘다.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && value.name.trim().length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-radius-md border border-gray-200 bg-white py-1 shadow-popover">
          {candidates.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto">
              {candidates.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange({ name: h.name, networkId: h.id })
                      setOpen(false)
                    }}
                  >
                    <span className="text-body text-gray-800">{h.name}</span>
                    <span className="truncate text-caption text-gray-600">{h.affiliation ?? ''}</span>
                    {h.categoryLabel && (
                      <span className="ml-auto shrink-0 text-caption text-gray-500">{h.categoryLabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            // 빈 결과는 접지 않는다 — 왜 후보가 없는지와 다음에 무엇을 할 수 있는지를 함께 말한다.
            <p className="px-3 py-1.5 text-caption text-gray-600">원장에 같은 이름이 없습니다.</p>
          )}
          <div className="mt-1 flex items-center gap-2 border-t border-gray-100 px-3 pt-1.5">
            <Button
              variant="secondary"
              disabled={create.isPending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void submitCreate()}
            >
              새 인물로 등록
            </Button>
            <span className="text-caption text-gray-600">
              연결하지 않아도 이름은 그대로 저장됩니다.
            </span>
            <IconButton icon={<X />} label="닫기" className="ml-auto" onClick={() => setOpen(false)} />
          </div>
        </div>
      )}
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
