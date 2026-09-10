import { PanelCard } from '@ynarcher/ui'
import type { BusinessStatusEntry } from '@/features/startup/startupGrowth'

/**
 * 연혁이 몇 줄을 넘으면 두 단으로 쪼갠다(2026-09-10 사용자 지정).
 *
 * 연혁은 다른 실적 카드와 달리 **행 수가 기업 나이에 비례해** 자란다 — 열 몇 줄이 되면 이
 * 카드 하나가 화면 두 쪽을 쓰고, 그 아래 매출·투자 카드가 스크롤 밖으로 밀린다. 다섯 줄까지는
 * 한 단이 오히려 읽기 좋으므로 그때는 쪼개지 않는다.
 */
const TWO_COLUMN_FROM = 6

/**
 * 비즈니스 타임라인 카드(스타트업 상세, 주주 구성 아래). 읽기 전용.
 * 날짜 내림차순으로 정렬된 현황 항목을 점-선 타임라인으로 보여준다.
 * 편집은 통합 수정 폼('성장 지표' 입력 섹션)에서 관리한다.
 */
export function StartupBusinessTimeline({ businessStatus }: { businessStatus: BusinessStatusEntry[] }) {
  /**
   * 두 단은 **앞 절반이 왼쪽, 뒤 절반이 오른쪽**이다(신문처럼 세로로 읽고 넘어간다).
   *
   * 격자에 한 줄씩 번갈아 넣지 않는 이유는 순서다 — 그렇게 담으면 최신·그다음이 좌우로 나란히
   * 서서 시간이 가로로 흐르고, 한 단을 세로로 훑는 눈이 매 줄 오른쪽을 함께 봐야 한다.
   *
   * 배열을 둘로 갈라 **각 단이 자기 타임라인을 그린다** — CSS 다단으로 흘리면 단이 갈리는
   * 자리에서 점선 커넥터가 다음 점 없이 허공으로 뻗는다.
   */
  const split = businessStatus.length >= TWO_COLUMN_FROM ? Math.ceil(businessStatus.length / 2) : 0
  const columns = split ? [businessStatus.slice(0, split), businessStatus.slice(split)] : [businessStatus]

  return (
    <PanelCard title="연혁">
      {businessStatus.length === 0 ? (
        <p className="text-body text-gray-600">등록된 연혁이 없습니다.</p>
      ) : (
        // 좁은 화면에서는 한 단으로 되돌린다 — 두 단이 각각 절반 폭이 되면 한 줄짜리 내용이
        // 서너 줄로 접혀 오히려 세로로 길어진다.
        <div className={split ? 'grid grid-cols-1 gap-x-8 md:grid-cols-2' : undefined}>
          {columns.map((entries, col) => (
            <TimelineColumn key={col} entries={entries} />
          ))}
        </div>
      )}
    </PanelCard>
  )
}

/** 한 단. 커넥터는 그 단 안에서만 이어진다(단의 마지막 줄에는 붙지 않는다). */
function TimelineColumn({ entries }: { entries: BusinessStatusEntry[] }) {
  return (
    <ul>
      {entries.map((e, i) => (
        <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
          {/* 점-투-점 커넥터: 이 점 중앙에서 다음 점 중앙까지(항목 높이=점 간격이므로 h-full로 정확히 도달). 마지막 항목엔 없음. */}
          {i < entries.length - 1 && (
            <span className="absolute left-1 top-2.5 h-full w-px -translate-x-1/2 bg-gray-200" aria-hidden />
          )}
          <span className="relative z-10 mt-1.5 size-2 shrink-0 rounded-full border-2 border-brand bg-white" aria-hidden />
          <div className="min-w-0">
            {/* 날짜와 내용은 크기를 본문 하나로 두고 위계는 색으로만 만든다. */}
            <p className="text-body text-gray-500">{e.date || '-'}</p>
            <p className="whitespace-pre-wrap text-body text-gray-900">{e.content}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
