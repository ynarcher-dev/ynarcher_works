import { useState } from 'react'
import { StarRating } from '@/components/StarRating'
import { useMentoringSessions, useSubmitFeedback } from '@/features/hooks'

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ko-KR') : '일정 미정'
}

const sectionClass = 'rounded-lg border border-gray-200 bg-white p-4'
const btnClass =
  'min-h-12 rounded bg-brand px-4 text-body font-medium text-white active:bg-brand-700 disabled:opacity-50'

const METRICS = [
  { key: 'score_technology', label: '기술성' },
  { key: 'score_business_model', label: '사업 BM 적절성' },
  { key: 'score_credibility', label: '신뢰도' },
  { key: 'score_collaboration', label: '협업 잠재력' },
  { key: 'score_matching_feasibility', label: '매칭 성사율' },
] as const

type MetricKey = (typeof METRICS)[number]['key']

/** 전문가 게스트 대시보드: 스케줄 보드 · 상담일지/평가지 작성. */
export function ExpertDashboard() {
  const { data: sessions } = useMentoringSessions()
  const submitFeedback = useSubmitFeedback()

  const [openId, setOpenId] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<MetricKey, number>>({
    score_technology: 0,
    score_business_model: 0,
    score_credibility: 0,
    score_collaboration: 0,
    score_matching_feasibility: 0,
  })
  const [comment, setComment] = useState('')
  const [done, setDone] = useState<string[]>([])

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
      setScores({
        score_technology: 0,
        score_business_model: 0,
        score_credibility: 0,
        score_collaboration: 0,
        score_matching_feasibility: 0,
      })
      setComment('')
    } catch {
      /* RLS/네트워크 오류 시 무시 */
    }
  }

  return (
    <div className="space-y-5">
      <section className={sectionClass}>
        <h2 className="text-title-sm font-semibold text-gray-900">
          멘토링 스케줄 보드
        </h2>
        <div className="mt-3 space-y-2">
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-body text-gray-800">
                  {s.round_no}회차 · {fmt(s.scheduled_at)}
                </span>
                {done.includes(s.id) ? (
                  <span className="text-caption text-success">평가 완료</span>
                ) : (
                  <button
                    type="button"
                    className="min-h-12 rounded border border-gray-300 px-3 text-body text-gray-700 active:bg-gray-50"
                    onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  >
                    평가지 작성
                  </button>
                )}
              </div>

              {openId === s.id && (
                <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  {METRICS.map((m) => (
                    <div
                      key={m.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-body text-gray-700">{m.label}</span>
                      <StarRating
                        value={scores[m.key]}
                        onChange={(v) => setScore(m.key, v)}
                      />
                    </div>
                  ))}
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="종합 코멘트/조언"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-body focus-visible:border-brand focus-visible:outline-none"
                  />
                  <button
                    type="button"
                    className={btnClass}
                    disabled={submitFeedback.isPending}
                    onClick={() => void onSubmit(s.id)}
                  >
                    평가 제출
                  </button>
                </div>
              )}
            </div>
          ))}
          {(sessions ?? []).length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              배정된 멘토링 일정이 없습니다.
            </p>
          )}
        </div>
      </section>

      <p className="text-caption text-gray-600">
        상담일지는 확정 예약(booking) 완료 후 활성화됩니다.
      </p>
    </div>
  )
}
