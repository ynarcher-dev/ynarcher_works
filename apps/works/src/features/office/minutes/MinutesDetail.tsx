import { BackButton, Button, DetailTopBar, EmptyState, Spinner } from '@ynarcher/ui'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MinuteReadSections } from '@/features/office/minutes/MinuteReadSections'
import {
  MINUTE_ATTACHMENT_TYPE,
  MINUTE_FEEDBACK_TYPE,
  MINUTE_VOICE_ATTACHMENT_TYPE,
  useDeleteMinute,
  useMinute,
} from '@/features/office/minutes/minutesApi'

interface Props {
  minuteId: string
  currentUserId: string | null
  onBack: () => void
  onEdit: () => void
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

  const onDelete = () => {
    if (!window.confirm('이 회의록을 삭제할까요?')) return
    del.mutate(minuteId, { onSuccess: onBack })
  }

  return (
    <div className="space-y-4">
      <DetailTopBar
        back={<BackButton onClick={onBack}>목록</BackButton>}
        actions={
          canEdit && (
            <>
              <Button variant="outline-danger" onClick={onDelete} disabled={del.isPending}>
                삭제
              </Button>
              <Button onClick={onEdit}>수정</Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* 좌: 2/3 — 머리 카드(사실·사람·연동) 아래로 본문이 선다(`MinuteReadSections`). */}
        <div className="lg:col-span-2">
          <MinuteReadSections minute={minute} />
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
