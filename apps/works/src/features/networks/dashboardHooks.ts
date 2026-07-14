import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ENTITIES, ENTITY_ORDER, type EntityKey } from '@/features/networks/config'

/** 규모 KPI + 구분별 분포에 참여하는 인물 8종 마스터(미분류·스타트업 제외). */
const PEOPLE_TABLES = ENTITY_ORDER

/** '이번 달 신규'·최근 업로드 집계 대상(인물 8종 + 미분류 + 스타트업). */
const ALL_TABLES: EntityKey[] = [...ENTITY_ORDER, 'others', 'startups']

/** 이번 달 1일 0시(로컬) ISO — 신규 집계 하한. */
function startOfMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

/** 활성(미삭제·미병합) 레코드 head 카운트. */
async function activeCount(table: EntityKey, since?: string): Promise<number> {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .is('merged_into_id', null)
  if (since) q = q.gte('created_at', since)
  const { count } = await q
  return count ?? 0
}

export interface NetworksSummary {
  activeTotal: number
  newThisMonth: number
  unclassified: number
  startups: number
  /** 구분별 분포(내림차순). 규모 0 카테고리도 포함해 팔레트 순서를 유지한다. */
  byCategory: { key: EntityKey; label: string; count: number }[]
}

/** 규모 요약 + 구분별 분포. 테이블별 head 카운트를 병렬 집계한다(행 미전송). */
export function useNetworksSummary() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'summary'],
    queryFn: async (): Promise<NetworksSummary> => {
      const since = startOfMonthISO()
      const [peopleActive, others, startups, newCounts] = await Promise.all([
        Promise.all(PEOPLE_TABLES.map((t) => activeCount(t))),
        activeCount('others'),
        activeCount('startups'),
        Promise.all(ALL_TABLES.map((t) => activeCount(t, since))),
      ])
      const byCategory = PEOPLE_TABLES.map((key, i) => ({
        key,
        label: ENTITIES[key].label,
        count: peopleActive[i] ?? 0,
      })).sort((a, b) => b.count - a.count)

      return {
        activeTotal: peopleActive.reduce((s, n) => s + n, 0),
        newThisMonth: newCounts.reduce((s, n) => s + n, 0),
        unclassified: others,
        startups,
        byCategory,
      }
    },
  })
}

export interface RecentUpload {
  entity: EntityKey
  entityLabel: string
  id: string
  name: string
  affiliation: string | null
  creatorName: string | null
  source: 'bulk_upload' | 'manual'
  createdAt: string
}

/** 인물 8종 + 미분류에서 최근 업로드 행을 뽑아올 때 읽는 컬럼(공통 스키마). */
const PEOPLE_SELECT = 'id, name, affiliation, profile, created_at, creator:users!created_by(name)'

type PeopleRow = {
  id: string
  name: string
  affiliation: string | null
  profile: { source?: string } | null
  created_at: string
  creator: { name: string | null } | null
}

type StartupRow = {
  id: string
  name: string
  created_at: string
  creator: { name: string | null } | null
}

/**
 * 8종 마스터 + 미분류 + 스타트업을 통합한 최신 업로드 리스트.
 * 테이블마다 최신 `perTable`건만 가져와 합친 뒤 등록일시 내림차순으로 상위 `limit`건을 남긴다.
 * 스타트업은 스키마(소속·profile 없음)가 달라 별도 셀렉트로 처리한다.
 */
export function useRecentUploads(limit = 20) {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'recent', limit],
    queryFn: async (): Promise<RecentUpload[]> => {
      const perTable = Math.min(limit, 10)
      const peopleTables: EntityKey[] = [...ENTITY_ORDER, 'others']

      const peoplePromises = peopleTables.map(async (table): Promise<RecentUpload[]> => {
        const { data } = await supabase
          .from(table)
          .select(PEOPLE_SELECT)
          .is('deleted_at', null)
          .is('merged_into_id', null)
          .order('created_at', { ascending: false })
          .limit(perTable)
        return ((data ?? []) as unknown as PeopleRow[]).map((r) => ({
          entity: table,
          entityLabel: ENTITIES[table].label,
          id: r.id,
          name: r.name,
          affiliation: r.affiliation,
          creatorName: r.creator?.name ?? null,
          source: r.profile?.source === 'bulk_upload' ? 'bulk_upload' : 'manual',
          createdAt: r.created_at,
        }))
      })

      const startupPromise = (async (): Promise<RecentUpload[]> => {
        const { data } = await supabase
          .from('startups')
          .select('id, name, created_at, creator:users!created_by(name)')
          .is('deleted_at', null)
          .is('merged_into_id', null)
          .order('created_at', { ascending: false })
          .limit(perTable)
        return ((data ?? []) as unknown as StartupRow[]).map((r) => ({
          entity: 'startups' as EntityKey,
          entityLabel: ENTITIES.startups.label,
          id: r.id,
          name: r.name,
          affiliation: null,
          creatorName: r.creator?.name ?? null,
          source: 'manual' as const,
          createdAt: r.created_at,
        }))
      })()

      const merged = (await Promise.all([...peoplePromises, startupPromise])).flat()
      return merged
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
    },
  })
}
