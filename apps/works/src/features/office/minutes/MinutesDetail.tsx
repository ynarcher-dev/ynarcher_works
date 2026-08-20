import {
  Badge,
  BackButton,
  Button,
  CardShell,
  EmptyState,
  EntityHeaderCard,
  InfoField,
  InfoGrid,
  Spinner,
  cardText,
  cn,
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

/** 참석자·외부참석자·참조를 라벨 + 태그(칩) 행으로 표시한다(조회 전용). */
function TagRow({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null
  return (
    <div className="flex items-start gap-2">
      <span className={cn('w-20 shrink-0 pt-0.5', cardText.label)}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name, i) => (
          <Badge key={`${name}-${i}`}>{name}</Badge>
        ))}
      </div>
    </div>
  )
}

/** 연동된 사업/스타트업을 종류 라벨 + 이름 칩으로 표시한다. 접근 가능하면 상세로 링크한다. */
function LinkRow({ links }: { links: MinuteLink[] }) {
  if (links.length === 0) return null
  return (
    <div className="flex items-start gap-2">
      <span className={cn('w-20 shrink-0 pt-0.5', cardText.label)}>연동</span>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => {
          const kind = MINUTE_LINK_TARGETS[l.targetType].kindLabel
          const path = l.label ? minuteLinkPath(l.targetType, l.targetId) : null
          const content = (
            <>
              <span className="mr-1 text-gray-400">{kind}</span>
              {l.label ?? '접근 권한 없음'}
              {l.code && <span className="ml-1 text-gray-400">{l.code}</span>}
            </>
          )
          const key = `${l.targetType}:${l.targetId}`
          // 열 수 있으면 info(파랑)로 눌러볼 수 있음을, 아니면 neutral로 죽어 있음을 알린다.
          return path ? (
            <Link key={key} to={path} className="inline-flex">
              <Badge tone="info" className="hover:bg-info-border">
                {content}
              </Badge>
            </Link>
          ) : (
            <Badge key={key} title="접근 권한이 없어 열 수 없는 대상입니다">
              {content}
            </Badge>
          )
        })}
      </div>
    </div>
  )
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
  const attendees = minute.people.filter((p) => p.role === 'ATTENDEE').map((p) => p.name)
  const references = minute.people.filter((p) => p.role === 'REFERENCE').map((p) => p.name)
  const hasPeople =
    attendees.length > 0 || references.length > 0 || minute.externalAttendees.length > 0

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
        {/* 좌: 2/3 — 회의 정보 카드와 본문 카드를 별도 섹션으로 분리한다. */}
        <div className="space-y-4 lg:col-span-2">
          {/* 회의 정보 카드: 제목·공개범위·메타 + 참석자/참조 태그.
              상세 최상단 카드는 전 워크스페이스 공용 규격(EntityHeaderCard)을 쓰고, 메타 줄은
              상세 공통 '라벨: 값'(InfoField)에 맡긴다 — 작성자·조회는 회의 자체가 아니라 기록을
              다룬 흔적이라 meta 톤으로 한 단 물러난다. 회의일은 회의의 사실이므로 값 톤 그대로다. */}
          <EntityHeaderCard
            title={minute.title}
            badges={
              <Badge tone={minute.visibility === 'OFFICE' ? 'info' : 'neutral'}>
                {MINUTE_VISIBILITY_LABEL[minute.visibility]}
              </Badge>
            }
            info={
              <InfoGrid columns={3}>
                {minute.authorName && <InfoField label="작성자" value={minute.authorName} meta />}
                {minute.meetingDate && <InfoField label="회의일" value={minute.meetingDate} />}
                <InfoField label="조회" value={minute.viewCount.toLocaleString()} meta />
              </InfoGrid>
            }
          >
            {(hasPeople || minute.links.length > 0) && (
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                <TagRow label="내부 참석자" names={attendees} />
                <TagRow label="외부 참석자" names={minute.externalAttendees} />
                <TagRow label="참조" names={references} />
                <LinkRow links={minute.links} />
              </div>
            )}
            {(minute.location || minute.agenda) && (
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                {minute.location && (
                  <div className="flex items-start gap-2">
                    <span className={cn('w-20 shrink-0 pt-0.5', cardText.label)}>장소</span>
                    <p className={cn('min-w-0', cardText.value)}>{minute.location}</p>
                  </div>
                )}
                {minute.agenda && (
                  <div className="flex items-start gap-2">
                    <span className={cn('w-20 shrink-0 pt-0.5', cardText.label)}>주요 안건</span>
                    <p className={cn('min-w-0 whitespace-pre-line', cardText.value)}>
                      {minute.agenda}
                    </p>
                  </div>
                )}
              </div>
            )}
          </EntityHeaderCard>

          {/* 본문 카드 */}
          <CardShell>
            {minute.body ? (
              <RichTextViewer html={minute.body} />
            ) : (
              <p className={cardText.subtitle}>본문이 없습니다.</p>
            )}
          </CardShell>
        </div>

        {/* 우: 1/3 — 첨부 파일 → 음성 기록(조회 전용) → 코멘트 */}
        <div className="space-y-4 lg:col-span-1">
          <MaterialPanel targetType={MINUTE_ATTACHMENT_TYPE} targetId={minuteId} title="첨부 파일" readOnly />
          <MaterialPanel targetType={MINUTE_VOICE_ATTACHMENT_TYPE} targetId={minuteId} title="음성 기록" readOnly />
          <FeedbackPanel targetType={MINUTE_FEEDBACK_TYPE} targetId={minuteId} />
        </div>
      </div>
    </div>
  )
}
