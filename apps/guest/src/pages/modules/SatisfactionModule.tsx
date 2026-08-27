import { Card, TextArea } from '@ynarcher/ui'
import { useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { StarRating } from '@/components/StarRating'
import { useModuleMentoringSessions, useSubmitSatisfaction } from '@/features/hooks'
import { formatDateTime } from '@/lib/format'

/**
 * N:N 멘토링 메뉴 — 이 메뉴의 세션에 별점과 피드백을 남긴다(3_9_workspace_guest.md §1.1).
 * 제출 이력을 서버에서 되읽지 않고 화면 상태로만 표시하는 것은, 만족도 원장에 게스트 SELECT
 * 정책이 없기 때문이다(제출은 하되 남의 평가는 보지 못한다).
 */
export function SatisfactionModule({ moduleId }: { moduleId: string }) {
  const { data } = useModuleMentoringSessions(moduleId)
  const submit = useSubmitSatisfaction()

  const [openId, setOpenId] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [done, setDone] = useState<string[]>([])

  const sessions = data ?? []

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
    <Card title="평가 대상 세션" count={sessions.length}>
      <div className="space-y-2">
        {sessions.map((s) => (
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
        {sessions.length === 0 && (
          <p className="py-4 text-center text-caption text-gray-500">
            평가할 멘토링 세션이 없습니다.
          </p>
        )}
      </div>
    </Card>
  )
}
