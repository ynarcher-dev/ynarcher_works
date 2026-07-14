import { Modal, Spinner } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useExpertiseDistribution,
  useExpertRanking,
  useNetworksSummary,
  useRegionDistribution,
  type ExpertRankRow,
} from '@/features/networks/dashboardHooks'
import { usesDetailPage } from '@/features/networks/config'
import { CategoryBarList } from '@/features/networks/dashboard/CategoryBarList'
import { CategoryPie } from '@/features/networks/dashboard/CategoryPie'
import { DashboardCard } from '@/features/networks/dashboard/DashboardCard'
import { ExpertRankingPanel } from '@/features/networks/dashboard/ExpertRankingPanel'
import { NetworkStatusGrid } from '@/features/networks/dashboard/NetworkStatusGrid'

type CardKey = 'expertise' | 'ranking' | 'region'

interface DashboardCardDef {
  key: CardKey
  title: string
  subtitle?: string
  /** 파이처럼 전체가 이미 보이는 카드는 false로 전체보기 버튼을 숨긴다(기본 true). */
  expandable?: boolean
  render: (inModal: boolean) => ReactNode
}

/** NETWORKS 대시보드: 네트워크 현황 + 분야별/전문가 평가랭킹/권역별 카드 + 확대 모달. */
export function DashboardTab() {
  const navigate = useNavigate()
  const { data: summary, isLoading: summaryLoading } = useNetworksSummary()
  const { data: expertise, isLoading: expertiseLoading } = useExpertiseDistribution()
  const { data: region, isLoading: regionLoading } = useRegionDistribution()
  const { data: ranking, isLoading: rankingLoading } = useExpertRanking()

  // 상세페이지가 있는 엔티티(프로필 4종)는 행 클릭 시 상세로 진입한다.
  const openEntity = (r: ExpertRankRow) => {
    if (usesDetailPage(r.entity)) navigate(`/networks/${r.entity}/${r.id}`)
  }

  // 확대 모달로 펼칠 카드 키(null=닫힘).
  const [expanded, setExpanded] = useState<CardKey | null>(null)

  const spinnerBox = <div className="flex h-40 items-center justify-center"><Spinner /></div>
  const scrollWrap = (node: ReactNode) => <div className="max-h-[60vh] overflow-y-auto pr-1">{node}</div>

  const cards: DashboardCardDef[] = [
    {
      key: 'expertise',
      title: '분야별 현황',
      subtitle: 'BAN · EXP · 전문가 · 투자사의 관리 분야 태그별 보유 인원(중복 집계, 미등록 값은 기타)',
      render: (inModal) =>
        expertiseLoading
          ? spinnerBox
          : inModal
            ? scrollWrap(<CategoryBarList data={expertise ?? []} />)
            : <CategoryBarList data={expertise ?? []} limit={6} />,
    },
    {
      key: 'ranking',
      title: '전문가 평가랭킹',
      subtitle: '활동 횟수·만족도 기준(상세 데이터 연동 예정)',
      render: (inModal) =>
        rankingLoading
          ? spinnerBox
          : inModal
            ? scrollWrap(<ExpertRankingPanel rows={ranking ?? []} onOpen={openEntity} />)
            : <ExpertRankingPanel rows={ranking ?? []} onOpen={openEntity} limit={6} />,
    },
    {
      key: 'region',
      title: '권역별 현황',
      subtitle: '글로벌 네트워크의 권역별 DB 보유 현황(미지정 별도)',
      expandable: false,
      render: () =>
        regionLoading ? (
          spinnerBox
        ) : (
          <div className="h-full min-h-[16rem]">
            <CategoryPie data={region ?? []} />
          </div>
        ),
    },
  ]

  const activeCard = cards.find((c) => c.key === expanded)

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h3 className="text-body font-semibold text-gray-800">네트워크 현황</h3>
        {summaryLoading ? (
          <div className="flex h-24 items-center justify-center"><Spinner /></div>
        ) : (
          <NetworkStatusGrid items={summary?.items ?? []} />
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <DashboardCard
            key={c.key}
            title={c.title}
            subtitle={c.subtitle}
            onExpand={c.expandable === false ? undefined : () => setExpanded(c.key)}
          >
            {c.render(false)}
          </DashboardCard>
        ))}
      </div>

      <Modal open={expanded !== null} onClose={() => setExpanded(null)} title={activeCard?.title} size="lg">
        {activeCard?.subtitle && (
          <p className="mb-3 text-caption text-gray-400">{activeCard.subtitle}</p>
        )}
        {activeCard?.render(true)}
      </Modal>
    </div>
  )
}
