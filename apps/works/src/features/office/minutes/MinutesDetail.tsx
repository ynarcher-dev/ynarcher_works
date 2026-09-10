import {
  Badge,
  BackButton,
  Button,
  DetailTopBar,
  EmptyState,
  EntityHeaderCard,
  InfoField,
  InfoGrid,
  RefLinkList,
  Spinner,
} from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MinuteReadSections } from '@/features/office/minutes/MinuteReadSections'
import { personItem } from '@/features/office/minutes/minuteRefItems'
import {
  MINUTE_ATTACHMENT_TYPE,
  MINUTE_FEEDBACK_TYPE,
  MINUTE_VISIBILITY_LABEL,
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
        {/* 좌: 2/3 — 머리 카드 아래로 쓰기 화면과 같은 섹션들이 선다(`MinuteReadSections`). */}
        <div className="space-y-4 lg:col-span-2">
          <EntityHeaderCard
            title={minute.title}
            badges={
              // 공개범위는 문서를 열자마자 알아야 하는 사실이라 머리에 두고, 아래 카드에서
              // 다시 적지 않는다 — 같은 값을 묻는 표기는 화면에 하나뿐이어야 한다.
              <Badge tone={minute.visibility === 'OFFICE' ? 'info' : 'neutral'}>
                {MINUTE_VISIBILITY_LABEL[minute.visibility]}
              </Badge>
            }
            info={
              /*
                머리가 드는 것은 **이 기록을 누가 다뤘는가**뿐이다(2026-09-10).

                종전에는 회의일이 여기 함께 섰는데, 그러면 회의의 사실이 머리와 `회의 정보`
                카드로 갈려 어느 쪽이 그 축의 임자인지 화면이 답하지 못한다. 회의일·장소·안건은
                쓰기 화면에서 한 카드에 함께 사는 값이므로 읽기에서도 함께 산다.
              */
              <InfoGrid columns={2}>
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
          />

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
