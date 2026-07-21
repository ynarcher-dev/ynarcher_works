import { PanelCard } from '@ynarcher/ui'
import type { BusinessStatusEntry } from '@/features/startup/startupGrowth'

/**
 * 비즈니스 타임라인 카드(스타트업 상세, 주주 구성 아래). 읽기 전용.
 * 날짜 내림차순으로 정렬된 현황 항목을 점-선 타임라인으로 보여준다.
 * 편집은 통합 수정 폼('성장 지표' 입력 섹션)에서 관리한다.
 */
export function StartupBusinessTimeline({ businessStatus }: { businessStatus: BusinessStatusEntry[] }) {
  return (
    <PanelCard title="연혁">
      {businessStatus.length === 0 ? (
        <p className="text-body text-gray-600">등록된 연혁이 없습니다.</p>
      ) : (
        <ul>
          {businessStatus.map((e, i) => (
            <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
              {/* 점-투-점 커넥터: 이 점 중앙에서 다음 점 중앙까지(항목 높이=점 간격이므로 h-full로 정확히 도달). 마지막 항목엔 없음. */}
              {i < businessStatus.length - 1 && (
                <span className="absolute left-1 top-2.5 h-full w-px -translate-x-1/2 bg-gray-200" aria-hidden />
              )}
              <span className="relative z-10 mt-1.5 size-2 shrink-0 rounded-full border-2 border-brand bg-white" aria-hidden />
              <div>
                {/* 날짜와 내용은 크기를 본문 하나로 두고 위계는 색으로만 만든다. */}
                <p className="text-body text-gray-500">{e.date || '-'}</p>
                <p className="whitespace-pre-wrap text-body text-gray-900">{e.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
