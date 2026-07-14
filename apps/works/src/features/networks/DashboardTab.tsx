import { Badge, Modal, Spinner } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  useExpertiseDistribution,
  useNetworksSummary,
  useRecentUploads,
  useRegionDistribution,
  type RecentUpload,
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

/** 도넛 파이 차트(범주형 분포). 규모 0 항목은 제외, 미지정은 gray로 마감. */
function CategoryPie({ data, height }: { data: { label: string; count: number }[]; height: number }) {
  const slices = data.filter((d) => d.count > 0)
  if (slices.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-400">표시할 데이터가 없습니다.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
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

/** 유입 경로 배지(대량 업로드/개별 등록). */
function SourceBadge({ source }: { source: RecentUpload['source'] }) {
  return source === 'bulk_upload' ? (
    <Badge tone="info">대량 업로드</Badge>
  ) : (
    <Badge tone="neutral">개별 등록</Badge>
  )
}

/** 등록일시를 'MM-DD HH:mm'로 축약 표기. */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 컴팩트 최근 업로드 리스트. 스크롤은 부모 컨테이너가 담당한다. 상세페이지 엔티티는 클릭 시 진입. */
function RecentUploadsList({
  rows,
  onOpen,
}: {
  rows: RecentUpload[]
  onOpen: (r: RecentUpload) => void
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-400">최근 업로드된 데이터가 없습니다.</p>
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const clickable = usesDetailPage(r.entity) && r.entity !== 'others'
        return (
          <li
            key={`${r.entity}:${r.id}`}
            onClick={() => onOpen(r)}
            className={`rounded-radius-sm border border-gray-100 px-2.5 py-2 ${
              clickable ? 'cursor-pointer hover:bg-gray-50' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-gray-900" title={r.name}>
                {r.name}
              </span>
              <Badge tone="neutral">{r.entityLabel}</Badge>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-caption text-gray-400">
              <span className="flex min-w-0 items-center gap-1">
                <SourceBadge source={r.source} />
                <span className="truncate">{r.creatorName || '-'}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatDateTime(r.createdAt)}</span>
            </div>
          </li>
        )
      })}
    </ul>
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
  const { data: recent, isLoading: recentLoading } = useRecentUploads(20)

  // 상세페이지가 있는 엔티티(8종)만 행 클릭으로 진입한다(미분류·스타트업 제외).
  const openRow = (r: RecentUpload) => {
    if (usesDetailPage(r.entity) && r.entity !== 'others') {
      navigate(`/networks/${r.entity}/${r.id}`)
    }
  }

  // 확대 모달로 펼칠 카드 키(null=닫힘).
  const [expanded, setExpanded] = useState<'expertise' | 'recent' | 'card3' | null>(null)

  const spinnerBox = <div className="flex h-40 items-center justify-center"><Spinner /></div>

  // 카드 3종을 한 곳에 정의해 카드·확대 모달에서 동일 본문을 재사용한다.
  const cards: {
    key: 'expertise' | 'recent' | 'card3'
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
      key: 'recent',
      title: '최근 업로드 데이터',
      subtitle: '8종 통합 최신순(상세 클릭 이동)',
      render: (inModal) =>
        recentLoading ? (
          spinnerBox
        ) : inModal ? (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <RecentUploadsList rows={recent ?? []} onOpen={openRow} />
          </div>
        ) : (
          <RecentUploadsList rows={recent ?? []} onOpen={openRow} />
        ),
    },
    {
      key: 'card3',
      title: '권역별 현황',
      subtitle: '글로벌 네트워크의 권역별 DB 보유 현황(미지정 별도)',
      expandable: false,
      render: (inModal) =>
        regionLoading ? spinnerBox : <CategoryPie data={region ?? []} height={inModal ? 380 : 250} />,
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
