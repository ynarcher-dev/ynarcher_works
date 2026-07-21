import type { ExpertRankRow } from '@/features/networks/dashboardHooks'

/** 만족도 별점 아이콘(상세페이지 멘토링 만족도와 동일 톤). */
function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-warning" aria-hidden>
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

/**
 * 네트워크 평가랭킹 패널: 순위 표(이름·구분·분야·활동건·만족도).
 * BAN·EXP·전문가·투자사 4종을 통합해 활동건 내림차순으로 표시한다. 활동건·만족도는
 * 실집계 연동 전이라 '-'로 표기하며, 만족도는 별점 아이콘과 함께 노출한다.
 */
export function ExpertRankingPanel({
  rows,
  onOpen,
  limit,
}: {
  rows: ExpertRankRow[]
  onOpen: (r: ExpertRankRow) => void
  limit?: number
}) {
  const sorted = [...rows].sort((a, b) => {
    const byActivity = (b.activity ?? -1) - (a.activity ?? -1)
    return byActivity !== 0 ? byActivity : (b.satisfaction ?? -1) - (a.satisfaction ?? -1)
  })
  const sliced = limit ? sorted.slice(0, limit) : sorted
  // TODO(임시): 활동건 999·만족도 5.0 렌더 미리보기용 예시. 실집계 연동 시 제거.
  const shown = sliced.map((r, i) => (i === 0 ? { ...r, activity: 999, satisfaction: 5.0 } : r))
  const hidden = sorted.length - shown.length

  return (
    <div className="space-y-2">
      {shown.length === 0 ? (
        <p className="py-8 text-center text-caption text-gray-600">표시할 네트워크가 없습니다.</p>
      ) : (
        <table className="w-full text-caption">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-700">
              <th className="w-6 rounded-l-radius-sm py-1.5 pl-2 font-medium">#</th>
              <th className="py-1.5 font-medium">이름</th>
              <th className="py-1.5 font-medium">구분</th>
              <th className="py-1.5 font-medium">분야</th>
              <th className="w-14 py-1.5 text-right font-medium text-gray-700">활동건</th>
              <th className="w-14 rounded-r-radius-sm py-1.5 pr-2 text-right font-medium">만족도</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={`${r.entity}:${r.id}`}
                onClick={() => onOpen(r)}
                className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="py-1.5 pl-2 tabular-nums text-gray-700">{i + 1}</td>
                <td className="py-1.5 font-medium text-gray-900">
                  <span className="block max-w-[6rem] truncate" title={r.name}>{r.name}</span>
                </td>
                <td className="py-1.5 text-gray-700">{r.category || '-'}</td>
                <td className="py-1.5 text-gray-700">
                  {r.fields.length === 0 ? (
                    <span className="text-gray-500">-</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {r.fields.map((f) => (
                        <span
                          key={f}
                          className="rounded-radius-sm bg-gray-100 px-1.5 py-0.5 text-caption text-gray-700"
                        >
                          {f}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-gray-800">
                  {r.activity ?? '-'}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                  {r.satisfaction != null ? (
                    <span className="inline-flex items-center justify-end gap-0.5">
                      <StarIcon />
                      {r.satisfaction.toFixed(1)}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <p className="pt-0.5 text-right text-caption text-gray-700">외 {hidden}개</p>
      )}
    </div>
  )
}
