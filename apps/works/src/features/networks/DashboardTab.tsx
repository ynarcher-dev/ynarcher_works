import { Modal, Spinner, Tooltip, type BadgeTone } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useExpertiseDistribution,
  useExpertRanking,
  useNetworksSummary,
  useRecentNetworks,
  useRegionDistribution,
  type ExpertRankRow,
} from '@/features/networks/dashboardHooks'
import { ENTITIES, usesDetailPage, type EntityKey } from '@/features/networks/config'
import { CategoryBarList } from '@/features/networks/dashboard/CategoryBarList'
import { CategoryColumnChart } from '@/features/networks/dashboard/CategoryColumnChart'
import { DashboardCard } from '@/features/networks/dashboard/DashboardCard'
import { ExpertRankingPanel } from '@/features/networks/dashboard/ExpertRankingPanel'
import { RecentRegisteredFeed, type RecentItem } from '@/features/networks/dashboard/RecentRegisteredFeed'
import { StatusTileGrid, type StatTile } from '@/features/networks/dashboard/StatusTileGrid'

type CardKey = 'expertise' | 'ranking' | 'region' | 'recent'

interface DashboardCardDef {
  key: CardKey
  title: string
  subtitle?: string
  render: (inModal: boolean) => ReactNode
}

/** 구분(엔티티)별 배지 톤 — 최근 등록 네트워크 피드에서 구분을 색으로 구분한다. */
const ENTITY_TONE: Record<string, BadgeTone> = {
  van: 'info',
  exp: 'info',
  experts: 'success',
  investors: 'warning',
  corporates: 'neutral',
  institutions: 'neutral',
  universities: 'neutral',
  etc: 'neutral',
  others: 'danger',
}

/**
 * NETWORKS 대시보드: 네트워크 현황 + 좌측(분야별→권역별 세로 배치) · 가운데(네트워크 평가랭킹, 세로로 김)
 * · 우측(최근 등록 네트워크, 주간 피드) 3열 + 확대 모달. 최근 등록 네트워크는 STARTUP 최근 등록 기업과
 * 동일 컴포넌트(RecentRegisteredFeed)를 공유한다.
 */
export function DashboardTab() {
  const navigate = useNavigate()
  const { data: summary, isLoading: summaryLoading } = useNetworksSummary()
  const { data: expertise, isLoading: expertiseLoading } = useExpertiseDistribution()
  const { data: region, isLoading: regionLoading } = useRegionDistribution()
  const { data: ranking, isLoading: rankingLoading } = useExpertRanking()
  const { data: recent, isLoading: recentLoading } = useRecentNetworks()

  // 상세페이지가 있는 엔티티(디렉토리 9종)는 행 클릭 시 상세로 진입한다.
  const openEntity = (r: ExpertRankRow) => {
    if (usesDetailPage(r.entity)) navigate(`/networks/${r.entity}/${r.id}`)
  }
  // 최근 등록 네트워크 행 클릭 → 소속 엔티티 상세로 진입(id로 엔티티 역참조).
  const recentEntityById = useMemo(
    () => new Map((recent ?? []).map((r) => [r.id, r.entity])),
    [recent],
  )
  const openRecent = (id: string) => {
    const entity = recentEntityById.get(id)
    if (entity && usesDetailPage(entity)) navigate(`/networks/${entity}/${id}`)
  }
  // 최근 등록 네트워크 → 공용 주간 피드 계약으로 매핑(이름 + 구분 배지 + 등록일).
  const recentItems = useMemo<RecentItem[]>(
    () =>
      (recent ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        badge: {
          label: ENTITIES[r.entity as EntityKey]?.label ?? '기타',
          tone: ENTITY_TONE[r.entity] ?? 'neutral',
        },
      })),
    [recent],
  )

  // 확대 모달로 펼칠 카드 키(null=닫힘).
  const [expanded, setExpanded] = useState<CardKey | null>(null)

  const spinnerBox = <div className="flex h-40 items-center justify-center"><Spinner /></div>
  const scrollWrap = (node: ReactNode) => <div className="max-h-[60vh] overflow-y-auto pr-1">{node}</div>
  // 카드: 상위 N개를 세로 막대로(스크롤 없음). 모달(전체보기): 전체를 다채색 가로 막대로 펼친다. STARTUP과 공용 규칙.
  const colCard = (data: { label: string; count: number }[], limit?: number) => (
    <CategoryColumnChart data={data} limit={limit} />
  )
  const colModal = (data: { label: string; count: number }[]) =>
    scrollWrap(<CategoryBarList data={data} colorful />)

  const expertiseCard: DashboardCardDef = {
    key: 'expertise',
    title: '분야별 현황',
    subtitle: 'BAN · EXP · 전문가 · 투자사의 관리 분야 태그별 보유 인원(중복 집계, 미등록 값은 기타)',
    render: (inModal) =>
      expertiseLoading ? spinnerBox : inModal ? colModal(expertise ?? []) : colCard(expertise ?? [], 8),
  }
  const regionCard: DashboardCardDef = {
    key: 'region',
    title: '권역별 현황',
    subtitle: '글로벌 네트워크의 권역별 DB 보유 현황(미지정 별도)',
    render: (inModal) =>
      regionLoading ? spinnerBox : inModal ? colModal(region ?? []) : colCard(region ?? [], 8),
  }
  const rankingCard: DashboardCardDef = {
    key: 'ranking',
    title: '네트워크 평가랭킹',
    subtitle: 'BAN · EXP · 전문가 · 투자사 통합, 활동 횟수·만족도 기준(상세 데이터 연동 예정)',
    render: (inModal) =>
      rankingLoading
        ? spinnerBox
        : inModal
          ? scrollWrap(<ExpertRankingPanel rows={ranking ?? []} onOpen={openEntity} />)
          : <ExpertRankingPanel rows={ranking ?? []} onOpen={openEntity} limit={8} />,
  }
  const recentCard: DashboardCardDef = {
    key: 'recent',
    title: '최근 등록 네트워크',
    subtitle: '주간(월~일) 신규 등록 네트워크 — ‹ ›로 주 이동',
    render: () =>
      recentLoading ? (
        spinnerBox
      ) : (
        <RecentRegisteredFeed items={recentItems} onOpen={openRecent} emptyLabel="등록된 네트워크가 없습니다." />
      ),
  }

  const allCards = [expertiseCard, regionCard, rankingCard, recentCard]
  const activeCard = allCards.find((c) => c.key === expanded)

  // 세로로 긴 카드(평가랭킹·최근 등록). lg에서 절대배치로 셀을 채워 자기 콘텐츠가 행 높이를 밀어올리지
  // 않게 하고(=본질 높이 0), 좌측 열(분야별+권역별) 높이에 정확히 맞춰 늘어나며 내부에서 스크롤한다.
  const tallCard = (c: DashboardCardDef) => (
    <div className="lg:relative">
      <div className="lg:absolute lg:inset-0">
        <DashboardCard title={c.title} subtitle={c.subtitle} fill onExpand={() => setExpanded(c.key)}>
          {c.render(false)}
        </DashboardCard>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="text-body font-semibold text-gray-800">네트워크 현황</h3>
          <Tooltip content="전체 네트워크 DB 보유 현황을 구분(BAN·EXP·전문가·투자자·조직 등)별로 집계했습니다. 타일 클릭 시 해당 목록으로 이동합니다." />
        </div>
        {summaryLoading ? (
          <div className="flex h-24 items-center justify-center"><Spinner /></div>
        ) : (
          <StatusTileGrid
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            tiles={(summary?.items ?? []).map(
              (it): StatTile => ({
                key: it.key,
                label: it.label,
                value: it.total.toLocaleString(),
                delta: it.delta,
                emphasis: it.emphasis,
                onClick: it.emphasis ? undefined : () => navigate(`/networks?tab=${it.key}`),
              }),
            )}
          />
        )}
      </section>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        {/* 좌측: 분야별 현황(위) → 권역별 현황(아래) 세로 배치. 이 열의 높이가 가운데·우측 카드 높이의 기준. */}
        <div className="flex flex-col gap-4">
          {[expertiseCard, regionCard].map((c) => (
            <DashboardCard
              key={c.key}
              title={c.title}
              subtitle={c.subtitle}
              bodyH="h-[10.5rem]"
              onExpand={() => setExpanded(c.key)}
            >
              {c.render(false)}
            </DashboardCard>
          ))}
        </div>

        {/* 가운데: 네트워크 평가랭킹 — 좌측 열 높이에 맞춰 내부 스크롤 */}
        {tallCard(rankingCard)}

        {/* 우측: 최근 등록 네트워크 — 동일 방식으로 좌측 열 높이에 맞춘다(STARTUP 최근 등록 기업과 동일 컴포넌트) */}
        {tallCard(recentCard)}
      </div>

      <Modal
        open={expanded !== null}
        onClose={() => setExpanded(null)}
        title={
          activeCard && (
            <span className="inline-flex items-center gap-1">
              {activeCard.title}
              <Tooltip content={activeCard.subtitle} side="bottom" />
            </span>
          )
        }
        size="lg"
      >
        {activeCard?.render(true)}
      </Modal>
    </div>
  )
}
