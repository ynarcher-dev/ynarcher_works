import { Card, PageHeader, TextArea } from '@ynarcher/ui'
import { useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { StarRating } from '@/components/StarRating'
import { useMentoringSessions, useSubmitFeedback } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

const METRICS = [
  { key: 'score_technology', label: '기술성' },
  { key: 'score_business_model', label: '사업 BM 적절성' },
  { key: 'score_credibility', label: '신뢰도' },
  { key: 'score_collaboration', label: '협업 잠재력' },
  { key: 'score_matching_feasibility', label: '매칭 성사율' },
] as const

type MetricKey = (typeof METRICS)[number]['key']

const EMPTY_SCORES: Record<MetricKey, number> = {
  score_technology: 0,
  score_business_model: 0,
  score_credibility: 0,
  score_collaboration: 0,
  score_matching_feasibility: 0,
}

/** 상담 평가지 — 전문가가 스타트업을 진단하는 5대 정량지표 + 종합 코멘트(3_9 §1.2). */
export function MentorFeedbackPage() {
  const { data: sessions } = useMentoringSessions()
  const submitFeedback = useSubmitFeedback()

  const [openId, setOpenId] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<MetricKey, number>>(EMPTY_SCORES)
  const [comment, setComment] = useState('')
  const [done, setDone] = useState<string[]>([])

  const items = sessions ?? []

  const setScore = (k: MetricKey, v: number) =>
    setScores((prev) => ({ ...prev, [k]: v }))

  const onSubmit = async (sessionId: string) => {
    if (Object.values(scores).some((s) => s === 0)) return
    try {
      await submitFeedback.mutateAsync({
        mentoring_session_id: sessionId,
        ...scores,
        advisory_comment: comment.trim() || null,
      })
      setDone((d) => [...d, sessionId])
      setOpenId(null)
      setScores(EMPTY_SCORES)
      setComment('')
    } catch {
      /* RLS/네트워크 오류 시 무시 */
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="상담 평가지" />
      <Card title="작성 대상 세션" count={items.length}>
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className="rounded-radius-md border border-gray-300 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body text-gray-800">
                  {s.round_no}회차 · {formatDateTime(s.scheduled_at)}
                </span>
                {done.includes(s.id) ? (
                  <span className="text-caption text-success">평가 완료</span>
                ) : (
                  <GuestButton
                    variant="outline"
                    onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  >
                    평가지 작성
                  </GuestButton>
                )}
              </div>

              {openId === s.id && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  {METRICS.map((m) => (
                    <div key={m.key} className="flex items-center justify-between gap-3">
                      <span className="text-body text-gray-700">{m.label}</span>
                      <StarRating
                        value={scores[m.key]}
                        onChange={(v) => setScore(m.key, v)}
                      />
                    </div>
                  ))}
                  <TextArea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="종합 코멘트/조언"
                  />
                  <GuestButton
                    disabled={submitFeedback.isPending}
                    onClick={() => void onSubmit(s.id)}
                  >
                    평가 제출
                  </GuestButton>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              작성할 멘토링 세션이 없습니다.
            </p>
          )}
        </div>
      </Card>
      <p className="text-caption text-gray-600">
        상담일지는 확정 예약(booking) 완료 후 활성화됩니다.
      </p>
    </div>
  )
}
