import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, FolderKanban, Target, WalletCards, type LucideIcon } from 'lucide-react'
import { Badge, Card, DataTable, EmptyState, Skeleton, SummaryTile, type Column, type SummaryTileTone } from '@ynarcher/ui'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { MiniPager } from '@/features/networks/MiniPager'
import {
  OPERATION_MINE_PATH,
  OPERATION_ROLE_LABEL,
  isLeadRole,
  useMyBusinessOperations,
  type BusinessOperation,
  type OperationRoleKey,
} from './businessDashboardHooks'

/** 한 화면에 세우는 운영 수. 대시보드 좌측 열이 우측(인사말·근무체크·전자결재)보다 길어지지
 *  않도록 세 줄로 묶고, 나머지는 페이저로 넘긴다. */
const PAGE_SIZE = 3

/**
 * 타일 한 칸 — 어느 원장을 세는가와, **그 원장에서 자리를 어떻게 가르는가**.
 *
 * 자리 목록을 타일마다 적는 이유는 원장마다 자리의 수가 다르기 때문이다(사업 둘 / 펀드 셋).
 * 화면에 PM·MEMBER 두 칩을 못 박아 두면 펀드의 운용·관리가 한 칸에 뭉쳐, 관리인력에게는
 * 자기 일이 아닌 숫자가 남는다.
 */
const WORKSPACE_SUMMARIES: {
  key: BusinessOperation['workspace']
  label: string
  caption: string
  icon: LucideIcon
  tone: SummaryTileTone
  roles: OperationRoleKey[]
}[] = [
  {
    key: 'ac', label: 'AC', caption: '액셀러레이팅', icon: Target,
    tone: 'blue', roles: ['PM', 'MEMBER'],
  },
  {
    key: 'mna', label: 'M&A·PE', caption: '딜 운영', icon: BriefcaseBusiness,
    tone: 'purple', roles: ['PM', 'MEMBER'],
  },
  {
    key: 'project', label: 'PROJECT', caption: '프로젝트', icon: FolderKanban,
    tone: 'mint', roles: ['PM', 'MEMBER'],
  },
  // 펀드는 사업 원장(features/program)이 아니지만 "내가 지금 무엇을 굴리고 있는가"라는
  // 물음에는 함께 답해야 한다 — 운용역에게는 펀드가 곧 자기 운영이라, 이 칸이 없으면
  // 대시보드가 자기 일의 절반만 세어 준다. 아이콘은 좌측 내비의 FUND와 같은 것을 쓴다.
  {
    key: 'fund', label: 'FUND', caption: '펀드 운용', icon: WalletCards,
    tone: 'amber', roles: ['LEAD', 'OPERATION', 'ADMIN'],
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
  { key: 'role', header: '역할', type: 'badge', render: (row) => <Badge tone={isLeadRole(row.roleKey) ? 'info' : 'neutral'}>{OPERATION_ROLE_LABEL[row.roleKey]}</Badge> },
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
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
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

  // 자리별 건수는 타일이 선언한 목록만 센다 — 원장에 없는 자리를 0으로 적으면 그 자리가
  // 있는데 아무도 없는 것처럼 읽힌다(사업에 '관리 0'이 서면 안 된다).
  const workspaceSummary = (
    workspace: BusinessOperation['workspace'],
    roles: OperationRoleKey[],
  ) => {
    const rows = data.filter((item) => item.workspace === workspace)
    return {
      total: rows.length,
      metrics: roles.map((role) => ({
        label: OPERATION_ROLE_LABEL[role],
        value: rows.filter((item) => item.roleKey === role).length,
      })),
    }
  }

  if (isLoading) return <Skeleton className="h-80 rounded-radius-lg" />
  if (isError) return <Card><EmptyState title="사업 운영 현황을 불러오지 못했습니다." description="잠시 후 다시 시도해주세요." /></Card>

  return (
    <div className="space-y-4">
      <Card title="나의 워크스페이스">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {WORKSPACE_SUMMARIES.map((item) => {
            const Icon = item.icon
            const summary = workspaceSummary(item.key, item.roles)
            return (
              <SummaryTile
                key={item.key}
                // 타일을 누르면 그 워크스페이스의 내 목록으로 간다 — 건수를 세어 놓고 누를 수
                // 없으면 다음에 할 일이 사이드바를 다시 찾아가는 일밖에 남지 않는다.
                // 열람 권한이 없는 워크스페이스는 누를 수 없게 둔다: 누르면 권한 안내만 뜨는
                // 자리로 보내는 것은 안내가 아니라 막다른 길이다(RequireWorkspace와 같은 판정).
                onClick={
                  hasWorkspaceRead(user, item.key)
                    ? () => navigate(OPERATION_MINE_PATH[item.key])
                    : undefined
                }
                title={item.label}
                eyebrow={item.caption}
                value={summary.total}
                // 단위는 '개'까지다 — 카드 이름이 이미 '나의 워크스페이스'라 무엇을 세는지는
                // 타일 제목이 답하고, 자리 칩(대펀·운용)까지 선 칸에서는 '운영'이 줄을 넘겨 접혔다.
                unit="개"
                tone={item.tone}
                icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
                metrics={summary.metrics}
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
