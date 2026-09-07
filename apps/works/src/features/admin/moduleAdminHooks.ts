import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 템플릿별로 지금 배치되어 있는 모듈 인스턴스 수(꺼진 것 제외).
 *
 * ADMIN 모듈 관리 표의 '배치 N건'이 읽는 값이다. 이 숫자는 장식이 아니라 **안전장치**다 —
 * 끄기 전에 영향 범위가 같은 줄에 서 있어야 한다. 0건이면 마음 놓고 끄고 12건이면 한 번
 * 멈칫하는 것이 이 열의 목적이며, 확인창도 같은 수를 다시 말한다.
 *
 * 원장은 `program_modules` 하나다. 2026-09-03에 모듈 계열이 한 벌로 통합되어 소속은 테이블
 * 이름이 아니라 `entity_key`가 답하는데, 이 훅은 그때 함께 고쳐지지 않아 사라진 두 표
 * (`ma_program_modules`·`project_program_modules`)를 계속 조회하고 있었다 — 표를 개명하는
 * 마이그레이션이 그 이름으로 프론트를 전수 조사하지 않으면 이렇게 남는다.
 * 근거: docs/docs_planning/3_2_1_admin_module_registry.md §5.1
 */
export function useModuleInstanceCounts() {
  return useQuery({
    queryKey: ['module-instance-counts'],
    queryFn: async (): Promise<Map<string, number>> => {
      // 행을 내려받아 세는 이유는 템플릿별로 갈라 세야 하기 때문이다. 상한을 크게 두되
      // PostgREST 기본 1000행에 걸리지 않도록 명시한다.
      const { data, error } = await supabase
        .from('program_modules')
        .select('module_type')
        .eq('enabled', true)
        .limit(5000)
      // 조용히 0으로 답하지 않는다 — 빈 카탈로그와 조회 실패는 다른 문장이다.
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of data ?? []) {
        const key = row.module_type as string
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      return counts
    },
    staleTime: 60 * 1000,
  })
}
