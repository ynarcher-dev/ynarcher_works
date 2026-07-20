import { Modal, Spinner, Tooltip } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EntityRow } from '@/features/networks/hooks'
import { CategoryBarList } from '@/features/networks/dashboard/CategoryBarList'
import { DashboardCard } from '@/features/networks/dashboard/DashboardCard'
import { CategoryColumnChart } from '@/features/networks/dashboard/CategoryColumnChart'
import {
  useStartupDashboardRows,
  useStartupSummary,
} from '@/features/startup/dashboard/startupDashboardHooks'
import {
  countAgeBuckets,
  countByColumn,
  countIndustries,
  roundDistribution,
} from '@/features/startup/dashboard/startupDashboardCompute'
import {
  StatusPlaceholderGrid,
  StatusTileGrid,
  type StatTile,
} from '@/features/networks/dashboard/StatusTileGrid'
import { RecentStartupsFeed } from '@/features/startup/dashboard/RecentStartupsFeed'

type CardKey = 'industry' | 'location' | 'age' | 'round' | 'recent'

interface CardDef {
  key: CardKey
  title: string
  subtitle?: string
  /** 파이처럼 전체가 이미 보이는 카드는 false로 전체보기 버튼을 숨긴다(기본 true). */
  expandable?: boolean
  render: (inModal: boolean) => ReactNode
}

/**
 * STARTUP 대시보드: 일반현황(총·투자·보육·발굴·기타) + 투자기업 현황(지표 미정, 플레이스홀더)
 * + 산업/소재지/업력/라운드 분포 2×2 + 세로로 긴 최근 등록 기업 카드 + 확대 모달. 원장 rows 단일 조회에서 파생한다.
 */
export function StartupDashboardTab() {
  const navigate = useNavigate()
  const { data: rows, isLoading } = useStartupDashboardRows()
  const { data: summary, isLoading: summaryLoading } = useStartupSummary()
  const [expanded, setExpanded] = useState<CardKey | null>(null)

  const r = useMemo(() => (rows ?? []) as EntityRow[], [rows])
  // 분포·랭킹 카드는 투자기업(포트폴리오)만 집계한다. 최근 등록 기업(recent)만 전 구분을 대상으로 둔다.
  const invested = useMemo(() => r.filter((x) => x.management_status === 'invested'), [r])
  const industry = useMemo(() => countIndustries(invested), [invested])
  const location = useMemo(() => countByColumn(invested, 'location'), [invested])
  const age = useMemo(() => countAgeBuckets(invested), [invested])
  const round = useMemo(() => roundDistribution(invested), [invested])

  // 일반현황 5타일(총기업·투자·보육·발굴·기타). summary는 key(total/invested/incubated/discovered/etc)로 조회한다.
  const generalTiles = useMemo<StatTile[]>(() => {
    if (!summary) return []
    const by = (key: string) => summary.find((s) => s.key === key)
    const tile = (key: string, label: string, tab?: string): StatTile => {
      const item = by(key)
      return {
        key,
        label,
        value: (item?.total ?? 0).toLocaleString(),
        delta: item?.delta,
        onClick: tab ? () => navigate(`/startup?tab=${tab}`) : undefined,
      }
    }
    return [
      { key: 'total', label: '총기업', value: (by('total')?.total ?? 0).toLocaleString(), delta: by('total')?.delta, emphasis: true },
      tile('invested', '투자기업', 'invested'),
      tile('incubated', '보육기업', 'incubated'),
      tile('discovered', '발굴기업', 'discovered'),
      tile('etc', '기타기업', 'etc'),
    ]
  }, [summary, navigate])

  const openStartup = (id: string) => navigate(`/startup/discovered/${id}`)
  const spinnerBox = <div className="flex h-40 items-center justify-center"><Spinner /></div>
  const scrollWrap = (node: ReactNode) => <div className="max-h-[60vh] overflow-y-auto pr-1">{node}</div>
  // 카드: 상위 N개를 세로 막대로(스크롤 없음). 모달(전체보기): 전체를 기존 가로 막대 리스트로 펼친다.
  const colCard = (data: { label: string; count: number }[], limit?: number) => (
    <CategoryColumnChart data={data} limit={limit} />
  )
  const colModal = (data: { label: string; count: number }[]) =>
    scrollWrap(<CategoryBarList data={data} colorful />)

  // 분포 그래프(세로 막대, 상위 8개 내림차순) 2×2 블록. 우측 최근 등록 기업 카드는 이 블록 높이에 맞춰 세로로 늘린다.
  const distributionCards: CardDef[] = [
    {
      key: 'industry',
      title: '투자기업 산업별 현황',
      subtitle: '산업 태그별 기업 수(다중 태그 중복 집계, 미기재는 미지정)',
      render: (m) => (m ? colModal(industry) : colCard(industry, 8)),
    },
    {
      key: 'location',
      title: '투자기업 소재지별 현황',
      subtitle: '시·도 소재지별 분포(미기재는 미지정)',
      render: (m) => (m ? colModal(location) : colCard(location, 8)),
    },
    {
      key: 'age',
      title: '투자기업 업력 분포',
      subtitle: '설립 후 경과 연차 구간별 기업 수(설립일 미상은 미상)',
      render: (m) => (m ? colModal(age) : colCard(age)),
    },
    {
      key: 'round',
      title: '투자기업 라운드 분포',
      subtitle: '투자 건의 라운드별 건수(미기재는 미지정)',
      render: (m) => (m ? colModal(round) : colCard(round, 8)),
    },
  ]

  const recentCard: CardDef = {
    key: 'recent',
    title: '최근 등록 기업',
    subtitle: '주간(월~일) 신규 등록 기업 — ‹ ›로 주 이동',
    render: () => <RecentStartupsFeed rows={r} onOpen={(x) => openStartup(x.id)} />,
  }

  const activeCard = [...distributionCards, recentCard].find((c) => c.key === expanded)

  if (isLoading) return spinnerBox

  const renderCard = (c: CardDef) => (
    <DashboardCard
      key={c.key}
      title={c.title}
      subtitle={c.subtitle}
      bodyH="h-[10.5rem]"
      onExpand={() => setExpanded(c.key)}
    >
      {c.render(false)}
    </DashboardCard>
  )

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="text-body font-semibold text-gray-800">일반현황</h3>
          <Tooltip content="전체 보유 기업을 구분(투자·보육·발굴·기타)별로 집계했습니다. 타일 클릭 시 해당 목록으로 이동합니다." />
        </div>
        {summaryLoading ? (
          <div className="flex h-24 items-center justify-center"><Spinner /></div>
        ) : (
          <StatusTileGrid tiles={generalTiles} />
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-1">
          <h3 className="text-body font-semibold text-gray-800">투자기업 현황</h3>
          <Tooltip content="투자 포트폴리오 핵심 지표 영역입니다(지표 정의 예정)." />
        </div>
        <StatusPlaceholderGrid count={5} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 좌측 2/3: 분포 그래프 2×2(고정 높이). 우측 최근 카드는 이 블록 높이에 맞춰 늘어난다. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {distributionCards.map(renderCard)}
        </div>
        {/* 우측 1/3: 최근 등록 기업 — 좌측 블록 높이에 맞춰 세로로 길게(fill) */}
        <DashboardCard
          title={recentCard.title}
          subtitle={recentCard.subtitle}
          fill
          className="lg:col-span-1"
          onExpand={() => setExpanded(recentCard.key)}
        >
          {recentCard.render(false)}
        </DashboardCard>
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
