import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, FolderKanban, Target, WalletCards, type LucideIcon } from 'lucide-react'
import { Badge, Card, DataTable, EmptyState, Skeleton, SummaryTile, type Column, type SummaryTileTone } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import { MiniPager } from '@/features/networks/MiniPager'
import { useMyBusinessOperations, type BusinessOperation } from './businessDashboardHooks'

/** 한 화면에 세우는 운영 수. 대시보드 좌측 열이 우측(인사말·근무체크·전자결재)보다 길어지지
 *  않도록 세 줄로 묶고, 나머지는 페이저로 넘긴다. */
const PAGE_SIZE = 3

const WORKSPACE_SUMMARIES: {
  key: BusinessOperation['workspace']
  label: string
  caption: string
  icon: LucideIcon
  tone: SummaryTileTone
}[] = [
  {
    key: 'ac', label: 'AC', caption: '액셀러레이팅', icon: Target,
    tone: 'blue',
  },
  {
    key: 'mna', label: 'M&A·PE', caption: '딜 운영', icon: BriefcaseBusiness,
    tone: 'purple',
  },
  {
    key: 'project', label: 'PROJECT', caption: '프로젝트', icon: FolderKanban,
    tone: 'mint',
  },
  // 펀드는 사업 원장(features/program)이 아니지만 "내가 지금 무엇을 굴리고 있는가"라는
  // 물음에는 함께 답해야 한다 — 운용역에게는 펀드가 곧 자기 운영이라, 이 칸이 없으면
  // 대시보드가 자기 일의 절반만 세어 준다. 아이콘은 좌측 내비의 FUND와 같은 것을 쓴다.
  {
    key: 'fund', label: 'FUND', caption: '펀드 운용', icon: WalletCards,
    tone: 'amber',
  },
]

function formatDate(date: string | null) {
  if (!date) return '미정'
  return new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function daysUntil(date: string | null) {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000)
}

const columns: Column<BusinessOperation>[] = [
  { key: 'title', header: '운영명', type: 'name', primary: true, render: (row) => row.title },
  { key: 'workspace', header: '워크스페이스', type: 'badge', render: (row) => <Badge tone="neutral">{row.workspaceLabel}</Badge> },
  { key: 'role', header: '역할', type: 'badge', render: (row) => <Badge tone={row.role === 'PM' ? 'info' : 'neutral'}>{row.role}</Badge> },
  // 상태의 라벨·톤은 원장마다 다르므로 훅이 정해서 올린다(같은 'OPERATING'이 사업에서는
  // '진행중', 펀드에서는 '운용 중'이다) — 표는 받은 말을 적기만 한다.
  { key: 'status', header: '상태', type: 'badge', render: (row) => (
    <Badge tone={row.statusTone} dot>{row.statusLabel}</Badge>
  ) },
  { key: 'period', header: '운영 기간', type: 'long', render: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` },
  // 투입률이 없는 원장(펀드)은 0%가 아니라 '-'다 — 0%는 "배정은 됐는데 투입이 없다"는 뜻이 된다.
  { key: 'allocation', header: '투입률', type: 'count', render: (row) => (row.allocationRate == null ? '-' : `${row.allocationRate}%`) },
  { key: 'deadline', header: '종료 일정', type: 'text', render: (row) => {
    const remaining = daysUntil(row.endDate)
    if (remaining == null) return '미정'
    if (remaining < 0) return <span className="text-danger">{Math.abs(remaining)}일 경과</span>
    if (remaining === 0) return '오늘'
    return `D-${remaining}`
  } },
]

export function BusinessOperationsDashboard() {
  const navigate = useNavigate()
  const userId = useAuthStore((state) => state.user?.id)
  const { data = [], isLoading, isError } = useMyBusinessOperations(userId)
  const [page, setPage] = useState(0)
  // 최신순 — 최근 시작한 운영이 위. 기간이 비어 있으면 뒤로 밀고, 같은 날 시작이면 늦게 끝나는 쪽이 위.
  const sorted = useMemo(() => [...data].sort((a, b) =>
    (b.startDate ?? '').localeCompare(a.startDate ?? '') ||
    (b.endDate ?? '').localeCompare(a.endDate ?? '')),
  [data])
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1)
  }, [page, pageCount])

  const workspaceSummary = (workspace: BusinessOperation['workspace']) => {
    const rows = data.filter((item) => item.workspace === workspace)
    const pmCount = rows.filter((item) => item.role === 'PM').length
    const memberCount = rows.length - pmCount
    return { total: rows.length, pmCount, memberCount }
  }

  if (isLoading) return <Skeleton className="h-80 rounded-radius-lg" />
  if (isError) return <Card><EmptyState title="사업 운영 현황을 불러오지 못했습니다." description="잠시 후 다시 시도해주세요." /></Card>

  return (
    <div className="space-y-4">
      <Card title="나의 사업 운영">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {WORKSPACE_SUMMARIES.map((item) => {
            const Icon = item.icon
            const summary = workspaceSummary(item.key)
            return (
              <SummaryTile
                key={item.key}
                title={item.label}
                eyebrow={item.caption}
                value={summary.total}
                unit="개 운영"
                tone={item.tone}
                icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
                metrics={[
                  { label: 'PM', value: summary.pmCount },
                  { label: 'MEMBER', value: summary.memberCount },
                ]}
              />
            )
          })}
        </div>
      </Card>
      <Card title="참여 중인 운영">
        {/* 한 페이지 분량(세 줄) 자리를 미리 잡아 둔다 — 페이지마다 담긴 줄 수가 달라도 카드
            높이가 출렁이지 않게. 값의 근거: 머리글 36px + 행 36px × PAGE_SIZE(3) = 144px. */}
        <div className="min-h-[9rem] overflow-hidden">
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(row) => `${row.workspace}-${row.id}`}
            numbered={false}
            selectable={false}
            standardColumns={false}
            emptyText="참여 중인 운영이 없습니다."
            onRowClick={(row) => navigate(row.detailPath)}
          />
        </div>
        <MiniPager page={page} pageCount={pageCount} onPage={setPage} alwaysVisible />
      </Card>
    </div>
  )
}
