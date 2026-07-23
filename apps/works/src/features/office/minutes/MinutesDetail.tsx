import { Badge, BackButton, Button, EmptyState } from '@ynarcher/ui'
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
      <span className="w-20 shrink-0 pt-0.5 text-body text-gray-500">{label}</span>
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
      <span className="w-20 shrink-0 pt-0.5 text-body text-gray-500">연동</span>
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
          return path ? (
            <Link
              key={key}
              to={path}
              className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-caption font-medium text-brand transition-colors hover:bg-brand/20"
            >
              {content}
            </Link>
          ) : (
            <span
              key={key}
              className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-caption font-medium text-gray-500"
              title="접근 권한이 없어 열 수 없는 대상입니다"
            >
              {content}
            </span>
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

  if (isLoading) return <p className="py-10 text-center text-body text-gray-400">불러오는 중…</p>
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
          {/* 회의 정보 카드: 제목·공개범위·메타 + 참석자/참조 태그 */}
          <article className="overflow-hidden rounded-radius-lg border border-gray-300 bg-white shadow-soft">
            <div className="space-y-4 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="min-w-0 text-title-md font-bold leading-tight text-gray-900">
                    {minute.title}
                  </h1>
                  <Badge tone={minute.visibility === 'OFFICE' ? 'info' : 'neutral'}>
                    {MINUTE_VISIBILITY_LABEL[minute.visibility]}
                  </Badge>
                </div>
                {/* 메타는 상세페이지 공통 '라벨: 값' 패턴(게시판·STARTUP 정보행과 동일). */}
                <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  {minute.authorName && (
                    <span className="flex items-baseline gap-2">
                      <span className="text-body text-gray-500">작성자</span>
                      <span className="text-body font-medium text-gray-800">{minute.authorName}</span>
                    </span>
                  )}
                  {minute.meetingDate && (
                    <span className="flex items-baseline gap-2">
                      <span className="text-body text-gray-500">회의일</span>
                      <span className="text-body font-medium tabular-nums text-gray-800">{minute.meetingDate}</span>
                    </span>
                  )}
                  <span className="flex items-baseline gap-2">
                    <span className="text-body text-gray-500">조회</span>
                    <span className="text-body font-medium tabular-nums text-gray-800">
                      {minute.viewCount.toLocaleString()}
                    </span>
                  </span>
                </div>
              </div>
              {(hasPeople || minute.links.length > 0) && (
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  <TagRow label="내부 참석자" names={attendees} />
                  <TagRow label="외부 참석자" names={minute.externalAttendees} />
                  <TagRow label="참조" names={references} />
                  <LinkRow links={minute.links} />
                </div>
              )}
              {(minute.location || minute.agenda) && (
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  {minute.location && (
                    <div className="flex items-start gap-2">
                      <span className="w-20 shrink-0 pt-0.5 text-body text-gray-500">장소</span>
                      <p className="min-w-0 text-body text-gray-800">{minute.location}</p>
                    </div>
                  )}
                  {minute.agenda && (
                    <div className="flex items-start gap-2">
                      <span className="w-20 shrink-0 pt-0.5 text-body text-gray-500">주요 안건</span>
                      <p className="min-w-0 whitespace-pre-line text-body text-gray-800">{minute.agenda}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* 본문 카드 */}
          <article className="overflow-hidden rounded-radius-lg border border-gray-300 bg-white shadow-soft">
            <header className="px-6 py-4">
              <h2 className="text-title-sm font-semibold text-gray-900">회의 내용</h2>
            </header>
            {/* 구분선은 카드 끝까지 닿지 않도록 본문과 같은 좌우 여백 안쪽으로 들인다. */}
            <div className="mx-6 border-t border-gray-200" />
            <div className="px-6 py-6">
              {minute.body ? (
                <RichTextViewer html={minute.body} />
              ) : (
                <p className="text-body text-gray-500">본문이 없습니다.</p>
              )}
            </div>
          </article>
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
