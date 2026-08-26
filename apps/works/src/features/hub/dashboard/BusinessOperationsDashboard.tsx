import { useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, FolderKanban, Target, WalletCards, type LucideIcon } from 'lucide-react'
import { Card, EmptyState, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
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
      <MyDatabaseCard />
    </div>
  )
}
