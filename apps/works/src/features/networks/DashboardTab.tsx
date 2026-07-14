import { Modal, Spinner } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  useExpertiseDistribution,
  useExpertRanking,
  useNetworksSummary,
  useRegionDistribution,
  type ExpertRankRow,
  type StatusItem,
} from '@/features/networks/dashboardHooks'
import { usesDetailPage } from '@/features/networks/config'

/**
 * 가로 막대 색. 분야별 현황은 단일 지표(분야별 보유 인원)이므로 다색 팔레트 대신
 * 차트 규칙서(7)의 chart.1(단독 데이터=Blue) 단색으로 통일하고,
 * '기타(미등록)'만 gray로 de-emphasize 한다.
 */
const BAR_COLOR = '#2563EB'
const BAR_OTHER_COLOR = '#9CA3AF'

/** 파이(권역 등 범주형 다계열) 팔레트. 차트 규칙서(7) chart.1~8, 미지정은 gray로 고정. */
const PIE_PALETTE = [
  '#2563EB', '#16A34A', '#D97706', '#7C3AED',
  '#0D9488', '#DB2777', '#4F46E5', '#515151',
]

/** 도넛 파이 차트(범주형 분포). 부모 높이를 꽉 채워 중앙 정렬. 규모 0 항목은 제외, 미지정은 gray로 마감. */
function CategoryPie({ data }: { data: { label: string; count: number }[] }) {
  const slices = data.filter((d) => d.count > 0)
  if (slices.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-caption text-gray-400">표시할 데이터가 없습니다.</p>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="82%"
          paddingAngle={1.5}
          stroke="#FFFFFF"
          strokeWidth={2}
          label={({ name, value }) => `${name} ${Number(value).toLocaleString()}`}
          labelLine={{ stroke: '#D4D4D4' }}
        >
          {slices.map((s, i) => (
            <Cell
              key={s.label}
              fill={s.label.startsWith('미지정') ? BAR_OTHER_COLOR : PIE_PALETTE[i % PIE_PALETTE.length]}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number, n) => [`${v.toLocaleString()}건`, n as string]}
          contentStyle={{
            borderRadius: 6,
            border: '1px solid #E5E5E5',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: 12,
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-caption text-gray-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** 전월 대비 증감 배지. 양수 초록·음수 빨강·0 회색. */
function DeltaLabel({ delta }: { delta: number }) {
  if (delta === 0) {
    return <p className="mt-1 text-caption text-gray-400">전월 대비 &ndash;</p>
  }
  const up = delta > 0
  return (
    <p className="mt-1 flex items-center gap-1 text-caption text-gray-400">
      <span>전월 대비</span>
      <span className={`font-semibold tabular-nums ${up ? 'text-green-600' : 'text-red-600'}`}>
        {up ? '↑' : '↓'}{Math.abs(delta).toLocaleString()}
      </span>
    </p>
  )
}

/** 네트워크 현황: 총보유 + 카테고리별 보유 건수·전월 대비 증감 그리드. */
function NetworkStatus({ items }: { items: StatusItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <div
          key={it.key}
          className={`rounded-radius-md border px-3 py-2.5 ${
            it.emphasis ? 'border-gray-400 bg-gray-50' : 'border-gray-300 bg-white'
          }`}
        >
          <p className="text-caption text-gray-500">{it.label}</p>
          <p className="text-title-md font-bold tabular-nums text-gray-900">
            {it.total.toLocaleString()}
          </p>
          <DeltaLabel delta={it.delta} />
        </div>
      ))}
    </div>
  )
}

/**
 * 가로 막대 리스트. 라벨·값을 막대 위에 얹고 막대는 전체폭으로 그려 여백을 줄인다.
 * 막대 길이는 최댓값 기준(가독성), 표기 값은 실제 건수와 전체 대비 비율이다.
 * `limit` 지정 시 상위 N개만 노출하고 나머지는 '외 N개'로 요약한다(전체는 전체보기 모달에서).
 * 비율·막대 스케일은 잘라내기 전 전체 기준으로 계산해 카드/모달이 일치한다.
 */
function HBarList({ data, limit }: { data: { label: string; count: number }[]; limit?: number }) {
  const all = data.filter((d) => d.count > 0)
  if (all.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-400">표시할 데이터가 없습니다.</p>
  }
  const total = all.reduce((s, d) => s + d.count, 0) || 1
  const max = Math.max(...all.map((d) => d.count))
  const rows = limit ? all.slice(0, limit) : all
  const hidden = all.length - rows.length
  return (
    <ul className="space-y-3">
      {rows.map((d) => {
        const pct = Math.round((d.count / total) * 100)
        const barPct = Math.max(4, Math.round((d.count / max) * 100))
        const isOther = d.label.startsWith('기타') || d.label.startsWith('미지정')
        return (
          <li key={d.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-caption font-medium text-gray-700" title={d.label}>
                {d.label}
              </span>
              <span className="shrink-0 text-caption tabular-nums text-gray-400">
                <span className="font-semibold text-gray-800">{d.count.toLocaleString()}</span>
                <span className="ml-1">{pct}%</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${barPct}%`, backgroundColor: isOther ? BAR_OTHER_COLOR : BAR_COLOR }}
              />
            </div>
          </li>
        )
      })}
      {hidden > 0 && (
        <li className="pt-0.5 text-caption text-gray-400">외 {hidden}개 분야 · 전체보기</li>
      )}
    </ul>
  )
}

/** 평가랭킹 기준 탭. 활동 횟수 / 만족도 별점. */
const RANK_TABS = [
  { key: 'activity', label: '활동 횟수' },
  { key: 'satisfaction', label: '만족도' },
] as const

type RankMetric = (typeof RANK_TABS)[number]['key']

/**
 * 전문가 평가랭킹 패널: 활동 횟수/만족도 탭 + 순위 표(이름·구분·분야·활동건·만족도).
 * 활동건·만족도는 실집계 연동 전이라 '-'로 표기하며, 선택 탭 기준 컬럼을 강조한다.
 */
function ExpertRankingPanel({
  rows,
  onOpen,
  limit,
}: {
  rows: ExpertRankRow[]
  onOpen: (r: ExpertRankRow) => void
  limit?: number
}) {
  const [metric, setMetric] = useState<RankMetric>('activity')
  const sorted = [...rows].sort((a, b) => {
    const av = metric === 'activity' ? a.activity : a.satisfaction
    const bv = metric === 'activity' ? b.activity : b.satisfaction
    return (bv ?? -1) - (av ?? -1)
  })
  const shown = limit ? sorted.slice(0, limit) : sorted
  return (
    <div className="space-y-2">
      <div className="sticky top-0 z-10 flex gap-1 bg-white pb-1">
        {RANK_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMetric(t.key)}
            className={`rounded-radius-sm px-2.5 py-1 text-caption font-medium ${
              metric === t.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-caption text-gray-400">표시할 전문가가 없습니다.</p>
      ) : (
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-400">
              <th className="w-6 py-1.5 font-medium">#</th>
              <th className="py-1.5 font-medium">이름</th>
              <th className="py-1.5 font-medium">구분</th>
              <th className="py-1.5 font-medium">분야</th>
              <th className={`w-14 py-1.5 text-right font-medium ${metric === 'activity' ? 'text-gray-700' : ''}`}>
                활동건
              </th>
              <th className={`w-12 py-1.5 text-right font-medium ${metric === 'satisfaction' ? 'text-gray-700' : ''}`}>
                만족도
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                key={`${r.entity}:${r.id}`}
                onClick={() => onOpen(r)}
                className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="py-1.5 tabular-nums text-gray-400">{i + 1}</td>
                <td className="py-1.5 font-medium text-gray-900">
                  <span className="block max-w-[6rem] truncate" title={r.name}>{r.name}</span>
                </td>
                <td className="py-1.5 text-gray-600">{r.category || '-'}</td>
                <td className="py-1.5 text-gray-500">
                  <span className="block max-w-[8rem] truncate" title={r.fields.join(', ')}>
                    {r.fields[0] ?? '-'}
                    {r.fields.length > 1 ? ` 외 ${r.fields.length - 1}` : ''}
                  </span>
                </td>
                <td className={`py-1.5 text-right tabular-nums ${metric === 'activity' ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                  {r.activity ?? '-'}
                </td>
                <td className={`py-1.5 text-right tabular-nums ${metric === 'satisfaction' ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                  {r.satisfaction != null ? r.satisfaction.toFixed(1) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * 대시보드 섹션: 제목·부제·본문 + 하단 '전체보기' 버튼(클릭 시 확대 모달).
 * 네트워크 현황과 동일하게 테두리 카드로 감싸지 않고 배경 위 섹션으로 렌더한다.
 */
function DashCard({
  title,
  subtitle,
  onExpand,
  children,
}: {
  title: string
  subtitle?: string
  /** 지정 시 하단에 '전체보기' 버튼을 노출(클릭 시 확대 모달). 미지정이면 버튼 없음. */
  onExpand?: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-body font-semibold text-gray-800">{title}</h3>
        {subtitle && (
          <p className="truncate text-caption text-gray-400" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex h-[23rem] flex-col rounded-radius-md border border-gray-300 bg-white p-4">
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">{children}</div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="mt-3 w-full rounded-radius-sm border border-gray-200 py-1.5 text-caption font-medium text-gray-600 hover:bg-gray-50"
          >
            전체보기
          </button>
        )}
      </div>
    </section>
  )
}

/** NETWORKS 대시보드: 규모 KPI · 분야별 현황 · 최근 업로드 · 확대 모달. */
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
  const [expanded, setExpanded] = useState<'expertise' | 'ranking' | 'card3' | null>(null)

  const spinnerBox = <div className="flex h-40 items-center justify-center"><Spinner /></div>

  // 카드 3종을 한 곳에 정의해 카드·확대 모달에서 동일 본문을 재사용한다.
  const cards: {
    key: 'expertise' | 'ranking' | 'card3'
    title: string
    subtitle?: string
    /** 파이처럼 전체가 이미 보이는 카드는 false로 전체보기 버튼을 숨긴다(기본 true). */
    expandable?: boolean
    render: (inModal: boolean) => ReactNode
  }[] = [
    {
      key: 'expertise',
      title: '분야별 현황',
      subtitle: 'BAN · EXP · 전문가 · 투자사의 관리 분야 태그별 보유 인원(중복 집계, 미등록 값은 기타)',
      render: (inModal) =>
        expertiseLoading ? (
          spinnerBox
        ) : inModal ? (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <HBarList data={expertise ?? []} />
          </div>
        ) : (
          <HBarList data={expertise ?? []} limit={6} />
        ),
    },
    {
      key: 'ranking',
      title: '전문가 평가랭킹',
      subtitle: '활동 횟수·만족도 기준(상세 데이터 연동 예정)',
      render: (inModal) =>
        rankingLoading ? (
          spinnerBox
        ) : inModal ? (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ExpertRankingPanel rows={ranking ?? []} onOpen={openEntity} />
          </div>
        ) : (
          <ExpertRankingPanel rows={ranking ?? []} onOpen={openEntity} limit={6} />
        ),
    },
    {
      key: 'card3',
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
      <div className="space-y-2">
        <h3 className="text-body font-semibold text-gray-800">네트워크 현황</h3>
        {summaryLoading ? (
          <div className="flex h-24 items-center justify-center"><Spinner /></div>
        ) : (
          <NetworkStatus items={summary?.items ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <DashCard
            key={c.key}
            title={c.title}
            subtitle={c.subtitle}
            onExpand={c.expandable === false ? undefined : () => setExpanded(c.key)}
          >
            {c.render(false)}
          </DashCard>
        ))}
      </div>

      <Modal
        open={expanded !== null}
        onClose={() => setExpanded(null)}
        title={activeCard?.title}
        size="lg"
      >
        {activeCard?.subtitle && (
          <p className="mb-3 text-caption text-gray-400">{activeCard.subtitle}</p>
        )}
        {activeCard?.render(true)}
      </Modal>
    </div>
  )
}
