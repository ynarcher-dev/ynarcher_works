import { InfoRows, PanelCard } from '@ynarcher/ui'
import { rows } from '@/features/startup/startupCardRows'
import { EmptyLine } from '@/features/startup/StartupCardEmpty'
import type { BusinessProfile } from '@/features/startup/startupProfile'

/**
 * 비즈니스 카드(역량 밴드 첫 카드). 읽기 전용 표시.
 *
 * 담는 것은 **바깥이 아니라 자기 구조**다 — 시장 규모·경쟁사 같은 외부 환경은 이 원장이
 * 답할 값이 아니고(기업이 제시한 숫자를 원장에 적으면 출처 없는 사실이 된다), 여기 서는
 * 수익 구조·판매 채널·생산 방식은 전부 그 기업이 스스로 답할 수 있는 자기 사실이다.
 *
 * 한때 팀 역량과 한 카드에 있었고 카드 안에서 소제목 둘로 갈렸다(2026-09-06 분리). 카드 하나에
 * 소제목 두 개를 두면 층이 세 겹(카드 제목 → 소제목 → 라벨)이 되는데, 두 묶음은 실제로 서로
 * 참조하지 않는 별개 주제라 그 중간 층이 하는 일이 없었다 — 카드가 곧 묶음의 단위다.
 * 편집은 상단 '수정'(통합 수정 폼)에서 기본 데이터와 함께 관리한다.
 */
export function StartupBusinessCard({ business }: { business: BusinessProfile }) {
  // 한 줄 소개(oneLiner)는 기본 데이터 헤더로 이동해 이 카드에서는 표시하지 않는다.
  const isEmpty =
    !business.businessModel &&
    !business.targetMarket &&
    !business.revenueModel &&
    !business.salesChannel &&
    !business.supplyMode

  return (
    <PanelCard title="비즈니스">
      {isEmpty ? (
        <EmptyLine noun="비즈니스" />
      ) : (
        <InfoRows
          items={rows([
            { label: '비즈니스 모델', value: business.businessModel, multiline: true },
            { label: '타겟 고객', value: business.targetMarket, multiline: true },
            // 수익 구조는 비즈니스 모델과 다른 질문이다 — 무엇을 파는가와 어떻게 버는가.
            { label: '수익 구조', value: business.revenueModel, multiline: true },
            { label: '판매 채널', value: business.salesChannel, multiline: true },
            { label: '생산 방식', value: business.supplyMode, multiline: true },
          ])}
        />
      )}
    </PanelCard>
  )
}
