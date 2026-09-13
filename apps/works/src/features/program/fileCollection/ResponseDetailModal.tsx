import {
  Badge,
  Banner,
  Button,
  EmptyValue,
  Field,
  Modal,
  Skeleton,
  TextArea,
  cardText,
  useToast,
} from '@ynarcher/ui'
import {
  canReviewResponse,
  fileCollectionStatusLabel,
  fileCollectionStatusTone,
  filesByRound,
  formatFileSize,
  roundLabel,
} from '@ynarcher/master-data'
import { Download } from 'lucide-react'
import { useState } from 'react'
import {
  downloadFileCollectionFile,
  useAddResponseComment,
  useResponseDetail,
  useReviewResponse,
} from '@/features/program/fileCollection/fileCollectionHooks'
import type { MonitorResponseRow } from '@/features/program/fileCollection/monitorRow'
import { failureText } from '@/lib/failureText'

/**
 * 문항 하나의 제출 상세 — 파일·피드백을 읽고 검토를 내린다.
 *
 * **지난 회차를 지우지 않는다.** 보완 요청으로 회차가 오른 뒤에도 처음 낸 파일이 아래에
 * 남아 있어야 무엇이 보완된 것인지 견줄 수 있다. 회차는 최신이 위다.
 *
 * 파일 이름·코멘트는 밖에서 들어온 글이므로 **텍스트로만** 렌더하고(HTML 주입 없음),
 * 공백 없는 긴 이름도 칸 안에서 접는다 — 320px 창에서도 넘치지 않아야 한다.
 */
export function ResponseDetailModal({
  open,
  moduleId,
  responseId,
  row,
  path,
  canWrite,
  onClose,
}: {
  open: boolean
  moduleId: string
  responseId: string
  row: MonitorResponseRow | null
  path: string
  canWrite: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const detail = useResponseDetail(responseId)
  const review = useReviewResponse(moduleId)
  const addComment = useAddResponseComment(moduleId)

  const [comment, setComment] = useState('')
  const [reworkReason, setReworkReason] = useState('')

  const status = row?.status ?? 'NOT_SUBMITTED'
  const reviewable = canWrite && canReviewResponse(status)
  const busy = review.isPending || addComment.isPending
  const rounds = filesByRound(detail.data?.files ?? [])

  const submitReview = (decision: 'APPROVED' | 'REWORK_REQUESTED') => {
    if (decision === 'REWORK_REQUESTED' && !reworkReason.trim()) {
      toast.show('보완 요청 사유를 적어 주세요.', 'warning')
      return
    }
    review.mutate(
      {
        responseId,
        decision,
        comment: decision === 'REWORK_REQUESTED' ? reworkReason : comment,
      },
      {
        onSuccess: () => {
          setReworkReason('')
          setComment('')
          toast.show(
            decision === 'APPROVED' ? '검토를 완료했습니다.' : '보완을 요청했습니다.',
            'success',
          )
          onClose()
        },
        onError: (e) => toast.show(failureText(e, '검토를 저장하지 못했습니다.'), 'danger'),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="제출 상세"
      help="문항 단위로 검토합니다. 보완을 요청하면 회차가 올라가고 이전 회차의 파일은 그대로 남습니다."
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            닫기
          </Button>
          {reviewable && (
            <>
              <Button
                variant="outline-danger"
                disabled={busy}
                onClick={() => submitReview('REWORK_REQUESTED')}
              >
                {review.isPending ? '처리 중…' : '보완 요청'}
              </Button>
              <Button disabled={busy} onClick={() => submitReview('APPROVED')}>
                검토 완료
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="min-w-0 max-w-full space-y-4">
        <div className="min-w-0 space-y-1">
          <p className={cardText.label}>문항</p>
          <p className={`${cardText.value} break-words [overflow-wrap:anywhere]`}>
            {path || <EmptyValue />}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={fileCollectionStatusTone(status)}>
              {fileCollectionStatusLabel(status)}
            </Badge>
            <span className={cardText.meta}>{roundLabel(row?.round ?? 1)}</span>
            <span className={`${cardText.meta} break-words [overflow-wrap:anywhere]`}>
              {row?.assignment.guest_name ?? ''}
            </span>
            {row?.assignment.revoked_at && <Badge tone="neutral">배정 회수</Badge>}
          </div>
        </div>

        {/* 상한에 걸려 못 읽은 구간이 있으면 그 사실을 적는다 — 파일이 다 보이는 것처럼
            읽히면 검토가 없는 자료를 근거로 내려간다. */}
        {detail.data?.truncated && (
          <Banner tone="warning">
            파일 또는 코멘트가 너무 많아 일부만 불러왔습니다. 아래 목록이 전부가 아닐 수 있으니
            검토 전에 확인해 주세요.
          </Banner>
        )}

        {detail.isError && (
          <Banner tone="danger">
            <div className="flex flex-wrap items-center gap-2">
              <span>{failureText(detail.error, '제출 내용을 불러오지 못했습니다.')}</span>
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                다시 시도
              </Button>
            </div>
          </Banner>
        )}

        <section className="min-w-0 space-y-2">
          <h3 className={cardText.subhead}>제출 파일</h3>
          {detail.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rounds.length === 0 ? (
            <p className={cardText.meta}>아직 올라온 파일이 없습니다.</p>
          ) : (
            rounds.map((group) => (
              <div key={group.round} className="min-w-0 space-y-1">
                <p className={cardText.label}>
                  {roundLabel(group.round)}
                  {group.round === (row?.round ?? 1) ? ' (현재)' : ' (지난 회차)'}
                </p>
                <ul className="min-w-0 space-y-1">
                  {group.files.map((file) => (
                    <li
                      key={file.id}
                      className="flex min-w-0 flex-col gap-1 rounded-radius-md bg-gray-25 px-3 py-2"
                    >
                      {/* 이름이 줄을 통째로 쓴다 — 크기·올린 사람·버튼과 한 줄을 나눠 쓰면
                          320px에서 이름 칸이 서너 글자로 눌려 무엇을 검토하는지가 사라진다. */}
                      <span
                        className={`min-w-0 break-words [overflow-wrap:anywhere] ${cardText.value}`}
                      >
                        {file.original_name}
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          {formatFileSize(file.byte_size) && (
                            <span className={cardText.meta}>{formatFileSize(file.byte_size)}</span>
                          )}
                          {file.uploader_name && (
                            <span
                              className={`min-w-0 break-words [overflow-wrap:anywhere] ${cardText.meta}`}
                            >
                              {file.uploader_name}
                            </span>
                          )}
                        </span>
                        {file.status === 'READY' ? (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void downloadFileCollectionFile(file.id, file.original_name).catch(
                                (e) =>
                                  toast.show(
                                    failureText(e, '파일을 내려받지 못했습니다.'),
                                    'danger',
                                  ),
                              )
                            }
                          >
                            <Download size={14} className="mr-1" />
                            받기
                          </Button>
                        ) : (
                          <Badge tone="neutral">업로드 미완료</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <section className="min-w-0 space-y-2">
          <h3 className={cardText.subhead}>피드백·코멘트</h3>
          {detail.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (detail.data?.comments.length ?? 0) === 0 ? (
            <p className={cardText.meta}>아직 코멘트가 없습니다.</p>
          ) : (
            <ul className="min-w-0 space-y-2">
              {(detail.data?.comments ?? []).map((c) => (
                <li key={c.id} className="min-w-0 rounded-radius-md bg-gray-25 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={c.author_side === 'WORKS' ? 'info' : 'neutral'}>
                      {c.author_side === 'WORKS' ? '운영' : '참여자'}
                    </Badge>
                    <span className={`${cardText.meta} break-words [overflow-wrap:anywhere]`}>
                      {c.author_name ?? ''}
                    </span>
                    <span className={cardText.meta}>
                      {roundLabel(c.round)} · {c.created_at.slice(0, 10)}
                    </span>
                  </div>
                  {/* 밖에서 들어온 글이므로 텍스트로만 렌더한다(HTML 주입 없음). */}
                  <p
                    className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${cardText.value}`}
                  >
                    {c.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canWrite && (
          <section className="min-w-0 space-y-2">
            {reviewable && (
              <Field
                label="보완 요청 사유"
                hint="보완을 요청할 때는 사유가 필수입니다. 그 문장이 받는 사람이 읽는 유일한 설명입니다."
                hintInline
              >
                <TextArea
                  value={reworkReason}
                  onChange={(e) => setReworkReason(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  disabled={busy}
                />
              </Field>
            )}
            <Field label="코멘트">
              <TextArea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={2000}
                disabled={busy}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={busy || !comment.trim()}
              onClick={() =>
                addComment.mutate(
                  { responseId, body: comment.trim() },
                  {
                    onSuccess: () => {
                      setComment('')
                      toast.show('코멘트를 남겼습니다.', 'success')
                    },
                    onError: (e) =>
                      toast.show(failureText(e, '코멘트를 남기지 못했습니다.'), 'danger'),
                  },
                )
              }
            >
              {addComment.isPending ? '남기는 중…' : '코멘트 남기기'}
            </Button>
            {!reviewable && (
              <p className={cardText.meta}>
                검토는 제출된(검토 대기) 문항에서만 내릴 수 있습니다.
              </p>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
