import {
  Badge,
  BackButton,
  Button,
  EmptyState,
  EntityHeaderCard,
  InfoField,
  InfoGrid,
  InfoRows,
  RefLinkList,
  Spinner,
  cardText,
  type RefLinkItem,
  type InfoRowItem,
} from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { RichTextViewer } from '@/components/RichTextEditor'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import {
  MINUTE_ATTACHMENT_TYPE,
  MINUTE_FEEDBACK_TYPE,
  MINUTE_VISIBILITY_LABEL,
  MINUTE_VOICE_ATTACHMENT_TYPE,
  useDeleteMinute,
  useMinute,
} from '@/features/office/minutes/minutesApi'
import {
  MINUTE_LINK_TARGETS,
  minuteLinkPath,
  type MinuteLink,
} from '@/features/office/minutes/minuteLinks'

interface Props {
  minuteId: string
  currentUserId: string | null
  onBack: () => void
  onEdit: () => void
}

/** 임직원 상세(OFFICE 임직원 정보, 조회 전용) 경로. 회의록의 사람은 전부 여기로 간다. */
const employeePath = (userId: string) => `/office/managers/${userId}`

/** 내부 인원(참석자·참조) 한 사람 → 링크 항목. 임직원이라 종류 표기 없이 이름만 선다. */
function personItem(p: { userId: string; name: string }): RefLinkItem {
  return { key: p.userId, label: p.name, to: employeePath(p.userId) }
}

/**
 * 연동·외부 참석자 한 건 → 링크 항목.
 * `label`이 비어 있으면 원장 RLS가 막은 대상이라 갈 곳이 없다 — 이름 대신 그 사실을 적고
 * 링크를 걸지 않는다(`RefLinkList`가 회색 텍스트로 물러나게 처리한다).
 */
function linkItem(l: MinuteLink, opts: { showKind: boolean }): RefLinkItem {
  const kind = MINUTE_LINK_TARGETS[l.targetType].kindLabel
  return {
    key: `${l.targetType}:${l.targetId}`,
    label: l.label ?? '접근 권한 없음',
    kind: opts.showKind ? kind : null,
    // 외부 참석자는 종류 대신 소속이 동명이인을 가른다 — 이름 뒤에 붙는 자리는 하나뿐이다.
    note: opts.showKind ? l.code : (l.code ?? kind),
    to: l.label ? minuteLinkPath(l.targetType, l.targetId) : null,
    title: l.label ? undefined : '접근 권한이 없어 열 수 없는 대상입니다',
  }
}

/** 회의록 상세. 작성자 본인·admin에게만 수정/삭제 버튼을 노출한다(실권한은 RLS가 강제). */
export function MinutesDetail({ minuteId, currentUserId, onBack, onEdit }: Props) {
  const { data: minute, isLoading } = useMinute(minuteId)
  const del = useDeleteMinute()

  if (isLoading) return <Spinner />
  if (!minute) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack}>목록</BackButton>
        <EmptyState title="열람할 수 없습니다" description="삭제되었거나 접근 권한이 없는 회의록입니다." />
      </div>
    )
  }

  const canEdit = !!currentUserId && minute.authorId === currentUserId
  const attendees = minute.people.filter((p) => p.role === 'ATTENDEE')
  const references = minute.people.filter((p) => p.role === 'REFERENCE')
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

  /**
   * 값이 있는 줄만 세운다 — 여섯 줄 중 넷이 `-`면 그 카드는 없는 것을 알리느라 있는 것을 가린다
   * (`InfoRows`의 빈 값 표기는 자리가 반드시 있어야 하는 그리드 항목을 위한 것이다).
   */
  const rows: InfoRowItem[] = []
  if (minute.location) rows.push({ label: '장소', value: minute.location })
  if (attendees.length > 0) {
    rows.push({
      label: '내부 참석자',
      value: <RefLinkList as={Link} items={attendees.map(personItem)} />,
    })
  }
  if (externals.length > 0) {
    rows.push({ label: '외부 참석자', value: <RefLinkList as={Link} items={externals} /> })
  }
  if (references.length > 0) {
    rows.push({ label: '참조', value: <RefLinkList as={Link} items={references.map(personItem)} /> })
  }
  if (minute.links.length > 0) {
    rows.push({
      label: '연동',
      value: (
        <RefLinkList as={Link} items={minute.links.map((l) => linkItem(l, { showKind: true }))} />
      ),
    })
  }
  if (minute.agenda) {
    rows.push({ label: '주요 안건', value: minute.agenda, valueClassName: 'whitespace-pre-line' })
  }

  const onDelete = () => {
    if (!window.confirm('이 회의록을 삭제할까요?')) return
    del.mutate(minuteId, { onSuccess: onBack })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack}>목록</BackButton>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline-danger" onClick={onDelete} disabled={del.isPending}>
              삭제
            </Button>
            <Button onClick={onEdit}>수정</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/*
          좌: 2/3 — 회의록 한 건은 문서 한 건이라 머리와 몸이 한 카드에 선다(게시판 상세와 동일).
          종전에는 본문이 별도 카드였는데, 회의록 본문은 한 줄로 끝나는 일이 흔해서 짧은 회의록일수록
          빈 카드가 화면의 절반을 차지했다 — 카드는 묶음의 경계를 그리는 것이지 자리를 채우는 것이
          아니다. 안에서는 구분선이 성격이 다른 층(메타 / 회의의 사실 / 본문)만 가른다.
        */}
        <div className="lg:col-span-2">
          <EntityHeaderCard
            title={minute.title}
            badges={
              <Badge tone={minute.visibility === 'OFFICE' ? 'info' : 'neutral'}>
                {MINUTE_VISIBILITY_LABEL[minute.visibility]}
              </Badge>
            }
            info={
              // 작성자·조회는 회의 자체가 아니라 기록을 다룬 흔적이라 meta 톤으로 한 단 물러난다.
              // 회의일은 회의의 사실이므로 값 톤 그대로다.
              <InfoGrid columns={3}>
                <InfoField label="회의일" value={minute.meetingDate} />
                <InfoField
                  label="작성자"
                  meta
                  value={
                    minute.authorName && minute.authorId ? (
                      <RefLinkList
                        as={Link}
                        items={[personItem({ userId: minute.authorId, name: minute.authorName })]}
                      />
                    ) : (
                      minute.authorName
                    )
                  }
                />
                <InfoField label="조회" value={minute.viewCount.toLocaleString()} meta />
              </InfoGrid>
            }
          >
            {rows.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <InfoRows items={rows} />
              </div>
            )}
            <div className="mt-4 border-t border-gray-100 pt-4">
              {minute.body ? (
                <RichTextViewer html={minute.body} />
              ) : (
                <p className={cardText.subtitle}>본문이 없습니다.</p>
              )}
            </div>
          </EntityHeaderCard>
        </div>

        {/* 우: 1/3 — 첨부 파일 → 회의 녹음(조회 전용) → 코멘트 */}
        <div className="space-y-4 lg:col-span-1">
          <MaterialPanel targetType={MINUTE_ATTACHMENT_TYPE} targetId={minuteId} title="첨부 파일" readOnly />
          <MaterialPanel targetType={MINUTE_VOICE_ATTACHMENT_TYPE} targetId={minuteId} title="회의 녹음" readOnly />
          <FeedbackPanel targetType={MINUTE_FEEDBACK_TYPE} targetId={minuteId} />
        </div>
      </div>
    </div>
  )
}
