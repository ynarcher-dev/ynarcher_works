import {
  Card,
  InfoField,
  InfoGrid,
  InfoRows,
  RefLinkList,
  cardText,
  type RefLinkItem,
} from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { RichTextViewer } from '@/components/RichTextEditor'
import { linkItem, personItem } from '@/features/office/minutes/minuteRefItems'
import type { MinuteDetail } from '@/features/office/minutes/minutesApi'

/**
 * 회의록 읽기 화면의 본문 — **쓰기 화면과 같은 카드 단위·같은 순서**로 선다(2026-09-10 사용자 지정).
 *
 * 종전에는 여섯 줄(장소·내부·외부·참조·연동·안건)이 머리 카드 하나에 세로로 쌓였다. 한 카드
 * 안에서는 라벨 축이 하나뿐이라 `2026-07-23` 같은 짧은 값도 카드 폭을 통째로 받았고, 그래서
 * 값보다 빈 자리가 넓었다 — 사용자가 지적한 "여백이 많다"의 실체가 그것이다.
 *
 * 카드를 가르는 근거는 **쓰기 화면이 이미 갈라 놓았다**는 것이다(`MinuteFormFields`). 규칙은
 * 이미 있다 — *입력 폼도 조회와 같은 카드 구성으로 선다(카드 단위·순서·이름)*. 그 규칙이
 * 지키려는 것은 **적은 자리와 읽는 자리가 같아 보이는 것**이므로, 방향은 어느 쪽이든 같다.
 * 열 수만 갈린다(쓰기는 적는 자리라 한 칸씩, 읽기는 견주는 자리라 두 칸씩).
 *
 * **빈 값도 자리를 지킨다.** 종전에는 값이 있는 줄만 세웠고 근거는 "여섯 줄 중 넷이 `-`면
 * 없는 것을 알리느라 있는 것을 가린다"였는데, 그 걱정은 **한 카드에 여섯 줄**이었기 때문이다.
 * 카드가 갈리면 한 카드에 한두 줄이라 `-`가 벽이 되지 않고, 오히려 "이 회의록엔 연동이 없다"가
 * 자리로 남아야 회의록 둘을 같은 눈으로 읽을 수 있다(줄이 사라지면 아래 값이 위로 올라와,
 * 같은 항목이 회의록마다 다른 자리에 선다).
 *
 * **공개범위는 여기 서지 않는다** — 머리 카드의 배지가 이미 답한다. 같은 값을 묻는 표기는
 * 화면에 하나뿐이어야 하고, 문서를 열자마자 알아야 하는 사실이라 그 하나는 머리에 둔다.
 * 이 카드가 답하는 것은 *그래서 누가 함께 보는가*(참조)다.
 */
export function MinuteReadSections({ minute }: { minute: MinuteDetail }) {
  const attendees = minute.people.filter((p) => p.role === 'ATTENDEE')
  const references = minute.people.filter((p) => p.role === 'REFERENCE')
  const isOpen = minute.visibility === 'OFFICE'

  // 원장 참조로 승격된 외부 참석자가 먼저 서고, 승격되지 못한 옛 표기가 뒤에 링크 없이 붙는다.
  const externals: RefLinkItem[] = [
    ...minute.externalPeople.map((l) => linkItem(l, { showKind: false })),
    ...minute.externalAttendees.map((name, i) => ({
      key: `legacy-${i}-${name}`,
      label: name,
      to: null,
      title: 'networks 원장에서 확인되지 않은 옛 표기입니다',
    })),
  ]

  /** 사람 목록 한 줄. 비어 있으면 `InfoRows`가 `-`로 대신한다(빈 배열을 빈 목록으로 넘기지 않는다). */
  const people = (items: RefLinkItem[]) =>
    items.length > 0 ? <RefLinkList as={Link} items={items} /> : null

  return (
    <div className="space-y-4">
      <Card title="회의 정보">
        {/*
          짧은 값 둘은 두 칸으로 견주고, 안건만 줄 전체를 받는다 — 한 카드 안의 라벨 축은
          하나로 두되(`InfoField`), 값의 길이에 따라 칸 수만 다르게 준다.
        */}
        <InfoGrid columns={2}>
          <InfoField label="회의일" value={minute.meetingDate} />
          <InfoField label="장소" value={minute.location} />
          <InfoField
            label="주요 안건"
            value={minute.agenda}
            className="sm:col-span-2"
            valueClassName="whitespace-pre-line"
          />
        </InfoGrid>
      </Card>

      {/* 사람을 다루는 두 카드는 나란히 선다 — 쓰기 화면이 같은 자리에 같은 짝으로 세운다. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card title="참석자">
          <InfoRows
            items={[
              { label: '내부 참석자', value: people(attendees.map(personItem)) },
              { label: '외부 참석자', value: people(externals) },
            ]}
          />
        </Card>

        <Card title="열람 설정" help="참조는 회의 참석자가 아니라 비공개 회의록을 함께 볼 사람입니다.">
          <InfoRows
            items={[
              {
                label: '참조',
                // 전체공개면 참조는 애초에 둘 수 없는 값이라, 비어 있는 이유를 자리가 답한다
                // (`-`만 서면 "안 넣었다"와 "넣을 수 없다"가 화면에서 같아진다).
                value: references.length > 0 ? people(references.map(personItem)) : isOpen ? '전체공개라 참조를 두지 않습니다' : null,
                meta: references.length === 0 && isOpen,
              },
            ]}
          />
        </Card>
      </div>

      <Card title="관련 업무" help="연동된 사업·스타트업·네트워크와 상호 참조됩니다. 비어 있으면 일반 회의록입니다.">
        <InfoRows
          items={[
            {
              label: '연동 대상',
              value: people(minute.links.map((l) => linkItem(l, { showKind: true }))),
            },
          ]}
        />
      </Card>

      <Card title="회의 내용">
        {minute.body ? (
          <RichTextViewer html={minute.body} />
        ) : (
          // 빈 상태는 접지 않는다 — 본문이 없는 회의록과 아직 안 불러온 화면은 다른 사실이다.
          <p className={cardText.subtitle}>본문이 없습니다.</p>
        )}
      </Card>
    </div>
  )
}
