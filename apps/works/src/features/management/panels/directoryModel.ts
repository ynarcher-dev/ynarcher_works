/**
 * 조직도 디렉터리(부서 정보) 파생 모델 — 트리·배치·임직원을 화면이 그릴 "섹션 목록"으로 접는다.
 * 조직 트리 자체의 원천 헬퍼는 `panels/departmentsMock`가 계속 갖고, 여기서는 인물 카드 배치를
 * 만드는 데 필요한 변환만 둔다.
 */
import {
  ancestorPath,
  findTreeNode,
  type DeptNode,
  type DeptTreeNode,
} from '@/features/management/panels/departmentsMock'

/** 조직도 디렉터리의 인물 카드 한 장. */
export interface DirectoryMember {
  id: string
  name: string
  /** 프로필 사진(profile.photo). 없으면 이니셜 폴백. */
  photo: string | null
  /** 카드에 찍는 호칭(`jobTitleLabel`). 둘 다 없으면 빈 문자열 — 카드는 자리만 비워 둔다. */
  title: string
  /**
   * 직급 원문(profile.rank). 화면에 직접 찍지 않고 검색에만 쓴다 — 호칭이 '실장'이어도
   * '수석'으로 사람을 찾는 용법이 있어서, 표기에서 빠진 값도 검색에는 남겨 둔다.
   */
  rank: string
}

/** 한 부서(직접 소속)의 인물 묶음 — 화면의 섹션 하나에 대응한다. */
export interface DirectorySection {
  deptId: string
  /** 루트→해당 부서 전체 경로(예: '와이앤아처 > 지원본부 > 경영지원 1실'). */
  path: string
  members: DirectoryMember[]
}

/** 자신 + 하위 전체를 트리 순서(DFS)로 편다 — 섹션 순서를 조직도 순서와 일치시킨다. */
export function flattenSubtree(node: DeptTreeNode): DeptTreeNode[] {
  return [node, ...node.children.flatMap(flattenSubtree)]
}

/** 루트→해당 부서의 이름 배열. 경로를 조각으로 다뤄야 하는 표기(머리글)의 단일 기준. */
export function deptPathNames(nodes: DeptNode[], deptId: string): string[] {
  return ancestorPath(nodes, deptId).map((n) => n.name)
}

/** 부서 전체 경로 문자열(루트부터 '>'로 이음). 한 줄로 적는 소속 표기의 단일 기준. */
export function deptPath(nodes: DeptNode[], deptId: string): string {
  return deptPathNames(nodes, deptId).join(' > ')
}

export interface BuildSectionsInput {
  nodes: DeptNode[]
  tree: DeptTreeNode[]
  /** 좌측 트리에서 선택한 부서 — 표시 범위의 기점(자신 + 하위 전체). */
  rootId: string
  /** 부서 id → 직접 소속 인물(이름 순). */
  membersByDept: Map<string, DirectoryMember[]>
  keyword: string
}

/**
 * 선택 부서와 그 하위 전체를 섹션 목록으로 편다. 인원이 0인 부서는 섹션을 만들지 않는다 —
 * 빈 머리글만 늘어놓으면 사람을 찾는 화면에서 눈이 걸릴 곳이 늘어난다.
 * 하위를 뺄 선택지를 두지 않는 이유는 좌측 트리가 이미 그 역할을 하기 때문이다 — 하위를 빼고
 * 싶으면 말단 조직을 고르면 되고, 토글을 따로 두면 같은 일을 두 곳에서 하게 된다.
 * 검색어는 이름·호칭·직급뿐 아니라 소속 경로에도 걸린다(소속명으로 부서 전체를 찾는 용법).
 */
export function buildSections({
  nodes,
  tree,
  rootId,
  membersByDept,
  keyword,
}: BuildSectionsInput): DirectorySection[] {
  const root = findTreeNode(tree, rootId)
  if (!root) return []
  const scope = flattenSubtree(root)
  const q = keyword.trim().toLowerCase()

  const sections: DirectorySection[] = []
  for (const node of scope) {
    const path = deptPath(nodes, node.id)
    const all = membersByDept.get(node.id) ?? []
    const members = q
      ? all.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.title.toLowerCase().includes(q) ||
            m.rank.toLowerCase().includes(q) ||
            path.toLowerCase().includes(q),
        )
      : all
    if (members.length) sections.push({ deptId: node.id, path, members })
  }
  return sections
}

/** 섹션 전체 인원 합계(헤더 건수). */
export function totalMembers(sections: DirectorySection[]): number {
  return sections.reduce((sum, s) => sum + s.members.length, 0)
}
