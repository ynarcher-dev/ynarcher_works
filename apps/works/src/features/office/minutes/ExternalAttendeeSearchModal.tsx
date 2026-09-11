import { Button, Card, Modal, TokenMultiSelect } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useDebounced } from '@/lib/useDebounced'
import { useNetworkPeopleSearch } from '@/features/networks/personSearch'
import { toExternalPersonLink } from '@/features/office/minutes/networkPeopleSearch'
import { MINUTE_LINK_TARGETS, type MinuteLink } from '@/features/office/minutes/minuteLinks'
import {
  toStartupRepresentativeLink,
  useStartupRepresentativeSearch,
} from '@/features/office/minutes/startupRepresentativeSearch'

interface Props {
  open: boolean
  onClose: () => void
  /** 이미 명단에 있는 NETWORKS 인물·STARTUP 대표자 참조(토글 상태 표시). */
  existing: MinuteLink[]
  /** NETWORKS에서 찾지 못해 회의록에만 남긴 표기. */
  legacyNames: string[]
  /** 모달에서 확정한 외부 참석자 참조를 회의록 입력값에 반영한다. */
  onApply: (links: MinuteLink[]) => void
  /** 모달에서 확정한 미연결 표기를 회의록 입력값에 반영한다. */
  onLegacyApply: (names: string[]) => void
}
/** 참조 키 — 종류:id. 명단 포함 여부 판정에 쓴다. */
const linkKey = (l: { targetType: string; targetId: string }) => `${l.targetType}:${l.targetId}`

/**
 * NETWORKS 인물 또는 STARTUP 대표자를 찾는 모달.
 *
 * 이 창은 두 원장을 읽기만 한다. STARTUP 대표자는 기업 id를 직접 가리키며 NETWORKS 사람이나
 * 게스트 계정을 만들지 않는다. 찾는 사람이 없으면 이름 또는 '이름/소속'을 회의록에만 남긴다.
 */
export function ExternalAttendeeSearchModal({
  open,
  onClose,
  existing,
  legacyNames,
  onApply,
  onLegacyApply,
}: Props) {
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounced(keyword)
  const { data: networkHits } = useNetworkPeopleSearch(debouncedKeyword, open)
  const { data: startupHits } = useStartupRepresentativeSearch(debouncedKeyword, open)
  const [draft, setDraft] = useState<MinuteLink[]>(existing)
  const [draftNames, setDraftNames] = useState<string[]>(legacyNames)
  const options = useMemo(
    () =>
      [
        ...(networkHits ?? []).map(toExternalPersonLink),
        ...(startupHits ?? []).map(toStartupRepresentativeLink),
      ].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '', 'ko')),
    [networkHits, startupHits],
  )

  // 열 때 현재 입력값을 임시 명단으로 복사한다. 이후 변경은 [적용] 전까지 이 모달 안에만 남는다.
  useEffect(() => {
    if (!open) return
    setDraft(existing)
    setDraftNames(legacyNames)
    setKeyword('')
  }, [existing, legacyNames, open])

  const cancel = () => {
    setDraft(existing)
    setDraftNames(legacyNames)
    onClose()
  }

  const apply = () => {
    onApply(draft)
    onLegacyApply(draftNames)
    onClose()
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={cancel}
      size="lg"
      sectioned
      title="외부 참석자 찾기"
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
        <Card
          title="원장에 있는 참석자 연결"
          help="NETWORKS 인물과 STARTUP 대표자를 찾습니다. STARTUP 대표자는 기업 원장만 가리키며 NETWORKS 인물·게스트 계정을 만들지 않습니다."
        >
          <TokenMultiSelect<MinuteLink>
            selected={draft}
            onChange={setDraft}
            options={options}
            getKey={linkKey}
            getLabel={(link) => link.label ?? '이름 없음'}
            getMeta={(link) =>
              [MINUTE_LINK_TARGETS[link.targetType].kindLabel, link.code]
                .filter(Boolean)
                .join(' · ')
            }
            getSearchText={(link) => `${link.label ?? ''} ${link.code ?? ''}`}
            onQueryChange={setKeyword}
            placeholder="이름 또는 소속·기업명 검색"
          />
        </Card>

        <Card
          title="원장에 없으면 회의록에만 추가"
          help="이름 또는 이름/소속으로 남깁니다. 어느 원장도 만들지 않으며 나중에 자동 연결하지도 않습니다."
        >
          <TokenMultiSelect<string>
            selected={draftNames}
            onChange={setDraftNames}
            getKey={(name) => name}
            getLabel={(name) => name}
            allowFreeText
            createOption={(name) => name.trim()}
            freeTextHint={(name) => `'${name}'을(를) 회의록에만 추가`}
            placeholder="이름 또는 이름/소속 입력 후 Enter"
          />
        </Card>
      </div>
    </Modal>
  )
}
