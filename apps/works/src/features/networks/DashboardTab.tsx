import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  useNetworksSummary,
  useRecentUploads,
  type RecentUpload,
  type StatusItem,
} from '@/features/networks/dashboardHooks'
import { usesDetailPage } from '@/features/networks/config'

/**
 * 구분별 분포 도넛 팔레트. 차트 규칙서(7)의 chart.1~8 순서를 따르고,
 * 9번째 계열(가장 후순위 카테고리)은 기타 계열용 gray로 마감한다.
 */
const CHART_PALETTE = [
  '#2563EB', '#16A34A', '#D97706', '#7C3AED',
  '#0D9488', '#DB2777', '#4F46E5', '#515151', '#94A3B8',
]

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

/** 구분별 분포 도넛. 규모 0 카테고리는 렌더에서 제외한다. */
function CategoryDonut({ data }: { data: { label: string; count: number }[] }) {
  const slices = data.filter((d) => d.count > 0)
  if (slices.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-400">표시할 데이터가 없습니다.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="label"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
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

/** NETWORKS 대시보드: 규모 KPI · 구분별 분포 · 최근 업로드 리스트. */
export function DashboardTab() {
  const navigate = useNavigate()
  const { data: summary, isLoading: summaryLoading } = useNetworksSummary()
  const { data: recent, isLoading: recentLoading } = useRecentUploads(20)

  const catTotal = (summary?.byCategory ?? []).reduce((s, c) => s + c.count, 0) || 1

  const columns: Column<RecentUpload>[] = [
    { key: 'name', header: '이름/기업명', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'entity', header: '구분', render: (r) => <Badge tone="neutral">{r.entityLabel}</Badge> },
    { key: 'affiliation', header: '소속', render: (r) => r.affiliation || '-' },
    { key: 'creator', header: '등록자', render: (r) => r.creatorName || '-' },
    { key: 'source', header: '유입 경로', render: (r) => <SourceBadge source={r.source} /> },
    {
      key: 'created_at',
      header: '등록일시',
      render: (r) => <span className="tabular-nums text-gray-500">{formatDateTime(r.createdAt)}</span>,
    },
  ]

  // 상세페이지가 있는 엔티티(8종)만 행 클릭으로 진입한다(미분류·스타트업 제외).
  const openRow = (r: RecentUpload) => {
    if (usesDetailPage(r.entity) && r.entity !== 'others') {
      navigate(`/networks/${r.entity}/${r.id}`)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-body font-semibold text-gray-800">네트워크 현황</h3>
        {summaryLoading ? (
          <div className="flex h-24 items-center justify-center"><Spinner /></div>
        ) : (
          <NetworkStatus items={summary?.items ?? []} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-radius-md border border-gray-300 bg-white p-4">
          <h3 className="mb-2 text-body font-semibold text-gray-800">구분별 분포</h3>
          {summaryLoading ? (
            <div className="flex h-[260px] items-center justify-center"><Spinner /></div>
          ) : (
            <CategoryDonut data={summary?.byCategory ?? []} />
          )}
        </div>

        <div className="rounded-radius-md border border-gray-300 bg-white p-4">
          <h3 className="mb-3 text-body font-semibold text-gray-800">구분별 규모</h3>
          <ul className="space-y-2">
            {(summary?.byCategory ?? []).map((c, i) => {
              const pct = Math.round((c.count / catTotal) * 100)
              return (
                <li key={c.key} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-caption text-gray-600">{c.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-caption tabular-nums text-gray-700">
                    {c.count.toLocaleString()} ({pct}%)
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <div className="rounded-radius-md border border-gray-300 bg-white p-4">
        <h3 className="mb-3 text-body font-semibold text-gray-800">최근 업로드 데이터</h3>
        {recentLoading ? (
          <div className="flex h-40 items-center justify-center"><Spinner /></div>
        ) : (
          <DataTable
            columns={columns}
            rows={recent ?? []}
            rowKey={(r) => `${r.entity}:${r.id}`}
            onRowClick={openRow}
            emptyText="최근 업로드된 데이터가 없습니다."
          />
        )}
      </div>
    </div>
  )
}
