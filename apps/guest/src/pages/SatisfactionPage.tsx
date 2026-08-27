import { Card, PageHeader, TextArea } from '@ynarcher/ui'
import { useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { StarRating } from '@/components/StarRating'
import { useMentoringSessions, useSubmitSatisfaction } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

/** 멘토 만족도 — 세션별 별점 + 자유 피드백 제출(3_9_workspace_guest.md §1.1). */
export function SatisfactionPage() {
  const { data: sessions } = useMentoringSessions()
  const submit = useSubmitSatisfaction()

  const [openId, setOpenId] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [done, setDone] = useState<string[]>([])

  const items = sessions ?? []

  const onSubmit = async () => {
    if (!openId || score === 0) return
    try {
      await submit.mutateAsync({
        mentoring_session_id: openId,
        score,
        feedback_text: feedback.trim() || null,
      })
      setDone((d) => [...d, openId])
      setOpenId(null)
      setScore(0)
      setFeedback('')
    } catch {
      /* RLS/네트워크 오류 시 무시(재시도 가능) */
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="멘토 만족도" />
      <Card title="평가 대상 세션" count={items.length}>
        <div className="space-y-2">
          {items.map((s) => (
            <div key={s.id} className="rounded-radius-md border border-gray-300 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body text-gray-800">
                  {s.round_no}회차 · {formatDateTime(s.scheduled_at)}
                </span>
                {done.includes(s.id) ? (
                  <span className="text-caption text-success">제출 완료</span>
                ) : (
                  <GuestButton
                    variant="outline"
                    onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  >
                    평가하기
                  </GuestButton>
                )}
              </div>
              {openId === s.id && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  <StarRating value={score} onChange={setScore} />
                  <TextArea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                    placeholder="피드백 의견(선택)"
                  />
                  <GuestButton
                    disabled={score === 0 || submit.isPending}
                    onClick={() => void onSubmit()}
                  >
                    제출
                  </GuestButton>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              평가할 멘토링 세션이 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
