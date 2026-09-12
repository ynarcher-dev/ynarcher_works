import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, Target, WalletCards, type LucideIcon } from 'lucide-react'
import { Card, EmptyState, Skeleton, SummaryTile, cardText, type SummaryTileTone } from '@ynarcher/ui'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { useMyKpiDashboard } from '@/features/management/kpi/kpiApi'
import type { KpiScope } from '@/features/management/kpi/kpiTypes'
import { MyDatabaseCard } from './MyDatabaseCard'
import {
  OPERATION_MINE_PATH,
  OPERATION_ROLE_LABEL,
  useMyBusinessOperations,
  type BusinessOperation,
  type OperationRoleKey,
} from './businessDashboardHooks'

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
    key: 'project', label: '관리 사업', caption: '사업 운영', icon: Target,
    tone: 'blue', roles: ['PM', 'MEMBER'],
  },
  {
    key: 'mna', label: 'M&A 딜', caption: '딜 운영', icon: BriefcaseBusiness,
    tone: 'purple', roles: ['PM', 'MEMBER'],
  },
  // 펀드는 사업 원장(features/program)이 아니지만 "내가 지금 무엇을 굴리고 있는가"라는
  // 물음에는 함께 답해야 한다 — 운용역에게는 펀드가 곧 자기 운영이라, 이 칸이 없으면
  // 대시보드가 자기 일의 절반만 세어 준다. 아이콘은 좌측 내비의 FUND와 같은 것을 쓴다.
  {
    key: 'fund', label: 'FUND', caption: '펀드 운용', icon: WalletCards,
    tone: 'amber', roles: ['LEAD', 'OPERATION', 'ADMIN'],
  },
]

/**
 * KPI 카드 머리 우측 한 줄 — 부서명과 적용기간.
 *
 * 둘 다 `my_kpi_dashboard` 하나가 답한다. 부서는 기준일의 `dept_members` 소속을 통해 상속된
 * 부서 KPI 행이 들고 있는 이름이고(그 소속이 곧 이 점수가 걸린 자리다), 적용기간은 KPI 버전이
 * 따로 저장하지 않고 짝인 조직 원장 버전의 기간을 그대로 읽는다. 그래서 두 카드의 기간은
 * 언제나 같은 값이며, 개인 카드에는 부서를 적지 않는다(본인 이름은 카드 제목이 이미 답한다).
 *
 * 머릿말(`부서 …`·`적용기간 …`)은 붙이지 않는다 — 부서명과 날짜 범위는 생김새가 이미 자기가
 * 무엇인지를 말한다. 같은 이유로 값이 없으면 `—`가 아니라 아무것도 세우지 않는다: 이름표가
 * 없는 자리에서 빈 표시만 남으면 그것이 무엇의 빈 자리인지 화면이 답하지 못한다.
 */
function KpiHeaderMeta({ scope }: { scope: KpiScope }) {
  const { data = [] } = useMyKpiDashboard()
  const version = data[0]
  const department = data.find((row) => row.scope_type === 'DEPARTMENT')?.subject_name

  const parts = [
    scope === 'DEPARTMENT' ? department : null,
    version ? `${version.effective_from} ~ ${version.effective_to ?? '무기한'}` : null,
  ].filter(Boolean)
  if (!parts.length) return null

  return <span className={cardText.meta}>{parts.join(' · ')}</span>
}

/**
 * 대시보드 좌측 상단 — 「나의 워크스페이스」(내가 맡은 운영 건수) + 「나의 데이터베이스」.
 *
 * 두 카드는 서로 다른 물음에 답한다. 위는 **사업**(지금 무엇을 굴리고 있나), 아래는
 * **원장**(무엇을 쌓아 놓았나)이다. 2026-08-26까지 아래 자리에는 위 타일이 센 운영을 그대로
 * 펼친 '참여 중인 운영' 목록이 있었는데, 타일이 이미 각 워크스페이스의 내 목록으로 보내 주므로
 * 그 표는 위 카드의 각주였다 — 한 화면이 같은 물음에 두 번 답하고 있었다.
 */
export function BusinessOperationsDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
  const { data = [], isLoading, isError } = useMyBusinessOperations(userId)

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
    <div className="flex h-full flex-col gap-4">
      {/* KPI는 부서·개인 두 카드로 나란히 선다. 머리 우측의 부서·적용기간만 원장을 읽고
          본문(지표·점수)은 후속 작업에서 채운다. 데스크톱에서는 두 카드가 남은 높이를 받아
          좌측 열 최상단을 채우고, 작은 화면에서는 1열로 쌓인다. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:flex-1">
        <Card
          title="부서 KPI"
          actions={<KpiHeaderMeta scope="DEPARTMENT" />}
          className="min-h-48 lg:flex lg:flex-col"
          bodyClassName="lg:flex-1"
        >
          {null}
        </Card>
        <Card
          title="개인 KPI"
          actions={<KpiHeaderMeta scope="PERSON" />}
          className="min-h-48 lg:flex lg:flex-col"
          bodyClassName="lg:flex-1"
        >
          {null}
        </Card>
      </div>
      <Card title="누적 업무">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                // 타일 제목이 답하므로 단위에는 '운영'을 반복하지 않고 '개'만 적는다.
                unit="개"
                tone={item.tone}
                icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
                metrics={summary.metrics}
              />
            )
          })}
        </div>
      </Card>
      <MyDatabaseCard />
    </div>
  )
}
