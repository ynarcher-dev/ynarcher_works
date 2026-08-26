import { useQuery } from '@tanstack/react-query'
import type { WorkspaceKey } from '@/auth/types'
import { GLOBAL_MINE_TAB } from '@/config/navigation'
import { supabase } from '@/lib/supabase'
import { managedRecordIds } from '@/features/master/ledgerPage'
import { DOMESTIC_LIST_ENTITIES } from '@/features/networks/config'

/**
 * 대시보드 「나의 데이터베이스」가 세는 원장 하나 — **내 몫과 전사 규모를 함께** 답한다.
 *
 * 내 건수만 세면 128이 큰 수인지 작은 수인지 판단할 근거가 없고, 전사 건수만 세면 개인
 * 대시보드 자리에서 누구에게나 같은 숫자를 보여 주는 카드가 된다. 두 값을 한 줄에 두면
 * 비중이 따라 나오므로 축을 하나 더 두지 않아도 된다.
 */
export interface LedgerStat {
  key: LedgerKey
  label: string
  /** 이 줄을 볼 수 있는가를 판정하는 워크스페이스 키(줄마다 다르다). */
  workspace: WorkspaceKey
  /** 줄을 눌렀을 때 열 '내 목록' 경로. 카드가 적은 수와 그 화면의 건수가 같아야 한다. */
  path: string
  /**
   * 세는 단위 — 원장에 담긴 것이 무엇인지가 정한다(스타트업은 '개사', 네트워크는 '명').
   *
   * 화면이 아니라 원장 정의가 갖는 이유는 타일이 이 말을 **두 곳**에서 쓰기 때문이다(큰 수
   * 옆과 전사 칩). 화면에서 각각 적으면 한쪽만 바뀌어 같은 타일 안에서 '9 개사'와 '전사
   * 14건'이 나란히 서는 날이 온다.
   */
  unit: string
  /** 내가 등록했거나 기여한 활성 건수. */
  mine: number
  /** 전사 활성 보유 건수. */
  total: number
}

export type LedgerKey = 'startup' | 'domestic' | 'global'

/**
 * 원장별 정의 — 라벨·권한 키·목적지. 어느 원장을 세울지는 화면이 아니라 이 표가 답한다.
 *
 * 경로는 사이드바(`WORKSPACE_SUBNAV`)의 '내 업로드 DB' 셋과 **같은 탭**을 가리킨다 — 카드가
 * 적은 수와 눌러서 도착한 목록의 건수가 다르면, 방금 본 수가 무엇이었는지 되묻게 된다.
 *
 * 라벨은 사이드바의 말을 그대로 쓰지 않는다. 카드 이름이 이미 '나의 데이터베이스'라 '내 것'은
 * 카드가 말했고, 타일까지 '내 업로드 DB (국내)'라고 적으면 석 장이 같은 말을 세 번 반복한다.
 * 타일이 답할 것은 **어느 원장인가**뿐이다.
 */
export const LEDGERS: Omit<LedgerStat, 'mine' | 'total'>[] = [
  { key: 'startup', label: '스타트업 DB', workspace: 'startup', path: '/startup?tab=mine', unit: '개사' },
  { key: 'domestic', label: '국내 네트워크', workspace: 'networks', path: '/networks?tab=mine', unit: '명' },
  { key: 'global', label: '글로벌 네트워크', workspace: 'networks', path: `/networks?tab=${GLOBAL_MINE_TAB}`, unit: '명' },
]

/**
 * 목록 RPC에서 총 건수만 받아 온다(`p_limit: 1`).
 *
 * 원장별 head 카운트를 합치지 않는 이유는 **눌러서 도착할 목록과 같은 수**여야 하기 때문이다.
 * 국내는 9종을 union하며 중복을 걷어내고 '내 것' 판정이 기여 로그 조인이라, 원장 합계로는
 * 재현되지 않는다. 총 건수는 모든 행에 같은 값으로 실려 오므로 한 행만 받으면 족하다.
 */
async function rpcTotal(fn: string, args: Record<string, unknown>): Promise<number> {
  const { data, error } = await supabase.rpc(fn, { ...args, p_limit: 1, p_offset: 0 })
  if (error) throw error
  const rows = (data ?? []) as { total_count?: number | string }[]
  return Number(rows[0]?.total_count ?? 0)
}

/** 활성 행 head 카운트(비활성·병합 제외). `scope`는 PostgREST `or` 식. */
async function liveCount(table: string, scope?: string): Promise<number> {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .is('merged_into_id', null)
  if (scope) q = q.or(scope)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

type LedgerCounts = Pick<LedgerStat, 'mine' | 'total'>

/**
 * 스타트업 원장 — '내 것'은 생성자(`created_by`) **또는** 담당자(`startup_managers`)다.
 *
 * 담당은 원장 밖에 있어 조인으로 걸 수 없으므로 담당 기업 id를 먼저 모아 `or`로 묶는다
 * (STARTUP '내 업로드 DB' 목록과 같은 조건이며, 그래서 두 화면의 건수가 일치한다).
 */
async function fetchStartupStat(userId: string): Promise<LedgerCounts> {
  const ids = await managedRecordIds('startup_managers', 'startup_id', userId)
  const parts = [`created_by.eq.${userId}`]
  if (ids.length) parts.push(`id.in.(${ids.join(',')})`)
  const [mine, total] = await Promise.all([
    liveCount('startups', parts.join(',')),
    liveCount('startups'),
  ])
  return { mine, total }
}

async function fetchDomesticStat(): Promise<LedgerCounts> {
  const [mine, total] = await Promise.all([
    rpcTotal('my_network_entities', { p_entities: DOMESTIC_LIST_ENTITIES }),
    rpcTotal('all_network_entities', { p_entities: DOMESTIC_LIST_ENTITIES }),
  ])
  return { mine, total }
}

async function fetchGlobalStat(): Promise<LedgerCounts> {
  const [mine, total] = await Promise.all([
    rpcTotal('global_network_entities', { p_mine: true }),
    rpcTotal('global_network_entities', { p_mine: false }),
  ])
  return { mine, total }
}

const FETCHERS: Record<LedgerKey, (userId: string) => Promise<LedgerCounts>> = {
  startup: fetchStartupStat,
  domestic: fetchDomesticStat,
  global: fetchGlobalStat,
}

/**
 * 내가 쌓은 데이터 현황 — 볼 수 있는 원장만 센다.
 *
 * 권한 없는 원장을 함께 조회하면 RLS가 오류가 아니라 0을 돌려주므로, 카드에는 "그 원장에
 * 아무것도 없다"로 적히게 된다 — 안 보이는 것과 없는 것이 같은 모양이 되면 안 된다.
 */
export function useMyDatabaseStats(userId: string | undefined, keys: LedgerKey[]) {
  const scope = keys.join(',')
  return useQuery({
    queryKey: ['office', 'dashboard', 'my-database', userId, scope],
    enabled: Boolean(userId) && keys.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<LedgerStat[]> =>
      Promise.all(
        LEDGERS.filter((ledger) => keys.includes(ledger.key)).map(async (ledger) => ({
          ...ledger,
          ...(await FETCHERS[ledger.key](userId!)),
        })),
      ),
  })
}
