import { Card, TextArea } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { GuestButton } from '@/components/GuestButton'
import { StarRating } from '@/components/StarRating'
import {
  useAvailableSlots,
  useBookSlot,
  useMentoringSessions,
  useMyPrograms,
  useSubmitSatisfaction,
  useTimeline,
} from '@/features/hooks'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ko-KR') : '일정 미정'
}


/** 스타트업 게스트 대시보드: 타임라인 · 예약 콘솔 · 만족도 평가지. */
export function StartupDashboard() {
  const { data: programs } = useMyPrograms()
  const programIds = useMemo(
    () => (programs ?? []).map((p) => p.program_id),
    [programs],
  )
  const { data: timeline } = useTimeline(programIds)
  const { data: slots } = useAvailableSlots()
  const book = useBookSlot()
  const { data: sessions } = useMentoringSessions()
  const submit = useSubmitSatisfaction()

  const [evalSession, setEvalSession] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [done, setDone] = useState<string[]>([])

  const onSubmitEval = async () => {
    if (!evalSession || score === 0) return
    try {
      await submit.mutateAsync({
        mentoring_session_id: evalSession,
        score,
        feedback_text: feedback.trim() || null,
      })
      setDone((d) => [...d, evalSession])
      setEvalSession(null)
      setScore(0)
      setFeedback('')
    } catch {
      /* RLS/네트워크 오류 시 무시(재시도 가능) */
    }
  }

  return (
    <div className="space-y-5">
      <Card title="보육 프로그램 타임라인">
        <ol className="space-y-2">
          {(timeline ?? []).map((t) => (
            <li key={t.id} className="flex gap-3 border-l-2 border-brand/40 pl-3">
              <div>
                <p className="text-body font-medium text-gray-900">{t.title}</p>
                <p className="text-caption text-gray-600">{fmt(t.starts_at)}</p>
              </div>
            </li>
          ))}
          {(timeline ?? []).length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              공개된 일정이 없습니다.
            </p>
          )}
        </ol>
      </Card>

      <Card title="1:1 미팅 예약">
        <div className="space-y-2">
          {(slots ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
            >
              <span className="text-body text-gray-800">{fmt(s.starts_at)}</span>
              <GuestButton disabled={book.isPending} onClick={() => book.mutate(s.id)}>
                예약 신청
              </GuestButton>
            </div>
          ))}
          {(slots ?? []).length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              예약 가능한 시간대가 없습니다.
            </p>
          )}
        </div>
      </Card>

      <Card title="멘토 만족도 평가">
        <div className="space-y-2">
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="rounded-radius-md border border-gray-300 p-3">
              <div className="flex items-center justify-between">
                <span className="text-body text-gray-800">
                  {s.round_no}회차 · {fmt(s.scheduled_at)}
                </span>
                {done.includes(s.id) ? (
                  <span className="text-caption text-success">제출 완료</span>
                ) : (
                  <GuestButton
                    variant="outline"
                    onClick={() => setEvalSession(evalSession === s.id ? null : s.id)}
                  >
                    평가하기
                  </GuestButton>
                )}
              </div>
              {evalSession === s.id && (
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
                    onClick={() => void onSubmitEval()}
                  >
                    제출
                  </GuestButton>
                </div>
              )}
            </div>
          ))}
          {(sessions ?? []).length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              평가할 멘토링 세션이 없습니다.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
