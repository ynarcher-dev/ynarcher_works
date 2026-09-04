import { useQuery } from '@tanstack/react-query'
import { Globe2, MapPin } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { REGION_TAG_TABLE } from '@/features/networks/config'
import type { NetworkFilterState, NetworkSearchScope } from '@/features/networks/filters'
import type { NetworkListScope } from '@/features/networks/hooks'
import { supabase } from '@/lib/supabase'

const TONES: SummaryTileTone[] = ['blue', 'purple', 'cyan', 'amber', 'peach', 'rose', 'lime', 'mint']

interface Props {
  scope: NetworkListScope
  keyword: string
  filters: NetworkFilterState
  searchScope: NetworkSearchScope
  /** 권역 타일 토글(다중선택). 값은 목록 필터와 같은 태그 id다. */
  onToggleRegion: (regionId: string) => void
  /** '전체' 타일 — 권역 조건을 푸는 문. */
  onClearRegions: () => void
}

/** 권역 한 칸. id가 없는 '미지정'은 걸 조건이 없어 누르지 않는다. */
interface RegionTile {
  id: string | null
  label: string
  count: number
}

/**
 * 권역별 현황 — 지역을 해외로 좁혔을 때만 선다.
 * 국내 행에는 권역이 없어 섞어 세면 '미지정'이 늘 최대 칸이 되고, 그 칸은 누를 조건이
 * 없으므로 표를 좁히는 데 아무 도움이 되지 않는다.
 */
export function RegionFilteredSummary({
  scope,
  keyword,
  filters,
  searchScope,
  onToggleRegion,
  onClearRegions,
}: Props) {
  const rpc = scope === 'mine' ? 'my_network_entities' : 'all_network_entities'
  const { data = [], isPending } = useQuery({
    queryKey: ['networks', 'region-summary', scope, keyword, filters, searchScope],
    queryFn: async (): Promise<RegionTile[]> => {
      const [tagRes, rowsRes] = await Promise.all([
        // 이름만이 아니라 id까지 읽는다 — 타일이 곧 권역 필터이고, 목록 필터는 이름이 아니라
        // 태그 id로 거른다(같은 이름의 태그가 둘일 수 있다).
        supabase.from(REGION_TAG_TABLE).select('id, name').is('deleted_at', null),
        supabase.rpc(rpc, {
          p_keyword: keyword.trim() || null,
          p_limit: 5000,
          p_offset: 0,
          p_categories: filters.categories.length ? filters.categories : null,
          p_uncategorized: false,
          // 이 카드는 해외만 센다. 권역 축은 집계에서 빼야 타일이 필터로 동작한다.
          p_region_scope: ['OVERSEAS'],
          p_regions: null,
          p_countries: filters.countryIds.length ? filters.countryIds : null,
          p_search_email: searchScope.email,
          p_search_phone: searchScope.phone,
        }),
      ])
      if (tagRes.error) throw tagRes.error
      if (rowsRes.error) throw rowsRes.error

      // 집계는 태그 id로 센다 — 이름으로 뭉치면 동명 태그 둘이 한 칸에 합쳐져 그 칸을 눌렀을
      // 때 목록이 절반만 나온다. 권역이 비어 있는 행은 걸 id가 없으므로 '미지정' 한 칸에 모은다.
      const tags = (tagRes.data ?? []) as { id: string; name: string }[]
      const labelById = new Map(tags.map((tag) => [tag.id, tag.name]))
      const counts = new Map<string, number>(tags.map((tag) => [tag.id, 0]))
      let unset = 0
      for (const row of (rowsRes.data ?? []) as { region_tag_id?: string | null }[]) {
        if (!row.region_tag_id) {
          unset += 1
          continue
        }
        counts.set(row.region_tag_id, (counts.get(row.region_tag_id) ?? 0) + 1)
      }
      const tiles: RegionTile[] = [...counts.entries()].map(([id, count]) => ({
        id,
        label: labelById.get(id) ?? '알 수 없음',
        count,
      }))
      if (unset > 0) tiles.push({ id: null, label: '미지정', count: unset })
      return tiles.sort((a, b) => b.count - a.count)
    },
  })

  if (isPending) return <Card title="권역별 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>

  const total = data.reduce((sum, region) => sum + region.count, 0)

  return (
    <Card title="권역별 현황">
      <section aria-label="필터가 반영된 권역별 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <SummaryTile
          title="전체"
          eyebrow="해외 전체"
          value={total}
          unit="건"
          tone="primary"
          icon={<Globe2 aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={onClearRegions}
          selected={filters.regionIds.length === 0}
        />
        {data.map((region, index) => (
          <SummaryTile
            key={region.id ?? '미지정'}
            title={region.label}
            eyebrow="권역"
            value={region.count}
            unit="건"
            tone={TONES[index % TONES.length]}
            icon={<MapPin aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            onClick={region.id ? () => onToggleRegion(region.id as string) : undefined}
            selected={region.id ? filters.regionIds.includes(region.id) : undefined}
          />
        ))}
      </section>
    </Card>
  )
}
