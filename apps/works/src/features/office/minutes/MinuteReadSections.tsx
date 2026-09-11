import {
  Badge,
  Card,
  EntityHeaderCard,
  EntityHeaderSection,
  EntityHeaderSectionRow,
  InfoField,
  InfoGrid,
  InfoRows,
  RefLinkList,
  cardText,
  type RefLinkItem,
} from '@ynarcher/ui'
import { RichTextViewer } from '@/components/RichTextEditor'
import { linkItem, personItem } from '@/features/office/minutes/minuteRefItems'
import { MINUTE_VISIBILITY_LABEL, type MinuteDetail } from '@/features/office/minutes/minutesApi'

/**
 * 회의록 읽기 화면의 본문 — **머리 카드 하나에 섹션으로 접는다**(2026-09-10 사용자 지정,
 * 같은 날 오전의 '쓰기와 같은 카드로 가른다'를 잇는 정정).
 *
 * 가른 것 자체는 맞았다. 틀린 것은 **가른 자리를 카드로 세운 것**이다 — 회의 정보·참석자·
 * 열람 설정·관련 업무는 각각 한두 줄짜리인데, 카드는 테두리와 제목과 안쪽 여백을 함께 들고
 * 오므로 한 줄을 세우는 데 카드 한 장이 쓰였다. 그래서 화면에는 값보다 테두리가 많았다.
 *
 * 규격은 지어내지 않고 사업 상세의 기본 데이터 카드(`ProgramInfoCard`)를 그대로 따른다 —
 * 제목·배지 → 부제 → 구분선 → 정보 격자 → 캡션 달린 섹션. **한 레코드를 읽는 화면이 여럿
 * 있는데 그중 하나만 다른 모양이면, 그 다름이 뜻을 갖지 않는데도 다르게 읽힌다.**
 *
 * 쓰기 화면과의 약속은 그대로다 — **단위·순서·이름**(회의 정보·참석자·열람 설정·관련 업무)이
 * 지켜지고, 그것을 카드로 세우는지 섹션으로 세우는지만 갈린다. 적는 자리는 칸마다 손이 들어가
 * 숨 쉴 자리가 필요하고, 읽는 자리는 한 문서를 위에서 아래로 훑는 자리다.
 *
 * **주요 안건은 라벨을 잃고 부제로 오른다.** "이 회의가 무엇에 관한 것인가"에 답하는 한 줄이라
 * 사업 카드의 설명과 같은 자리이고, 격자 칸에 두면 짧은 값 둘(회의일·장소) 옆에서 혼자 줄
 * 전체를 받아 그 줄이 비어 보였다.
 *
 * **이름에 링크를 걸지 않는다**(2026-09-10 사용자 지정) — 근거는 `minuteRefItems`에 적었다.
 * **참석자와 열람 설정은 나란히 선다** — 둘 다 이름 한 줄짜리라 쌓으면 오른쪽이 통째로 빈다.
 *
 * **빈 값도 자리를 지킨다** — 값이 있는 줄만 세우면 같은 항목이 회의록마다 다른 자리에 서서
 * 둘을 같은 눈으로 읽을 수 없다. **공개범위는 배지 하나가 답한다**(같은 값을 묻는 표기는
 * 화면에 하나뿐이어야 하고, 문서를 열자마자 알아야 하는 사실이라 그 하나는 머리에 둔다).
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
      title: 'NETWORKS·STARTUP 원장에 연결하지 않고 회의록에만 남긴 표기입니다',
    })),
  ]

  /**
   * 사람 목록 한 줄. 비어 있으면 `InfoRows`가 `-`로 대신한다(빈 배열을 빈 목록으로 넘기지 않는다).
   * 종류·소속은 태그로 선다(`kindAs`) — 한 레코드만 서는 상세라 목록에서 배지를 접는 근거가
   * 여기서는 성립하지 않고, 그 자리에서 종류는 훑어 넘길 배경이 아니라 읽어야 할 값이다.
   */
  const people = (items: RefLinkItem[]) =>
    items.length > 0 ? <RefLinkList items={items} kindAs="tag" /> : null

  return (
    <div className="space-y-4">
      <EntityHeaderCard
        title={minute.title}
        badges={
          <Badge tone={isOpen ? 'info' : 'neutral'}>
            {MINUTE_VISIBILITY_LABEL[minute.visibility]}
          </Badge>
        }
        description={minute.agenda}
        info={
          /*
            두 칸으로 세운다 — 위 줄은 회의의 사실(언제·어디서), 아래 줄은 이 기록을 다룬
            흔적(누가 적었고 몇 번 열렸는가)이다. 세 칸이면 넷이 3+1로 접혀 그 갈림이 사라진다.
          */
          <InfoGrid columns={2}>
            <InfoField label="회의일" value={minute.meetingDate} />
            <InfoField label="장소" value={minute.location} />
            <InfoField label="작성자" value={minute.authorName} meta />
            <InfoField label="조회" value={minute.viewCount.toLocaleString()} meta />
          </InfoGrid>
        }
      >
        <EntityHeaderSectionRow>
          <EntityHeaderSection label="참석자">
            <InfoRows
              items={[
                { label: '내부 참석자', value: people(attendees.map(personItem)) },
                { label: '외부 참석자', value: people(externals) },
              ]}
            />
          </EntityHeaderSection>

          <EntityHeaderSection
            label="열람 설정"
            help="참조는 회의 참석자가 아니라 비공개 회의록을 함께 볼 사람입니다."
          >
            <InfoRows
              items={[
                {
                  label: '참조',
                  // 전체공개면 참조는 애초에 둘 수 없는 값이라, 비어 있는 이유를 자리가 답한다
                  // (`-`만 서면 "안 넣었다"와 "넣을 수 없다"가 화면에서 같아진다).
                  value:
                    references.length > 0
                      ? people(references.map(personItem))
                      : isOpen
                        ? '전체공개라 참조를 두지 않습니다'
                        : null,
                  meta: references.length === 0 && isOpen,
                },
              ]}
            />
          </EntityHeaderSection>
        </EntityHeaderSectionRow>

        <EntityHeaderSection
          label="관련 업무"
          help="연동된 사업·스타트업·네트워크와 상호 참조됩니다. 비어 있으면 일반 회의록입니다."
        >
          <InfoRows
            items={[
              {
                label: '연동 대상',
                value: people(minute.links.map((l) => linkItem(l, { showKind: true }))),
              },
            ]}
          />
        </EntityHeaderSection>
      </EntityHeaderCard>

      {/* 본문만 카드로 남는다 — 머리 카드가 답하는 것은 이 회의의 사실이고, 여기는 그 회의에서
          오간 말이다. 길이도 성격도 달라 같은 카드 안에서 구분선 하나로 잇지 않는다. */}
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
