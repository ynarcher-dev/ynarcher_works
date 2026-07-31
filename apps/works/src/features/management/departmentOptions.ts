import { useMemo } from 'react'
import {
  useAllDepartments,
  useDepartments,
  type Department,
} from '@/features/management/orgHooks'
import {
  ancestorPath,
  buildTree,
  toNodes,
  type DeptTreeNode,
} from '@/features/management/panels/departmentsMock'

/**
 * 부서 선택지 — 조직도(상위→하위)를 드롭다운 한 줄로 접는 단일 기준.
 *
 * 라벨을 이름이 아니라 **루트→자신 전체 경로**로 두는 이유: 조직도에는 같은 이름의 말단이 여럿이라
 * ('1팀'이 본부마다 있다) 이름만 나열하면 상위·하위가 뒤섞인 목록이 되어 어느 것을 고르는지 알 수 없다.
 * 들여쓰기로는 모자란다 — 네이티브 select는 닫히면 고른 option의 글자만 남아 상위가 사라지기 때문에,
 * 경로가 라벨 안에 있어야 선택한 뒤에도 상위가 딸려온다.
 */
export interface DepartmentOption {
  id: string
  /** 루트→자신 전체 경로(예: '와이앤아처 > AC본부 > 스케일업그룹 > 1팀'). */
  label: string
  /** 자기 이름만. 이미 상위 맥락이 잡힌 자리(부서 트리 안 등)에서 짧게 적을 때 쓴다. */
  name: string
  /** 루트=0. 목록 자체가 조직도 순서(DFS)라 부모 바로 아래에 자식이 온다. */
  depth: number
  /**
   * 버전 간 동일 부서를 잇는 계보 id. 부서를 **조건**으로 쓰는 자리(목록 필터)의 값은 이것이다 —
   * 부서 id는 조직 버전마다 새로 발급되므로, id로 거르면 개편 전 단계에 같은 부서를 지정한 사업이
   * 검색에서 통째로 빠진다.
   */
  lineage: string
}

/** 경로 구분자. 조직도 디렉터리 표기(directoryModel.deptPath)와 같은 기호를 쓴다. */
const PATH_SEP = ' > '

/**
 * 부서 원장 행 → 선택지 목록. 조직도 순서(DFS, 형제는 sort_order)로 편다.
 * 부모가 이 버전 목록에 없어 트리에 못 붙은 부서도 누락 없이 뒤에 붙인다 —
 * 선택지에서 빠지면 그 부서를 아예 지정할 수 없게 된다.
 */
export function buildDepartmentOptions(rows: Department[]): DepartmentOption[] {
  const nodes = toNodes(rows)
  const out: DepartmentOption[] = []

  const walk = (list: DeptTreeNode[], trail: string[]) => {
    for (const node of list) {
      const path = [...trail, node.name]
      out.push({
        id: node.id,
        label: path.join(PATH_SEP),
        name: node.name,
        depth: path.length - 1,
        lineage: node.lineageId,
      })
      walk(node.children, path)
    }
  }
  walk(buildTree(nodes), [])

  for (const node of nodes) {
    if (node.deleted || out.some((o) => o.id === node.id)) continue
    const path = ancestorPath(nodes, node.id).map((a) => a.name)
    out.push({
      id: node.id,
      label: path.join(PATH_SEP),
      name: node.name,
      depth: Math.max(0, path.length - 1),
      lineage: node.lineageId,
    })
  }
  return out
}

/**
 * 사람 옆에 한 줄로 붙는 소속 표기(예: 'AC본부 · 1팀').
 * 소속→루트 경로에서 인사 미노출(hr_hidden) 부서를 빼고 가장 구체적인 2개를 상위 · 하위 순으로 적는다.
 * 선택지 라벨(전체 경로)과 달리 사람 옆에는 짧게 적는다 — 이름 뒤에 법인부터 다 붙이면 이름이 밀린다.
 */
export function affiliationLabel(rows: Department[], deptId: string | null): string {
  const byId = new Map(rows.map((d) => [d.id, d]))
  const chain: string[] = []
  for (let cur = deptId; cur && byId.has(cur); cur = byId.get(cur)!.parent_id) {
    if (!byId.get(cur)!.hr_hidden) chain.push(byId.get(cur)!.name)
  }
  const team = chain.length > 1 ? chain[0]! : ''
  const dept = chain.length > 1 ? chain[1]! : chain[0] ?? ''
  return [dept, team].filter(Boolean).join(' · ')
}

/**
 * 부서를 값처럼 한 칸에 적을 때의 표기 — **최상위(법인)만 뺀 전체 경로**
 * (예: '지원본부 > 경영지원1실', '와이앤아처 > AC본부 > 밸류커넥트그룹 > 3팀' → 'AC본부 > 밸류커넥트그룹 > 3팀').
 *
 * 중간 상위를 생략하지 않는 이유: 조직도는 본부마다 같은 이름의 말단이 있어('1팀', '1실'),
 * 어디까지 접든 접는 순간 어느 조직인지 가릴 수 없는 쌍이 생긴다. 최상위 법인만 빼는 것은
 * 그 반대다 — 모든 부서에 똑같이 붙어 구분에 전혀 기여하지 않으면서 칸만 먹는다.
 * 최상위 부서 자체가 지정된 경우에는 뺄 것이 없으므로 그 이름을 그대로 적는다.
 *
 * 선택지 라벨(buildDepartmentOptions, 법인 포함 전체 경로)·사람 옆 소속 표기(affiliationLabel)와
 * 구분한다 — 고르는 자리는 법인까지 다 보여야 하고, 인사 표기는 hr_hidden을 걷어낸 별개 관점이다.
 */
export function deptPathLabel(rows: Department[], deptId: string | null): string {
  if (!deptId) return ''
  const byId = new Map(rows.map((d) => [d.id, d]))
  const chain: string[] = []
  // parent_id가 꼬여 순환이 생겨도 화면이 멎지 않도록 방문 기록으로 끊는다.
  const seen = new Set<string>()
  for (
    let cur: string | null = deptId;
    cur && byId.has(cur) && !seen.has(cur);
    cur = byId.get(cur)!.parent_id
  ) {
    seen.add(cur)
    chain.unshift(byId.get(cur)!.name)
  }
  return (chain.length > 1 ? chain.slice(1) : chain).join(PATH_SEP)
}

/**
 * deptId(자신 포함)에서 조직도를 거슬러 올라가며 scope에 처음 걸리는 부서 id. 없으면 null.
 *
 * "어떤 부서 묶음에 이 사람이 속하는가"를 묻는 자리(사업 담당자 배치)의 단일 기준이다. 소속을
 * 말단끼리만 대조하면 안 된다 — 사업이 '지원본부'를 지정했는데 사람은 '지원본부 > 총무팀'에
 * 배치되어 있으면, 명백히 그 본부 사람인데도 후보에서 빠진다. 반대로 상위를 무한정 인정하면
 * 법인 전체가 걸리므로, **가장 가까운** 지정 부서 하나로 못박는다.
 */
export function nearestScopedAncestor(
  rows: Department[],
  deptId: string | null,
  scope: Set<string>,
): string | null {
  const byId = new Map(rows.map((d) => [d.id, d]))
  // parent_id가 꼬여 순환이 생겨도 화면이 멎지 않도록 방문 기록으로 끊는다.
  const seen = new Set<string>()
  for (let cur = deptId; cur && byId.has(cur) && !seen.has(cur); cur = byId.get(cur)!.parent_id) {
    if (scope.has(cur)) return cur
    seen.add(cur)
  }
  return null
}

/**
 * 조직 버전을 가리지 않는 부서 표기 조회. 사업 목록처럼 여러 단계(org 버전)의 부서 id가 한 화면에
 * 섞여 들어오는 자리에서 쓴다 — 버전 스코프 훅(useDepartmentOptions)은 다른 버전의 부서를 못 읽어
 * 이름이 빈칸으로 남는다.
 */
export function useDepartmentLabels() {
  const { data } = useAllDepartments()
  return useMemo(() => {
    const rows = data ?? []
    const byId = new Map(rows.map((d) => [d.id, d]))
    return {
      /** 부서 id → 최상위를 뺀 경로 표기. 아직 못 읽었거나 없는 id면 fallback. */
      pathLabelOf: (id: string | null, fallback = '') => deptPathLabel(rows, id) || fallback,
      /** 부서 id → 계보 id. 버전마다 id가 갈리므로 "같은 부서"는 이 값으로 센다. */
      lineageOf: (id: string) => byId.get(id)?.lineage_id ?? id,
    }
  }, [data])
}

/**
 * 부서 선택지 + 라벨 조회. versionId 미지정 시 오늘의 유효 버전(useDepartments 규칙)을 따른다.
 * 부서를 고르는 화면(사업 부서 구성·담당자 배치·임직원 소속)은 모두 이 훅 하나를 경유한다.
 */
export function useDepartmentOptions(versionId?: string) {
  const { data } = useDepartments(false, versionId)
  return useMemo(() => {
    const rows = data ?? []
    const options = buildDepartmentOptions(rows)
    const byId = new Map(options.map((o) => [o.id, o]))
    return {
      options,
      /** 부서 id → 전체 경로 라벨. 아직 못 읽었거나 없는 id면 fallback. */
      labelOf: (id: string, fallback = '') => byId.get(id)?.label ?? fallback,
      /** 부서 id → 사람 옆에 붙일 짧은 소속 표기. */
      affiliationOf: (id: string | null) => affiliationLabel(rows, id),
    }
  }, [data])
}
