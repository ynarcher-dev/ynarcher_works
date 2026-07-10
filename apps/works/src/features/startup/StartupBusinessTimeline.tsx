import type { BusinessStatusEntry } from '@/features/startup/startupGrowth'

/**
 * 비즈니스 타임라인 카드(스타트업 상세, 주주 구성 아래). 읽기 전용.
 * 날짜 내림차순으로 정렬된 현황 항목을 점-선 타임라인으로 보여준다.
 * 편집은 통합 수정 폼('성장 지표' 입력 섹션)에서 관리한다.
 */
export function StartupBusinessTimeline({ businessStatus }: { businessStatus: BusinessStatusEntry[] }) {
  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      <h3 className="mb-3 text-body font-semibold text-gray-900">비즈니스 타임라인</h3>
      {businessStatus.length === 0 ? (
        <p className="text-body text-gray-400">등록된 비즈니스 타임라인이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {businessStatus.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full border-2 border-brand" aria-hidden />
              <div>
                <p className="text-caption text-gray-400">{e.date || '-'}</p>
                <p className="whitespace-pre-wrap text-body text-gray-800">{e.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
