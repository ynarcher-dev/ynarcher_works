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

/**
 * 글로벌 네트워크(global_networks)의 권역(region_tags)별 보유 건수 분포.
 * 권역 미지정(region_tag_id null)은 '미지정'으로 집계한다. 건수 내림차순.
 */
export function useRegionDistribution() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'regions'],
    queryFn: async (): Promise<{ label: string; count: number }[]> => {
      const [tagRes, rowRes] = await Promise.all([
        supabase.from('region_tags').select('id, name').is('deleted_at', null),
        supabase
          .from('global_networks')
          .select('region_tag_id')
          .is('deleted_at', null)
          .is('merged_into_id', null)
          .limit(5000),
      ])
      const nameById = new Map(
        ((tagRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
      )
      const counts = new Map<string, number>()
      let none = 0
      for (const r of (rowRes.data ?? []) as { region_tag_id: string | null }[]) {
        if (!r.region_tag_id) {
          none += 1
          continue
        }
        counts.set(r.region_tag_id, (counts.get(r.region_tag_id) ?? 0) + 1)
      }
      const result = [...counts.entries()]
        .map(([id, count]) => ({ label: nameById.get(id) ?? '기타', count }))
        .sort((a, b) => b.count - a.count)
      if (none > 0) result.push({ label: '미지정', count: none })
      return result
    },
  })
}

/** 전문가 평가랭킹 행. 활동건·만족도는 실집계 연동 전이라 null(미연동)로 둔다. */
export interface ExpertRankRow {
  id: string
  entity: EntityKey
  name: string
  /** 구분(profile.category, 없으면 엔티티 라벨). */
  category: string
  /** 분야(expertise 태그). */
  fields: string[]
  /** 활동 건수(실집계 연동 후 채움). */
  activity: number | null
  /** 만족도 별점(실집계 연동 후 채움). */
  satisfaction: number | null
}

/** 평가랭킹 대상 — 분야·활동·만족도를 갖는 프로필형 4종. */
const RANKING_TABLES: EntityKey[] = ['experts', 'van', 'exp', 'investors']

/**
 * 전문가 평가랭킹용 목록(이름·구분·분야). 활동건·만족도는 실집계 연동 전이라 null이며,
 * UI에서 '-'로 표기한다. 정렬(활동/만족도 탭)은 연동 후 값 기준으로 동작하도록 준비만 한다.
 */
export function useExpertRanking() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'expert-ranking'],
    queryFn: async (): Promise<ExpertRankRow[]> => {
      const perTable = await Promise.all(
        RANKING_TABLES.map(async (t) => {
          const { data } = await supabase
            .from(t)
            .select('id, name, expertise, profile')
            .is('deleted_at', null)
            .is('merged_into_id', null)
            .order('name', { ascending: true })
            .limit(500)
          return (
            (data ?? []) as {
              id: string
              name: string
              expertise: unknown
              profile: { category?: string } | null
            }[]
          ).map((r) => ({
            id: r.id,
            entity: t,
            name: r.name,
            category: r.profile?.category || ENTITIES[t].label,
            fields: Array.isArray(r.expertise) ? (r.expertise as string[]) : [],
            activity: null,
            satisfaction: null,
          }))
        }),
      )
      return perTable.flat()
    },
  })
}

