import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/networks/hooks'
import type { StatusItem } from '@/features/networks/dashboardHooks'
import {
  MANAGEMENT_STATUSES,
  MANAGEMENT_STATUS_LABEL,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

/** 대시보드가 읽는 스타트업 컬럼(원장 단일 조회). 성장 지표·담당자 임베드까지 한 번에 가져온다. */
const DASHBOARD_SELECT =
  'id, name, management_status, stage, industries, industry, location, founded_on, created_at, pool_status, growth_metrics, ' +
  'managers:startup_managers(user_id, is_lead, user:users!startup_managers_user_id_fkey(id, name))'

/** 구분 코드 → STARTUP 사이드바 탭 키(현황 타일 클릭 이동용). */
const STATUS_TO_TAB: Record<ManagementStatus, string> = {
  sourced: 'discovered',
  incubated: 'incubated',
  invested: 'invested',
  other: 'etc',
}

/**
 * 대시보드용 활성 스타트업 원장 단일 조회. 분포·랭킹·투자추이·퍼널·KPI·담당자 부하를
 * 이 rows 한 벌에서 모두 파생한다(컴포넌트는 startupDashboardCompute의 순수 함수로 계산).
 */
export function useStartupDashboardRows() {
  return useQuery({
    queryKey: ['startups', 'dashboard', 'rows'],
    queryFn: async (): Promise<EntityRow[]> => {
      const { data, error } = await supabase
        .from('startups')
        .select(DASHBOARD_SELECT)
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .limit(3000)
      if (error) throw error
      return (data ?? []) as unknown as EntityRow[]
    },
  })
}

/** 이번 달 1일 0시(로컬) ISO — 전월 대비 증감 집계 하한. */
function startOfMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

/** 구분별 startups head 카운트(행 미전송). active/기간 필터를 조합한다. */
async function headCount(opts: {
  status?: ManagementStatus
  active?: boolean
  createdSince?: string
  deletedSince?: string
}): Promise<number> {
  let q = supabase
    .from('startups')
    .select('id', { count: 'exact', head: true })
    .is('merged_into_id', null)
  if (opts.status) q = q.eq('management_status', opts.status)
  if (opts.active) q = q.is('deleted_at', null)
  if (opts.createdSince) q = q.gte('created_at', opts.createdSince)
  if (opts.deletedSince) q = q.gte('deleted_at', opts.deletedSince)
  const { count } = await q
  return count ?? 0
}

/**
 * 기업 현황 그리드: 총보유(맨 앞, 강조) + 투자/보육/발굴/기타 4구분 보유·전월 대비 증감.
 * NETWORKS 현황과 동일 계약(StatusItem[])이라 공용 StatusTileGrid로 렌더한다.
 * delta = 이번 달 신규 − 이번 달 비활성화. 타일 클릭 시 해당 구분 목록 탭으로 이동한다.
 */
export function useStartupSummary() {
  return useQuery({
    queryKey: ['startups', 'dashboard', 'summary'],
    queryFn: async (): Promise<StatusItem[]> => {
      const since = startOfMonthISO()
      const stats = await Promise.all(
        MANAGEMENT_STATUSES.map(async (status) => {
          const [total, added, removed] = await Promise.all([
            headCount({ status, active: true }),
            headCount({ status, active: true, createdSince: since }),
            headCount({ status, deletedSince: since }),
          ])
          return {
            key: STATUS_TO_TAB[status],
            label: MANAGEMENT_STATUS_LABEL[status],
            total,
            delta: added - removed,
          }
        }),
      )
      const grand: StatusItem = {
        key: 'total',
        label: '총보유',
        total: stats.reduce((s, x) => s + x.total, 0),
        delta: stats.reduce((s, x) => s + x.delta, 0),
        emphasis: true,
      }
      return [grand, ...stats]
    },
  })
}
