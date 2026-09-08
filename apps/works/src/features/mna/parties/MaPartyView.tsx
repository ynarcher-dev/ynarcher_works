import { MaPartySummary } from '@/features/mna/parties/MaPartySummary'
import type { MaPartyConfig, MaPartyRow } from '@/features/mna/parties/config'
import { useMaPartyContributions } from '@/features/mna/parties/hooks'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'

/**
 * 조회 뷰 — 좌측 2/3에 본문, 우측 1/3에 곁다리 패널 넷.
 *
 * 배치는 NETWORKS·STARTUP 상세와 같다. 우측 넷이 답하는 것은 레코드의 값이 아니라 그 레코드를
 * 둘러싼 것들(붙은 자료·다룬 회의·누가 고쳤나·무슨 말이 오갔나)이라, 원장이 달라도 같은 자리에
 * 같은 순서로 서야 화면을 옮겨도 손이 같은 곳을 찾는다.
 *
 * 좌측 본문은 `MaPartySummary`가 갖는다(2026-09-08) — M&A 프로젝트 상세의 SELLER·BUYER 탭이
 * 같은 내용을 세우게 되면서 떼어 냈다. 여기 남는 것은 **배치**뿐이다.
 */
export function MaPartyView({
  config,
  record,
}: {
  config: MaPartyConfig
  record: MaPartyRow
}) {
  const { data: contributions } = useMaPartyContributions(config, record.id)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <MaPartySummary config={config} record={record} />
      </div>

      {/* 우측(1/3): 자료 관리 → 관련 회의록 → 변동 이력 → 코멘트. */}
      <div className="space-y-4 lg:col-span-1">
        {/* 조회 화면의 자료는 읽기 전용이다 — 값을 바꾸는 입구는 '수정' 하나다. */}
        <MaterialPanel targetType={config.targetType} targetId={record.id} readOnly />
        <RelatedMinutesPanel
          targetType={config.targetType as MinuteLinkTargetType}
          targetId={record.id}
        />
        <ChangeHistoryPanel contributions={contributions} />
        <FeedbackPanel targetType={config.targetType} targetId={record.id} />
      </div>
    </div>
  )
}
