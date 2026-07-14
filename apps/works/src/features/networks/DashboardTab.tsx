import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useNetworksSummary, useRecentUploads, type RecentUpload } from '@/features/networks/dashboardHooks'
import { usesDetailPage } from '@/features/networks/config'

/**
 * 구분별 분포 도넛 팔레트. 차트 규칙서(7)의 chart.1~8 순서를 따르고,
 * 9번째 계열(가장 후순위 카테고리)은 기타 계열용 gray로 마감한다.
 */
const CHART_PALETTE = [
  '#2563EB', '#16A34A', '#D97706', '#7C3AED',
  '#0D9488', '#DB2777', '#4F46E5', '#515151', '#94A3B8',
]

/** 규모 요약 KPI 타일. 값 0도 표시하며, to 지정 시 클릭 이동한다. */
interface Tile {
  label: string
  value: number
  hint?: string
  to?: string
}

function KpiTiles({ tiles }: { tiles: Tile[] }) {
  const navigate = useNavigate()
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <button
          key={t.label}
          type="button"
          disabled={!t.to}
          onClick={() => t.to && navigate(t.to)}
          className={`rounded border border-gray-300 bg-white px-4 py-3 text-left ${
            t.to ? 'cursor-pointer hover:border-gray-400' : 'cursor-default'
          }`}
        >
          <p className="text-caption text-gray-500">{t.label}</p>
          <p className="text-title-md font-bold tabular-nums text-gray-900">
            {t.value.toLocaleString()}
          </p>
          {t.hint && <p className="text-caption text-gray-400">{t.hint}</p>}
        </button>
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

  const tiles: Tile[] = [
    { label: '총 보유 네트워크', value: summary?.activeTotal ?? 0, hint: '인물·조직 8종 활성' },
    { label: '이번 달 신규', value: summary?.newThisMonth ?? 0, hint: '스타트업·미분류 포함' },
    {
      label: '미분류 대기',
      value: summary?.unclassified ?? 0,
      hint: '분류 필요 →',
      to: '/networks?tab=others',
    },
    { label: '스타트업', value: summary?.startups ?? 0, hint: '마스터 보유' },
  ]

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
      <KpiTiles tiles={tiles} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded border border-gray-300 bg-white p-4">
          <h3 className="mb-2 text-body font-semibold text-gray-800">구분별 분포</h3>
          {summaryLoading ? (
            <div className="flex h-[260px] items-center justify-center"><Spinner /></div>
          ) : (
            <CategoryDonut data={summary?.byCategory ?? []} />
          )}
        </div>

        <div className="rounded border border-gray-300 bg-white p-4">
          <h3 className="mb-3 text-body font-semibold text-gray-800">구분별 규모</h3>
          <ul className="space-y-2">
            {(summary?.byCategory ?? []).map((c, i) => {
              const total = summary?.activeTotal || 1
              const pct = Math.round((c.count / total) * 100)
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

      <div className="rounded border border-gray-300 bg-white p-4">
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
