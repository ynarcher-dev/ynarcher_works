import type { EntityRow } from '@/features/master/entityHooks'
import { SectionHeading } from '@/features/startup/SectionHeading'
import { StartupBusinessTimeline } from '@/features/startup/StartupBusinessTimeline'
import { StartupGrowthCards } from '@/features/startup/StartupGrowthSection'
import { StartupMediaCard } from '@/features/startup/StartupMediaCard'
import { readBusinessStatus, readGrowth } from '@/features/startup/startupGrowth'
import { readMedia } from '@/features/startup/startupMedia'
import { readShareholderHistory } from '@/features/startup/startupShareholders'

/**
 * 실적 밴드 — "이 기업이 무엇을 해냈는가".
 *
 * 밴드에 서는 것은 **기간마다 다시 재는 값**이다(트랙션·매출·재무·고용·주주·투자).
 *
 * 연혁이 표들보다 **앞에** 선다. 표는 값이고 연혁은 그 값이 왜 그렇게 움직였는지의 서술이라,
 * 서술이 먼저 와야 표에서 무엇을 찾을지가 정해진다 — 요약을 역량보다 위에 둔 근거와 같은
 * 논리다(판단·맥락이 근거보다 먼저).
 *
 * 미디어가 이 밴드 끝에 오는 이유는 언론 노출도 기간의 사건이기 때문이다. 종전에는 자기 섹션
 * 제목을 갖고 있었는데, 카드 한 장짜리 섹션은 제목이 카드 제목과 같은 말을 두 번 하는 층이 된다.
 */
export function StartupPerformanceSection({ record }: { record: EntityRow }) {
  return (
    <section className="space-y-4">
      <SectionHeading title="실적" />

      {/* 연혁: 아래 지표 표들의 맥락. 값보다 서술이 먼저 선다. */}
      <StartupBusinessTimeline businessStatus={readBusinessStatus(record)} />

      {/* 지표 격자: 핵심 지표·고객 → 매출·재무 → 고용·주주 → 투자 */}
      <StartupGrowthCards
        growth={readGrowth(record)}
        startupId={record.id}
        shareholders={readShareholderHistory(record)}
      />

      {/* 미디어(언론기사·영상 등): URL + OG 메타데이터. 편집·URL 첨부는 통합 수정에서. */}
      <StartupMediaCard media={readMedia(record)} />
    </section>
  )
}
