import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  NETWORK_TABLE,
  categoryLabel,
  type NetworkCategory,
} from '@/features/networks/config'

/**
 * 네트워크 현황 집계 — 원장 통합(2026-09-04) 이후.
 *
 * 종전에는 표가 11개라 슬롯마다 head 카운트를 따로 냈다(구분 = 표 이름). 지금은 한 표이므로
 * 구분은 컬럼 값이고, 슬롯은 그 값의 목록이다. 해외는 더 이상 슬롯이 아니다 — 지역은 구분과
 * 직교한 축이라 같은 줄에 세우면 한 사람이 두 칸에 잡힌다.
 */
const STATUS_SLOTS: { key: string; label: string; category: NetworkCategory | null }[] = [
  ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABEL[key], category: key })),
  { key: 'others', label: '미분류', category: null },
]

/** 이번 달 1일 0시(로컬) ISO — 전월 대비 증감 집계 하한. */
function startOfMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

/**
 * 통합 원장 head 카운트(행 미전송). category=null이면 미분류만,
 * category를 주면 그 구분만, 생략하면 전체.
 */
async function headCount(
  opts: {
    category?: NetworkCategory | null
    active?: boolean
    createdSince?: string
    deletedSince?: string
  } = {},
): Promise<number> {
  let q = supabase
    .from(NETWORK_TABLE)
    .select('id', { count: 'exact', head: true })
    .is('merged_into_id', null)
  if (opts.category === null) q = q.is('category', null)
  else if (opts.category) q = q.eq('category', opts.category)
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
  /** 총보유(맨 앞) + 구분 8종 + 미분류. 표시 순서 고정. */
  items: StatusItem[]
  /** 구분별 분포 도넛용(내림차순). */
  byCategory: { key: NetworkCategory; label: string; count: number }[]
}

/** 네트워크 현황(구분별 보유·증감) + 구분별 분포. */
export function useNetworksSummary() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'summary'],
    queryFn: async (): Promise<NetworksSummary> => {
      const since = startOfMonthISO()
      const stats = await Promise.all(
        STATUS_SLOTS.map(async (s) => {
          const [total, added, removed] = await Promise.all([
            headCount({ category: s.category, active: true }),
            headCount({ category: s.category, active: true, createdSince: since }),
            headCount({ category: s.category, deletedSince: since }),
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
        .filter((s): s is typeof s & { category: NetworkCategory } => s.category !== null)
        .map((s) => ({ key: s.category, label: s.label, count: s.total }))
        .sort((a, b) => b.count - a.count)

      return { items: [grand, ...stats], byCategory }
    },
  })
}

/**
 * 전문 영역(expertise jsonb 배열) 태그별 보유 인원 분포.
 * ADMIN 영역 관리(field_tags)에 등록된 태그만 개별 조각으로 집계하고, 목록에 없는
 * 레거시·자유입력 값은 '기타(미등록)'로 합산한다. 한 인물이 여러 영역을 가지면 각 영역에
 * 중복 집계된다(합계 ≠ 인원 수).
 */
export function useExpertiseDistribution() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'expertise'],
    queryFn: async (): Promise<{ label: string; count: number }[]> => {
      const [tagRes, rowRes] = await Promise.all([
        supabase.from('field_tags').select('name').is('deleted_at', null),
        supabase
          .from(NETWORK_TABLE)
          .select('expertise')
          .is('deleted_at', null)
          .is('merged_into_id', null)
          .limit(5000),
      ])
      const managed = new Set(((tagRes.data ?? []) as { name: string }[]).map((t) => t.name))
      const counts = new Map<string, number>()
      let other = 0
      for (const row of (rowRes.data ?? []) as { expertise: unknown }[]) {
        const list = Array.isArray(row.expertise) ? row.expertise : []
        for (const tag of list) {
          if (typeof tag !== 'string' || !tag.trim()) continue
          if (managed.has(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
          else other += 1
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
 * 권역별 보유 건수 분포(해외만). 권역은 행이 아니라 국가가 갖는 값이라 국가를 조인해 센다.
 * 국내는 세지 않는다 — 권역 '국내' 한 칸이 나머지를 다 눌러 비교가 성립하지 않는다.
 * 국가 미확인은 '미지정'으로 집계한다. 건수 내림차순.
 */
export function useRegionDistribution() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'regions'],
    queryFn: async (): Promise<{ label: string; count: number }[]> => {
      const { data, error } = await supabase
        .from(NETWORK_TABLE)
        .select('country:country_tags!country_tag_id(region:region_tags!region_tag_id(name))')
        .eq('region_scope', 'OVERSEAS')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .limit(5000)
      if (error) throw error
      const counts = new Map<string, number>()
      let none = 0
      for (const row of (data ?? []) as { country?: { region?: { name?: string } | null } | null }[]) {
        const label = row.country?.region?.name?.trim()
        if (!label) {
          none += 1
          continue
        }
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      const result = [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
      if (none > 0) result.push({ label: '미지정', count: none })
      return result
    },
  })
}

/** 최근 등록 네트워크 행(구분 표기용). */
export interface RecentNetworkRow {
  id: string
  name: string
  created_at: string
  /** 구분 코드(배지 표기용). 미분류면 null. */
  category: NetworkCategory | null
}

/** 최근 등록 네트워크(등록일 내림차순 상위 60건). 주간 피드(RecentRegisteredFeed)의 원천. */
export function useRecentNetworks() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'recent'],
    queryFn: async (): Promise<RecentNetworkRow[]> => {
      const { data } = await supabase
        .from(NETWORK_TABLE)
        .select('id, name, created_at, category')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('created_at', { ascending: false })
        .limit(60)
      return (data ?? []) as RecentNetworkRow[]
    },
  })
}

/** 네트워크 평가랭킹 행. 활동건·만족도는 실집계 연동 전이라 null(미연동)로 둔다. */
export interface ExpertRankRow {
  id: string
  name: string
  /** 구분 라벨. 미분류면 빈 문자열. */
  category: string
  /** 영역(expertise 태그). */
  fields: string[]
  /** 활동 건수(실집계 연동 후 채움). */
  activity: number | null
  /** 만족도 별점(실집계 연동 후 채움). */
  satisfaction: number | null
}

/** 평가랭킹 대상 — 영역·활동·만족도를 갖는 인물형 구분. */
const RANKING_CATEGORIES: NetworkCategory[] = ['experts', 'van', 'exp', 'investors']

/**
 * 네트워크 평가랭킹용 목록(인물형 구분, 이름·구분·영역). 활동건·만족도는 실집계 연동 전이라
 * null이며, UI에서 '-'로 표기한다.
 */
export function useExpertRanking() {
  return useQuery({
    queryKey: ['networks', 'dashboard', 'expert-ranking'],
    queryFn: async (): Promise<ExpertRankRow[]> => {
      const { data } = await supabase
        .from(NETWORK_TABLE)
        .select('id, name, expertise, category')
        .in('category', RANKING_CATEGORIES)
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .limit(2000)
      return (
        (data ?? []) as { id: string; name: string; expertise: unknown; category: string | null }[]
      ).map((r) => ({
        id: r.id,
        name: r.name,
        category: categoryLabel(r.category),
        fields: Array.isArray(r.expertise) ? (r.expertise as string[]) : [],
        activity: null,
        satisfaction: null,
      }))
    },
  })
}
