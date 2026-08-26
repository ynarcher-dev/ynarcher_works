import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Network, Rocket, type LucideIcon } from 'lucide-react'
import { Card, EmptyState, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import {
  LEDGERS,
  useMyDatabaseStats,
  type LedgerKey,
  type LedgerStat,
} from './myDatabaseHooks'

const n = (value: number) => value.toLocaleString('ko-KR')

/**
 * 타일의 겉모습 — 아이콘·색. 이 표가 아는 것은 **어떻게 보이는가**뿐이고, 무엇을 세는지와
 * 어디로 가는지는 `LEDGERS`(hooks)가 소유한다.
 *
 * 색은 위 「나의 워크스페이스」가 쓰지 않는 넷에서 고른다(blue·purple·mint·amber 회피) —
 * 나란히 선 두 카드가 같은 색을 쓰면 두 줄이 한 줄의 연장으로 읽힌다. 아이콘은 좌측 내비에서
 * 그 원장을 가리키는 글리프를 그대로 가져온다(스타트업 Rocket · 글로벌 Globe).
 */
const TILE_LOOK: Record<LedgerKey, { eyebrow: string; icon: LucideIcon; tone: SummaryTileTone }> = {
  startup: { eyebrow: 'STARTUP', icon: Rocket, tone: 'cyan' },
  domestic: { eyebrow: 'NETWORKS', icon: Network, tone: 'indigo' },
  global: { eyebrow: 'NETWORKS', icon: Globe, tone: 'orchid' },
}

/**
 * 타일 아래 지표 칩 둘 — '이번 달'과 '전사'.
 *
 * 이번 달이 0이면 '0'이 아니라 '–'다. 0으로 적으면 성적표처럼 읽히는데, 이 칩이 답하는 것은
 * "이번 달에 늘었나"이지 "이번 달에 얼마나 못 했나"가 아니다.
 *
 * 전사 칩은 절대 건수와 내 비중을 한 칸에 담는다 — `전사 1,842건 (전사 대비 7%)`. 비중은 두
 * 수에서 따라 나오는 값이라 칩을 하나 더 세울 만한 축이 아니고, 같은 칸에 두면 '무엇 중
 * 얼마'가 눈에서 한 번에 이어진다. 전사가 0이면 비율이 성립하지 않아 괄호를 통째로 뺀다.
 */
function tileMetrics(row: LedgerStat) {
  const ratio = row.total > 0 ? ` (전사 대비 ${Math.round((row.mine / row.total) * 100)}%)` : ''
  return [
    { label: '이번 달', value: row.monthAdded > 0 ? `+${n(row.monthAdded)}` : '–' },
    { label: '전사', value: `${n(row.total)}건${ratio}` },
  ]
}

/**
 * 나의 데이터베이스 — 내가 쌓아 놓은 데이터 원장 셋의 보유·증감을 타일 석 장에 세운다.
 *
 * 이 자리에는 원래 '참여 중인 운영' 목록이 있었다. 바로 위 「나의 워크스페이스」 타일이 이미
 * "내가 몇 건 맡았나"를 세고 각 워크스페이스의 내 목록으로 보내 주므로, 같은 목록을 아래에
 * 펼치면 한 카드가 위 카드의 각주가 된다 — 같은 물음에 두 번 답하는 자리였다.
 *
 * 그래서 이 카드는 **다른 물음**에 답한다: 내가 쌓아 놓은 데이터가 지금 얼마고, 이번 달에
 * 얼마나 늘었는가. 사업(운영)이 아니라 원장(자산)이 축이라 위 카드와 겹치지 않는다.
 *
 * 표가 아니라 타일인 것은 이 카드가 하는 일이 **훑어보기**이기 때문이다. 줄이 셋뿐이고 각
 * 줄의 주인공이 큰 수 하나(내 보유)라, 표로 세우면 머리글 넉 줄이 값보다 넓은 자리를 차지한다.
 * 위 카드와 같은 컴포지션을 쓰는 것은 두 카드가 같은 문법("세고, 눌러서 내 목록으로 간다")을
 * 갖기 때문이며, 색과 아이콘이 둘을 가른다.
 */
export function MyDatabaseCard() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const userId = user?.id
  // 볼 수 있는 원장만 센다 — RLS는 권한 없는 조회에 오류가 아니라 0을 돌려주므로, 함께 세면
  // "안 보이는 것"이 "없는 것"과 같은 모양으로 카드에 적힌다.
  const keys = useMemo(
    () => LEDGERS.filter((l) => hasWorkspaceRead(user, l.workspace)).map((l) => l.key),
    [user],
  )
  const { data, isLoading, isError } = useMyDatabaseStats(userId, keys)

  // 셋 다 못 보는 사람에게는 카드를 세우지 않는다. 빈 자리를 남기면 "내 데이터가 0건"으로 읽힌다.
  if (keys.length === 0) return null
  if (isLoading) return <Skeleton className="h-52 rounded-radius-lg" />
  if (isError) {
    return (
      <Card title="나의 데이터베이스">
        <EmptyState title="데이터 현황을 불러오지 못했습니다." description="잠시 후 다시 시도해주세요." />
      </Card>
    )
  }

  return (
    <Card title="나의 데이터베이스">
      {/* 열 수는 위 카드와 다르다(넷 → 셋) — 타일 수가 다른데 격자를 맞추면 마지막 칸이 비고,
          그 빈칸이 "여기 하나 더 있어야 하는데 없다"로 읽힌다. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((row) => {
          const look = TILE_LOOK[row.key]
          const Icon = look.icon
          return (
            <SummaryTile
              key={row.key}
              // 타일을 누르면 그 원장의 '내 목록'으로 간다 — 건수를 세어 놓고 누를 수 없으면
              // 다음에 할 일이 사이드바를 다시 찾아가는 일밖에 남지 않는다(위 카드와 같은 규칙).
              // 권한 판정은 이미 keys에서 끝났으므로 여기 선 타일은 모두 누를 수 있다.
              onClick={() => navigate(row.path)}
              title={row.label}
              eyebrow={look.eyebrow}
              value={n(row.mine)}
              unit="건"
              tone={look.tone}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              metrics={tileMetrics(row)}
            />
          )
        })}
      </div>
    </Card>
  )
}
