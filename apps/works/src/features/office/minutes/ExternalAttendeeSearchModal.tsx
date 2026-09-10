import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  TokenMultiSelect,
  useToast,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  NETWORK_TARGET_TYPE,
  type NetworkCategory,
} from '@/features/networks/config'
import { checkDuplicateName, useCreateNetwork } from '@/features/networks/hooks'
import { useDebounced } from '@/lib/useDebounced'
import { useNetworkPeopleSearch } from '@/features/networks/personSearch'
import { toExternalPersonLink } from '@/features/office/minutes/networkPeopleSearch'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'

interface Props {
  open: boolean
  onClose: () => void
  /** 이미 명단에 있는 참조(토글 상태 표시). */
  existing: MinuteLink[]
  /** 모달에서 확정한 외부 참석자 명단을 회의록 입력값에 반영한다. */
  onApply: (links: MinuteLink[]) => void
  /** 열 때 간이 등록 '이름'에 미리 채울 값(인라인에서 검색해도 없을 때 넘어온 이름). */
  initialName?: string
}

/** 참조 키 — 종류:id. 명단 포함 여부 판정에 쓴다. */
const linkKey = (l: { targetType: string; targetId: string }) => `${l.targetType}:${l.targetId}`

/**
 * 외부 참석자 검색·간이 등록 모달. 상단 검색은 networks 원장(디렉토리 9종) 통합 검색으로,
 * 결과를 입력창 아래 드롭다운으로 띄운다. 고른 사람은 입력칸 안의 칩으로 옮겨지고 드롭다운은
 * 닫힌다. 이 선택은 모달의 임시 명단이며, 하단 [적용]을 눌러야 회의록 입력값에 반영된다.
 * 하단은 검색해도 없을 때 쓰는 간이 등록 — 이름·소속·구분만 받아 해당 구분 원장에 새 인물을
 * 만들고 곧바로 명단에 담는다.
 *
 * 명단에 담기는 것은 이름이 아니라 **원장 레코드로 가는 참조**다 — 여기서 하는 일은
 * (1) networks에서 사람을 찾아 담거나 (2) networks에 인물을 만들면서 그 참조를 담는 두 가지다.
 * 실제 열람/쓰기 권한은 각 원장 RLS가 강제한다(간이 등록은 networks 쓰기 권한이 없으면 서버가
 * 거절하고, 담긴 참조는 저장 시 set_minute_links가 다시 검증한다).
 */
export function ExternalAttendeeSearchModal({
  open,
  onClose,
  existing,
  onApply,
  initialName,
}: Props) {
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounced(keyword)
  const { data: hits } = useNetworkPeopleSearch(debouncedKeyword, open)
  const [draft, setDraft] = useState<MinuteLink[]>(existing)
  const options = useMemo(() => (hits ?? []).map(toExternalPersonLink), [hits])

  // 간이 등록 폼(이름·소속·구분). 구분은 저장 대상 원장이 아니라 한 컬럼의 값이고, 여기서
  // 반드시 고른다 — 나중에 모아서 분류하던 자리(미분류 데이터베이스)를 접었으므로(2026-09-04)
  // 만드는 시점이 구분을 정하는 유일한 자리다.
  const [newName, setNewName] = useState('')
  const [newAffiliation, setNewAffiliation] = useState('')
  const [newCategory, setNewCategory] = useState<NetworkCategory | ''>('')
  const create = useCreateNetwork()

  // 열 때 현재 입력값을 임시 명단으로 복사한다. 이후 변경은 [적용] 전까지 이 모달 안에만 남는다.
  useEffect(() => {
    if (!open) return
    setDraft(existing)
    setNewName(initialName ?? '')
    setKeyword('')
  }, [existing, initialName, open])

  const submitCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.show('이름을 입력하세요.', 'warning')
      return
    }
    if (!newCategory) {
      toast.show('구분을 선택하세요.', 'warning')
      return
    }
    try {
      // 이미 동일 이름이 있으면 새로 만들지 않고 검색해서 고르도록 안내한다.
      if (await checkDuplicateName(name)) {
        toast.show('동일한 이름이 이미 있습니다. 위에서 검색해 선택하세요.', 'warning')
        return
      }
      const createdId = await create.mutateAsync({
        name,
        affiliation: newAffiliation.trim() || null,
        category: newCategory,
      })
      // 방금 만든 레코드의 참조를 임시 명단에 담는다 — [적용] 전에는 회의록 입력값을 바꾸지 않는다.
      const link: MinuteLink = {
        targetType: NETWORK_TARGET_TYPE,
        targetId: createdId,
        role: 'EXTERNAL_ATTENDEE',
        label: name,
        code: newAffiliation.trim() || null,
      }
      setDraft((current) =>
        current.some((item) => linkKey(item) === linkKey(link)) ? current : [...current, link],
      )
      toast.show(`${categoryLabel(newCategory)}(으)로 등록하고 선택 항목에 담았습니다.`, 'success')
      setNewName('')
      setNewAffiliation('')
    } catch {
      toast.show('등록에 실패했습니다. networks 쓰기 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  const cancel = () => {
    setDraft(existing)
    onClose()
  }

  const apply = () => {
    onApply(draft)
    onClose()
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={cancel}
      size="lg"
      sectioned
      title="외부 참석자 검색 · 간이 등록"
      footer={
        <>
          <Button variant="ghost" onClick={cancel}>
            취소
          </Button>
          <Button onClick={apply}>적용</Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 고른 결과가 칩으로 이 입력칸에 남고, 드롭다운은 선택 즉시 닫힌다. */}
        <Card title="원장에서 찾기">
          <TokenMultiSelect<MinuteLink>
            selected={draft}
            onChange={setDraft}
            options={options}
            getKey={linkKey}
            getLabel={(link) => link.label ?? '이름 없음'}
            getMeta={(link) => link.code ?? undefined}
            getSearchText={(link) => `${link.label ?? ''} ${link.code ?? ''}`}
            onQueryChange={setKeyword}
            placeholder="이름 또는 소속으로 networks 검색"
          />
        </Card>

        {/* 간이 등록: 검색해도 없을 때 이름·소속·구분만 받아 원장에 만들고 곧바로 추가 */}
        <Card
          title="찾는 사람이 없으면 간이 등록"
          help="선택한 구분의 networks 원장에 새 인물로 등록되고, 위 선택 입력에 담깁니다. 하단 적용을 눌러야 회의록 참석자에 반영됩니다."
        >
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
                onChange={(e) => setNewCategory(e.target.value as NetworkCategory | '')}
                aria-label="구분"
              >
                {/* 고르지 않으면 등록 버튼이 서지 않는다 — 뒤에 모아서 분류할 자리가 없다. */}
                <option value="">구분 선택</option>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={submitCreate}
              disabled={create.isPending || !newName.trim() || !newCategory}
            >
              {create.isPending ? '등록 중…' : '등록 후 담기'}
            </Button>
          </div>
        </Card>
      </div>
    </Modal>
  )
}
