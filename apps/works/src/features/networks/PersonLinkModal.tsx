import { Button, Input, Modal, Select, cardText, useToast } from '@ynarcher/ui'
import { Fragment, useMemo, useState } from 'react'
import { useDebounced } from '@/lib/useDebounced'
import { useCreateNetwork } from '@/features/networks/hooks'
import { useNetworkPeopleByNames, type NetworkPersonHit } from '@/features/networks/personSearch'
import type { NetworkCategory } from '@/features/networks/config'

/** 원장에 이어야 할 사람 하나. `key`는 부른 화면이 자기 자리를 알아보는 값이다. */
export interface PersonLinkTarget {
  key: string
  name: string
  /** 그 사람의 자리(대표·CTO 등). 표에서 누구인지 가르는 보조값이며 원장에는 담기지 않는다. */
  title?: string
}

/** 확정 결과 한 줄. 이름도 함께 돌려주는 것은 이 창에서 고칠 수 있기 때문이다. */
export interface PersonLinkResult {
  key: string
  name: string
  networkId: string
}

/** 고르지 않음(미연결로 둔다). 빈 문자열이라 셀렉트의 기본 자리에 그대로 선다. */
const SKIP = ''
/** 원장에 없어 새로 만든다. */
const NEW = 'new'

interface Props {
  open: boolean
  onClose: () => void
  /** 원장에 이을 사람들. 이 창이 열린 뒤로는 바뀌지 않는다고 본다. */
  targets: PersonLinkTarget[]
  /** 새로 만들 사람의 소속으로 채울 값(보통 그 기업의 이름). */
  defaultAffiliation?: string
  /** 새로 만드는 사람의 구분. 스타트업 폼에서는 'startup'이다. */
  createCategory?: NetworkCategory
  /** 확정된 연결. 미연결로 남긴 사람은 여기 없다. */
  onConfirm: (links: PersonLinkResult[]) => void
}

/**
 * AI 초안이 데려온 사람들을 **원장에 한 번에 잇는** 창(2026-09-10).
 *
 * ## 왜 자동으로 만들지 않는가
 *
 * "없으면 만든다"로 자동화하면 이미 있는 사람을 모르고 또 만들어 같은 사람이 두 줄, 세 줄이
 * 되고, "이름 같으면 잇는다"로 자동화하면 동명이인을 남의 사람에 이어 놓고 담당자는 그 사실을
 * 영영 모른다. 자동은 이 둘 중 하나를 고르는 일인데 **둘 다 나쁘고, 둘의 비용이 다르다** —
 * 잘못 만든 원장 행은 물리 삭제 금지라 지워도 남지만, 만들지 않은 사람은 나중에 만들면 된다.
 * 되돌릴 수 있는 쪽에 걸어야 하므로 확정은 사람이 한다.
 *
 * 대신 **손은 자동만큼 덜어 준다**: 이름이 정확히 일치하는 사람이 딱 하나면 미리 골라 두고,
 * 원장에 없으면 '새 인물로 등록'이 미리 켜져 있다. 담당자가 실제로 판단하는 자리는 **동명이인
 * 여럿이 걸린 줄 하나뿐**이며, 나머지는 눈으로 훑고 [확정]이다. 명함첩 업로드가 구분을 추천으로
 * 미리 채우되 확정은 사람이 하게 한 것과 같은 손놀림이다(2026-09-10).
 *
 * 이름 칸을 고칠 수 있는 것은 모델이 `홍길동 대표이사`처럼 직함까지 묶어 읽어 오기 때문이다.
 * 그대로 등록되면 전 직원이 함께 쓰는 명함첩에 그 글자가 사람 이름으로 박힌다. 이름을 고치면
 * 원장 대조도 다시 돈다.
 */
export function PersonLinkModal({
  open,
  onClose,
  targets,
  defaultAffiliation,
  createCategory,
  onConfirm,
}: Props) {
  const toast = useToast()
  const create = useCreateNetwork()
  // 이름은 고칠 수 있다. 고르기는 **덮어쓴 값만** 들고 나머지는 후보에서 파생한다 — 상태로
  // 붙들어 두면 이름을 고쳐 후보가 달라졌을 때 옛 선택이 그대로 남는다.
  const [names, setNames] = useState<Record<string, string>>({})
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const nameOf = (t: PersonLinkTarget) => names[t.key] ?? t.name
  const lookup = useDebounced(targets.map(nameOf).join('|'))
  const { data: hits, isFetching } = useNetworkPeopleByNames(
    lookup ? lookup.split('|') : [],
    open,
  )

  /** 이름 → 그 이름의 원장 행들. 동명이인이 여기서 여러 줄로 남는다. */
  const byName = useMemo(() => {
    const map = new Map<string, NetworkPersonHit[]>()
    for (const h of hits ?? []) {
      const list = map.get(h.name) ?? []
      list.push(h)
      map.set(h.name, list)
    }
    return map
  }, [hits])

  const candidatesOf = (t: PersonLinkTarget) => byName.get(nameOf(t).trim()) ?? []

  /**
   * 아직 고르지 않은 줄의 기본값. 하나면 그 사람, 없으면 새로 등록, **여럿이면 비운다** —
   * 동명이인 앞에서 기본값을 정하는 것이 곧 자동 연결이고, 그것이 이 창이 막으려는 일이다.
   */
  const choiceOf = (t: PersonLinkTarget): string => {
    const override = picks[t.key]
    if (override !== undefined) return override
    const c = candidatesOf(t)
    if (c.length === 1 && c[0]) return c[0].id
    if (c.length === 0) return NEW
    return SKIP
  }

  const ambiguous = targets.filter((t) => choiceOf(t) === SKIP && candidatesOf(t).length > 1).length

  const confirm = async () => {
    setSaving(true)
    try {
      const links: PersonLinkResult[] = []
      // 같은 이름을 두 줄이 함께 새로 만들지 않도록 한 번 만든 것을 나눠 쓴다. 한 기업 명단에
      // 같은 이름이 둘 있는 일은 드물지만, 생기면 그것이 곧 중복 인물이다.
      const made = new Map<string, string>()
      for (const t of targets) {
        const name = nameOf(t).trim()
        const choice = choiceOf(t)
        if (!name || choice === SKIP) continue
        if (choice !== NEW) {
          links.push({ key: t.key, name, networkId: choice })
          continue
        }
        const already = made.get(name)
        if (already) {
          links.push({ key: t.key, name, networkId: already })
          continue
        }
        // 후보가 있는데도 새로 만드는 것은 막지 않는다 — 후보를 눈앞에 세워 두고 고른 것이라
        // 그 선택 자체가 "이 사람은 그 사람이 아니다"라는 판단이다(동명이인).
        const id = await create.mutateAsync({
          name,
          affiliation: defaultAffiliation?.trim() || null,
          category: createCategory ?? null,
          profile: { source: 'ai_person_link' },
        })
        made.set(name, id)
        links.push({ key: t.key, name, networkId: id })
      }
      onConfirm(links)
      onClose()
      const created = made.size
      toast.show(
        created > 0
          ? `${links.length}명을 연결했습니다(신규 등록 ${created}명).`
          : `${links.length}명을 연결했습니다.`,
        'success',
      )
    } catch {
      toast.show('연결에 실패했습니다. 네트워크 원장 쓰기 권한을 확인하세요.', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="원장에 사람 연결"
      help="이름이 같은 사람을 원장에서 미리 찾아 두었습니다. 원장에 없는 사람은 새 인물로 등록됩니다. 저장은 폼의 저장 버튼이 합니다."
      size="xl"
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            나중에
          </Button>
          <Button disabled={saving || isFetching} onClick={() => void confirm()}>
            {saving ? '연결 중…' : '연결 확정'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.4fr)] items-center gap-x-2 gap-y-1.5 [&>*]:min-w-0">
          <span className="text-caption text-gray-700">이름</span>
          <span className="text-caption text-gray-700">자리</span>
          <span className="text-caption text-gray-700">원장</span>
          {targets.map((t) => {
            const c = candidatesOf(t)
            return (
              <Fragment key={t.key}>
                <Input
                  value={nameOf(t)}
                  onChange={(e) => setNames((m) => ({ ...m, [t.key]: e.target.value }))}
                  aria-label="이름"
                />
                <span className={cardText.meta}>{t.title || '—'}</span>
                <Select
                  value={choiceOf(t)}
                  onChange={(e) => setPicks((m) => ({ ...m, [t.key]: e.target.value }))}
                  aria-label="원장 연결"
                >
                  {/* 넓은 것부터가 아니라 **판단이 필요한 것부터** 선다. 비어 있는 첫 줄은
                      "아직 안 고름"이자 "미연결로 두기"이며, 둘은 결과가 같으므로 값도 하나다. */}
                  <option value={SKIP}>
                    {c.length > 1 ? '누구인지 고르세요' : '연결하지 않음'}
                  </option>
                  {c.map((h) => (
                    <option key={h.id} value={h.id}>
                      {[h.name, h.affiliation, h.categoryLabel].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                  <option value={NEW}>새 인물로 등록</option>
                </Select>
              </Fragment>
            )
          })}
        </div>

        {/* 막힌 이유·다음 행동을 지시하는 안내는 접지 않는다. */}
        {ambiguous > 0 && (
          <p className={cardText.meta}>
            같은 이름이 여럿인 사람 {ambiguous}명은 누구인지 고르기 전까지 연결되지 않습니다.
          </p>
        )}
      </div>
    </Modal>
  )
}
