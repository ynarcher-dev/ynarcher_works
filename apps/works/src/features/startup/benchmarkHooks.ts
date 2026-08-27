import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BENCHMARK_TAB } from '@/config/navigation'
import { supabase } from '@/lib/supabase'
import type { EntityRow } from '@/features/networks/hooks'

/**
 * 한 화면에서 나란히 세울 수 있는 기업 수.
 *
 * 폭으로는 더 들어가지만 넷을 넘기면 좌우 스캔이 안 된다 — 그때부터는 비교가 아니라 목록이고,
 * 목록은 스타트업 DB의 정렬·필터가 답한다. 벤치마크(피어그룹) 관행도 3~5사다.
 */
export const BENCHMARK_MAX = 4

/** 비교군·기준연도를 담은 벤치마크 화면 주소. 상세페이지 진입점이 이 함수로 링크를 만든다. */
export function benchmarkPath(ids: string[], year?: number | null): string {
  const params = new URLSearchParams({ tab: BENCHMARK_TAB })
  if (ids.length > 0) params.set('ids', ids.slice(0, BENCHMARK_MAX).join(','))
  if (year != null) params.set('year', String(year))
  return `/startup?${params.toString()}`
}

export interface BenchmarkSelection {
  /** 비교 대상 기업 id(왼쪽부터의 열 순서). */
  ids: string[]
  /** 기준연도. null이면 각사 최신 실적을 쓴다. */
  year: number | null
  add: (id: string) => void
  remove: (id: string) => void
  setYear: (year: number | null) => void
  clear: () => void
}

/**
 * 비교군을 주소(`?ids=`)에 둔다.
 *
 * 컴포넌트 상태에 담으면 화면을 새로고침하거나 링크를 넘기는 순간 비교군이 사라진다.
 * 벤치마크는 "이 셋을 이렇게 놓고 봤다"를 그대로 건네는 일이 잦은 화면이라, 무엇을 비교하는지가
 * 주소에 남아야 한다 — 뒤로가기도 자연히 직전 비교군으로 돌아간다.
 */
export function useBenchmarkSelection(): BenchmarkSelection {
  const [params, setParams] = useSearchParams()

  const ids = useMemo(() => {
    const raw = params.get('ids') ?? ''
    const list = raw.split(',').map((v) => v.trim()).filter(Boolean)
    return [...new Set(list)].slice(0, BENCHMARK_MAX)
  }, [params])

  const rawYear = Number(params.get('year'))
  const year = Number.isFinite(rawYear) && rawYear > 0 ? rawYear : null

  // 탭 키를 잃지 않도록 기존 파라미터 위에 덮어쓴다. 히스토리는 남기지 않는다 —
  // 열을 하나 더하고 빼는 일마다 뒤로가기 한 칸이 쌓이면 목록으로 돌아가기가 멀어진다.
  const patch = useCallback(
    (next: { ids?: string[]; year?: number | null }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('tab', BENCHMARK_TAB)
          if (next.ids !== undefined) {
            if (next.ids.length > 0) p.set('ids', next.ids.join(','))
            else p.delete('ids')
          }
          if (next.year !== undefined) {
            if (next.year != null) p.set('year', String(next.year))
            else p.delete('year')
          }
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return {
    ids,
    year,
    add: (id) => {
      if (ids.includes(id) || ids.length >= BENCHMARK_MAX) return
      patch({ ids: [...ids, id] })
    },
    remove: (id) => patch({ ids: ids.filter((v) => v !== id) }),
    setYear: (y) => patch({ year: y }),
    clear: () => patch({ ids: [], year: null }),
  }
}

/**
 * 비교 대상 기업들을 한 번에 읽는다(id 순서 유지).
 *
 * 좌우 비교 카드 시절에는 비교기업 1곳당 단건 조회(`useEntity`)를 걸었는데, 열이 넷이 되면
 * 그대로 왕복 넷이 된다. 목록 조회 한 번(`in`)으로 모으고 정렬만 화면 순서에 맞춘다.
 */
export function useBenchmarkCompanies(ids: string[]) {
  const key = ids.join(',')
  return useQuery({
    queryKey: ['startup', 'benchmark', key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<EntityRow[]> => {
      const { data, error } = await supabase
        .from('startups')
        .select('*')
        .in('id', ids)
        .is('deleted_at', null)
      if (error) throw error
      const rows = (data ?? []) as EntityRow[]
      const byId = new Map(rows.map((r) => [r.id, r]))
      return ids.map((id) => byId.get(id)).filter(Boolean) as EntityRow[]
    },
  })
}
