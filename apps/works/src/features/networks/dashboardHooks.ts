import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ENTITIES, ENTITY_ORDER, type EntityKey } from '@/features/networks/config'

/**
 * 네트워크 현황 집계 슬롯(표시 순서 고정). 인물·조직 8종 + 글로벌 + 미분류.
 * label은 현황 카드 표기용(구분별 분포 도넛은 config 라벨을 별도로 사용).
 */
const STATUS_SLOTS: { key: string; label: string; table: string }[] = [
  { key: 'van', label: 'BAN', table: 'van' },
  { key: 'exp', label: 'EXP', table: 'exp' },
  { key: 'experts', label: '전문가', table: 'experts' },
  { key: 'investors', label: '투자자', table: 'investors' },
  { key: 'corporates', label: '기업', table: 'corporates' },
  { key: 'institutions', label: '기관', table: 'institutions' },
  { key: 'universities', label: '대학', table: 'universities' },
  { key: 'vendors', label: '외주/거래', table: 'vendors' },
  { key: 'etc', label: '기타', table: 'etc' },
  { key: 'global', label: '글로벌', table: 'global_networks' },
  { key: 'others', label: '미분류', table: 'others' },
]

/** 도넛(구분별 분포)에 넣는 카테고리 키 집합(글로벌·미분류 제외). */
const DONUT_KEYS = new Set<string>(ENTITY_ORDER)

/** 이번 달 1일 0시(로컬) ISO — 전월 대비 증감 집계 하한. */
function startOfMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

/** 레코드 head 카운트(행 미전송). active=활성만, createdSince/deletedSince=기간 필터. */
async function headCount(
  table: string,
  opts: { active?: boolean; createdSince?: string; deletedSince?: string } = {},
): Promise<number> {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('merged_into_id', null)
  if (opts.active) q = q.is('deleted_at', null)
  if (opts.createdSince) q = q.gte('created_at', opts.createdSince)
  if (opts.deletedSince) q = q.gte('deleted_at', opts.deletedSince)
  const { count } = await q
  return count ?? 0
}

export interface StatusItem {
  key: string
  label: string
  /** 활성 보유 건수. */
  total: number
  /** 전월 대비 증감(= 이번 달 신규 − 이번 달 비활성화). 음수 가능. */
  delta: number
  /** 총보유 등 강조 셀 여부. */
  emphasis?: boolean
}

export interface NetworksSummary {
  /** 총보유(맨 앞) + 카테고리 10종 + 글로벌 + 미분류. 표시 순서 고정. */
  items: StatusItem[]
  /** 구분별 분포 도넛용(인물·조직 8종, 내림차순). */
  byCategory: { key: EntityKey; label: string; count: number }[]
}

/** 네트워크 현황(슬롯별 보유·증감) + 구분별 분포. 테이블별 head 카운트를 병렬 집계한다. */
export function useNetworksSummary() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'summary'],
    queryFn: async (): Promise<NetworksSummary> => {
      const since = startOfMonthISO()
      const stats = await Promise.all(
        STATUS_SLOTS.map(async (s) => {
          const [total, added, removed] = await Promise.all([
            headCount(s.table, { active: true }),
            headCount(s.table, { active: true, createdSince: since }),
            headCount(s.table, { deletedSince: since }),
          ])
          return { ...s, total, delta: added - removed }
        }),
      )

      const grand: StatusItem = {
        key: 'total',
        label: '총보유',
        total: stats.reduce((sum, s) => sum + s.total, 0),
        delta: stats.reduce((sum, s) => sum + s.delta, 0),
        emphasis: true,
      }

      const byCategory = stats
        .filter((s) => DONUT_KEYS.has(s.key))
        .map((s) => ({
          key: s.key as EntityKey,
          label: ENTITIES[s.key as EntityKey].label,
          count: s.total,
        }))
        .sort((a, b) => b.count - a.count)

      return { items: [grand, ...stats], byCategory }
    },
  })
}

/** 분야(expertise) 집계 대상 — 전문 분야를 입력하는 프로필형 4종(BAN·EXP·전문가·투자사). */
const EXPERTISE_TABLES = ['van', 'exp', 'experts', 'investors']

/**
 * BAN·EXP·전문가·투자사의 전문 분야(expertise jsonb 배열) 태그별 보유 인원 분포.
 * ADMIN 분야 관리(field_tags)에 등록된 태그만 개별 조각으로 집계하고, 목록에 없는
 * 레거시·자유입력 값은 '기타(미등록)'로 합산한다. 한 인물이 여러 분야를 가지면 각 분야에
 * 중복 집계된다(합계 ≠ 인원 수).
 */
export function useExpertiseDistribution() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'expertise'],
    queryFn: async (): Promise<{ label: string; count: number }[]> => {
      const [tagRes, ...tableRes] = await Promise.all([
        supabase.from('field_tags').select('name').is('deleted_at', null),
        ...EXPERTISE_TABLES.map((t) =>
          supabase
            .from(t)
            .select('expertise')
            .is('deleted_at', null)
            .is('merged_into_id', null)
            .limit(2000),
        ),
      ])
      const managed = new Set(
        ((tagRes.data ?? []) as { name: string }[]).map((t) => t.name),
      )
      const counts = new Map<string, number>()
      let other = 0
      for (const res of tableRes) {
        for (const row of (res.data ?? []) as { expertise: unknown }[]) {
          const list = Array.isArray(row.expertise) ? row.expertise : []
          for (const tag of list) {
            if (typeof tag !== 'string' || !tag.trim()) continue
            if (managed.has(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
            else other += 1
          }
        }
      }
      const result = [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
      if (other > 0) result.push({ label: '기타(미등록)', count: other })
      return result
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
