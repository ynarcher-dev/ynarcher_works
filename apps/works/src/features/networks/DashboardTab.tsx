import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import {
  useExpertiseDistribution,
  useNetworksSummary,
  useRecentUploads,
  type RecentUpload,
  type StatusItem,
} from '@/features/networks/dashboardHooks'
import { usesDetailPage } from '@/features/networks/config'

/**
 * 가로 막대 팔레트. 차트 규칙서(7)의 chart.1~8 순서를 따르고,
 * 9번째 이후 계열은 기타용 gray로 마감한다.
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

/** 가로 막대 리스트(라벨 · 막대 · 건수/비율). 규모 0 항목은 제외한다. */
function HBarList({ data }: { data: { label: string; count: number }[] }) {
  const rows = data.filter((d) => d.count > 0)
  if (rows.length === 0) {
    return <p className="py-8 text-center text-caption text-gray-400">표시할 데이터가 없습니다.</p>
  }
  const total = rows.reduce((s, d) => s + d.count, 0) || 1
  return (
    <ul className="space-y-2">
      {rows.map((d, i) => {
        const pct = Math.round((d.count / total) * 100)
        return (
          <li key={d.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-caption text-gray-600" title={d.label}>
              {d.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-caption tabular-nums text-gray-700">
              {d.count.toLocaleString()} ({pct}%)
            </span>
          </li>
        )
      })}
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

/** NETWORKS 대시보드: 규모 KPI · 구분별 분포 · 최근 업로드 리스트. */
export function DashboardTab() {
  const navigate = useNavigate()
  const { data: summary, isLoading: summaryLoading } = useNetworksSummary()
  const { data: expertise, isLoading: expertiseLoading } = useExpertiseDistribution()
  const { data: recent, isLoading: recentLoading } = useRecentUploads(20)

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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-radius-md border border-gray-300 bg-white p-4">
          <h3 className="mb-1 text-body font-semibold text-gray-800">분야별 현황</h3>
          <p className="mb-3 text-caption text-gray-400">
            BAN · EXP · 전문가 · 투자사의 관리 분야 태그별 보유 인원(중복 집계, 미등록 값은 기타)
          </p>
          {expertiseLoading ? (
            <div className="flex h-40 items-center justify-center"><Spinner /></div>
          ) : (
            <HBarList data={expertise ?? []} />
          )}
        </div>

        <div className="rounded-radius-md border border-gray-300 bg-white p-4">
          <h3 className="mb-1 text-body font-semibold text-gray-800">카드 2</h3>
          <p className="mb-3 text-caption text-gray-400">준비 중</p>
          <div className="flex h-40 items-center justify-center text-caption text-gray-400">
            표시할 내용을 지정해 주세요
          </div>
        </div>

        <div className="rounded-radius-md border border-gray-300 bg-white p-4">
          <h3 className="mb-1 text-body font-semibold text-gray-800">카드 3</h3>
          <p className="mb-3 text-caption text-gray-400">준비 중</p>
          <div className="flex h-40 items-center justify-center text-caption text-gray-400">
            표시할 내용을 지정해 주세요
          </div>
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
