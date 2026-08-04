/**
 * 조직 뎁스(티어) → 목록 컬럼. 사람이 서는 표는 모두 이 눈금을 쓴다(인사 관리·근태 관리).
 *
 * 소속을 'AC본부 · 1팀' 한 칸으로 적지 않고 뎁스마다 칸을 나누는 이유는 정렬과 훑기다 —
 * 한 칸에 이어 붙이면 본부로 묶어 보거나 팀만 눈으로 따라가는 일이 되지 않는다.
 *
 * 컬럼 수와 헤더는 코드가 아니라 조직 관리가 정한다. 레벨을 늘리면 칸이 늘고, 병렬 레벨(같은
 * tier의 본부·실)은 한 칸으로 합쳐 '본부 / 실'로 적힌다. 조직은 버전(개편 단계)마다 눈금이
 * 다르므로 언제나 오늘의 유효 버전을 기준으로 읽는다 — 버전을 섞으면 어제 없던 칸이 생긴다.
 */
import { useMemo } from 'react'
import {
  activeOrgVersionId,
  useDepartments,
  useOrgLevels,
  useOrgVersions,
} from '@/features/management/hooks'
import {
  buildTiers,
  resolveByTier,
  toNodes,
  type OrgTier,
} from '@/features/management/panels/departmentsMock'

/** 티어에 해당하는 조상이 없는 칸의 값(resolveByTier의 약속). */
export const TIER_EMPTY = '-'

export interface OrgTiers {
  /** 상위→하위 순 티어 목록. 그대로 컬럼이 된다. */
  tiers: OrgTier[]
  /** 부서 id → 티어별 소속명({ [tier]: 이름 | '-' }). 부서당 한 번만 풀고 캐시한다. */
  valuesOf: (deptId: string | null) => Record<number, string>
  /** 부서 id → 그 사람이 걸치는 소속명들(빈 칸 제외). 소속을 조건으로 쓰는 자리가 쓴다. */
  namesOf: (deptId: string | null) => string[]
}

export function useOrgTiers(): OrgTiers {
  const { data: versionRows } = useOrgVersions()
  const activeVersionId = useMemo(
    () => (versionRows ? activeOrgVersionId(versionRows) : null),
    [versionRows],
  )
  const { data: depts } = useDepartments(false, activeVersionId ?? undefined)
  const { data: levels } = useOrgLevels(activeVersionId ?? undefined)

  return useMemo(() => {
    const nodes = toNodes(depts ?? [])
    const tiers = buildTiers(levels ?? [])
    // 한 표에 같은 부서가 수십 번 오므로 조상 경로를 부서당 한 번만 푼다.
    const cache = new Map<string, Record<number, string>>()
    const valuesOf = (deptId: string | null): Record<number, string> => {
      const key = deptId ?? ''
      let v = cache.get(key)
      if (!v) {
        v = resolveByTier(nodes, tiers, deptId)
        cache.set(key, v)
      }
      return v
    }
    return {
      tiers,
      valuesOf,
      namesOf: (deptId) =>
        Object.values(valuesOf(deptId)).filter((name) => name && name !== TIER_EMPTY),
    }
  }, [depts, levels])
}
