import { useQuery } from '@tanstack/react-query'
import { Globe2, MapPin } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import type { GlobalFilterState, NetworkSearchScope } from '@/features/networks/filters'
import type { GlobalListScope } from '@/features/networks/globalHooks'
import { supabase } from '@/lib/supabase'

const TONES: SummaryTileTone[] = ['blue', 'purple', 'cyan', 'amber', 'peach', 'rose', 'lime', 'mint']

interface Props {
  scope: GlobalListScope
  keyword: string
  filters: GlobalFilterState
  searchScope: NetworkSearchScope
}

export function GlobalRegionFilteredSummary({ scope, keyword, filters, searchScope }: Props) {
  const { data = [], isPending } = useQuery({
    queryKey: ['networks', 'global', 'filtered-region-summary', scope, keyword, filters, searchScope],
    queryFn: async (): Promise<{ label: string; count: number }[]> => {
      const [tagRes, rowsRes] = await Promise.all([
        supabase.from('region_tags').select('name').is('deleted_at', null),
        supabase.rpc('global_network_entities', {
          p_keyword: keyword.trim() || null,
          p_mine: scope === 'mine',
          p_regions: null,
          p_countries: filters.countryIds.length ? filters.countryIds : null,
          p_categories: filters.categories.length ? filters.categories : null,
          p_search_email: searchScope.email,
          p_search_phone: searchScope.phone,
          p_limit: 5000,
          p_offset: 0,
        }),
      ])
      if (tagRes.error) throw tagRes.error
      if (rowsRes.error) throw rowsRes.error

      const counts = new Map<string, number>(
        ((tagRes.data ?? []) as { name: string }[]).map((tag) => [tag.name, 0]),
      )
      for (const row of (rowsRes.data ?? []) as { region_name?: string | null }[]) {
        const label = row.region_name?.trim() || '미지정'
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
    },
  })

  if (isPending) return <Card title="권역별 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>

  const total = data.reduce((sum, region) => sum + region.count, 0)

  return (
    <Card title="권역별 현황">
        <section aria-label="필터가 반영된 권역별 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
          <SummaryTile
            title="전체"
            eyebrow="글로벌 전체"
            value={total}
            unit="건"
            tone="primary"
            icon={<Globe2 aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          {data.map((region, index) => (
            <SummaryTile
              key={region.label}
              title={region.label}
              eyebrow="권역"
              value={region.count}
              unit="건"
              tone={TONES[index % TONES.length]}
              icon={<MapPin aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            />
          ))}
        </section>
    </Card>
  )
}
