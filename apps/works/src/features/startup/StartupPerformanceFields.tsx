import { PanelCard } from '@ynarcher/ui'
import { SectionHeading } from '@/components/SectionHeading'
import {
  StartupCustomerFields,
  StartupEmployeeFields,
  StartupFinanceFields,
  StartupInvestmentFields,
  StartupRevenueFields,
  StartupTimelineFields,
  StartupTractionFields,
} from '@/features/startup/StartupGrowthFields'
import { StartupShareholderFields } from '@/features/startup/StartupShareholderFields'
import { StartupMediaFields } from '@/features/startup/StartupMediaFields'
import type { BusinessStatusEntry, GrowthMetrics } from '@/features/startup/startupGrowth'
import type { ShareholderSnapshot } from '@/features/startup/startupShareholders'
import type { MediaItem } from '@/features/startup/startupMedia'

interface Props {
  growth: GrowthMetrics
  setGrowth: (g: GrowthMetrics) => void
  businessStatus: BusinessStatusEntry[]
  setBusinessStatus: (b: BusinessStatusEntry[]) => void
  shareholders: ShareholderSnapshot[]
  setShareholders: (s: ShareholderSnapshot[]) => void
  media: MediaItem[]
  setMedia: (m: MediaItem[]) => void
}

/**
 * 실적 밴드 입력(조회의 `StartupPerformanceSection`과 짝).
 *
 * 카드 순서는 조회와 같고, **폭은 그 카드가 받는 입력이 정한다**.
 *   · 연도·주주를 **세로로 견주는 표**(매출·재무·고용·주주)는 두 칸을 다 받는다 —
 *     절반 폭에서는 금액 칸이 여덟 자를 담지 못하고, 열이 어긋나면 작년 값과 올해 값을
 *     맞춰 볼 수 없다.
 *   · **한 항목씩 채우는 상자**(핵심 지표·주요 고객)는 절반이다.
 * 조회에서 투자 현황이 열 다섯 개 때문에 전폭을 받는 것과 같은 규칙이고, 입력이 값보다 폭을
 * 더 먹기 때문에 그 규칙에 걸리는 카드가 조회보다 많다.
 *
 * 한때 이 일곱 묶음이 `실적 지표` 카드 한 장 안에 소제목으로 들어 있었다. 조회가 카드 일곱
 * 장으로 세우는 것을 편집이 한 장으로 받으면, 방금 적은 값이 어느 카드로 가는지 화면이
 * 답하지 못한다 — 카드가 곧 묶음의 단위라는 규칙은 조회와 편집 양쪽에 같이 적용된다.
 */
export function StartupPerformanceFields({
  growth,
  setGrowth,
  businessStatus,
  setBusinessStatus,
  shareholders,
  setShareholders,
  media,
  setMedia,
}: Props) {
  return (
    <>
      <SectionHeading title="실적" />
      {/* **카드를 1열로 쌓는다**(2026-09-09 사용자 지정). 조회 화면은 매출과 재무를 나란히
          두어 견주게 하지만(그 비교가 그 화면의 목적이다), 여기는 **적는 자리**다. 절반 폭에서는
          한 항목의 칸들이 두세 줄로 접혀 어느 칸이 어느 줄에 있는지가 카드마다 달라지고, 그때
          같은 표를 두 번째로 채우는 손이 자리를 기억하지 못한다. 전폭이면 한 항목이 한 줄에
          서고 접히는 자리가 고정된다 — 조회와 편집의 **카드 단위·순서·이름**은 그대로이므로
          방금 적은 값이 어느 카드로 가는지는 여전히 화면이 답한다. */}
      <div className="space-y-4">
        {/* 연혁: 아래 표들의 맥락이라 조회와 같이 맨 앞·전폭. */}
        <PanelCard title="연혁">
          <StartupTimelineFields rows={businessStatus} setRows={setBusinessStatus} />
        </PanelCard>

        <PanelCard title="핵심 지표">
          <StartupTractionFields
            rows={growth.traction}
            setRows={(traction) => setGrowth({ ...growth, traction })}
          />
        </PanelCard>

        <PanelCard title="주요 고객·레퍼런스">
          <StartupCustomerFields
            rows={growth.customers}
            setRows={(customers) => setGrowth({ ...growth, customers })}
          />
        </PanelCard>

        <PanelCard title="매출">
          <StartupRevenueFields rows={growth.revenue} setRows={(revenue) => setGrowth({ ...growth, revenue })} />
        </PanelCard>

        <PanelCard title="재무">
          <StartupFinanceFields rows={growth.finance} setRows={(finance) => setGrowth({ ...growth, finance })} />
        </PanelCard>

        <PanelCard title="고용">
          <StartupEmployeeFields
            rows={growth.employee}
            setRows={(employee) => setGrowth({ ...growth, employee })}
          />
        </PanelCard>

        {/* 주주 구성: 라운드마다 다시 재는 값이라 실적 밴드에 선다. */}
        <PanelCard title="주주 구성">
          <StartupShareholderFields history={shareholders} setHistory={setShareholders} />
        </PanelCard>

        <PanelCard title="투자">
          <StartupInvestmentFields
            rows={growth.investment}
            setRows={(investment) => setGrowth({ ...growth, investment })}
          />
        </PanelCard>

        {/* 미디어(언론기사·영상 등): URL 첨부 시 메타데이터 자동 로드. 노출도 기간의 사건이라
            자기 구분선을 갖지 않고 실적 밴드 끝에 선다. */}
        <PanelCard title="미디어">
          <StartupMediaFields media={media} setMedia={setMedia} />
        </PanelCard>
      </div>
    </>
  )
}
