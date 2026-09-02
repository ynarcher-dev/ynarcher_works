import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 템플릿별로 지금 배치되어 있는 모듈 인스턴스 수(사업 3종 합산, 꺼진 것 제외).
 *
 * ADMIN 모듈 관리 표의 '배치 N건'이 읽는 값이다. 이 숫자는 장식이 아니라 **안전장치**다 —
 * 끄기 전에 영향 범위가 같은 줄에 서 있어야 한다. 0건이면 마음 놓고 끄고 12건이면 한 번
 * 멈칫하는 것이 이 열의 목적이며, 확인창도 같은 수를 다시 말한다.
 *
 * 원장이 셋(program_modules / ma_ / project_)이라 세 번 세어 합친다. head count로 세는
 * 이유는 행을 내려받아 세면 PostgREST 1000행 상한에 걸려 조용히 작은 수를 답하기 때문이다.
 * 근거: docs/docs_planning/3_2_1_admin_module_registry.md §5.1
 */

const TABLES = ['program_modules', 'ma_program_modules', 'project_program_modules'] as const

export function useModuleInstanceCounts() {
  return useQuery({
    queryKey: ['module-instance-counts'],
    queryFn: async (): Promise<Map<string, number>> => {
      const results = await Promise.all(
        TABLES.map((t) =>
          supabase.from(t).select('module_type').eq('enabled', true).limit(5000),
        ),
      )
      const counts = new Map<string, number>()
      for (const { data, error } of results) {
        // 한 원장을 못 읽었다고 나머지 숫자까지 버리지 않는다 — 다만 조용히 0으로 답하지도
        // 않도록 오류는 올려 보낸다(빈 카탈로그와 조회 실패는 다른 문장이다).
        if (error) throw error
        for (const row of data ?? []) {
          const key = row.module_type as string
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      return counts
    },
    staleTime: 60 * 1000,
  })
}
