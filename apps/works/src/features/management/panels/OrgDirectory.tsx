import { Spinner } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useDepartments,
  useDeptMembers,
  useEmployees,
} from '@/features/management/hooks'
import {
  buildTree,
  collapsibleIds,
  findTreeNode,
  toNodes,
} from '@/features/management/panels/departmentsMock'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'
import { OrgTreeNav } from '@/features/management/panels/OrgTreeNav'
import {
  buildSections,
  deptPathNames,
  totalMembers,
  type DirectoryMember,
} from '@/features/management/panels/directoryModel'
import { OrgDirectorySections } from '@/features/management/panels/OrgDirectorySections'
import { OrgScopeHeading } from '@/features/management/panels/OrgScopeHeading'

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

interface OrgDirectoryProps {
  /** 조회 대상 조직 버전(org_versions.id). */
  versionId: string
  /** 상위 헤더에서 내려오는 검색어(이름·직책·소속 경로). */
  keyword: string
  /** 인물 카드 클릭 시 이동할 임직원 상세 경로 prefix. */
  detailBasePath: string
}

/**
 * 조직도 조회 뷰 — 좌측 조직 트리로 범위를 고르고 우측에 그 조직의 사람을 얼굴로 편다.
 * OFFICE 부서 정보와 MANAGEMENT 조직 관리(조회 모드)가 이 화면 하나를 함께 쓴다.
 *
 * 같은 원장을 쓰는 트리-테이블(조직명·레벨·인원)이 "조직이 어떻게 짜였나"를 답한다면, 이 뷰는
 * "그 조직에 누가 있나"를 답한다. 그래서 소속은 부서명 한 토막이 아니라 최상위까지의 전체 경로로
 * 적는다 — 같은 이름의 실·팀이 여러 본부에 있어 한 토막만으로는 어디 소속인지 갈리지 않는다.
 *
 * 인력 배치는 선택 버전의 `dept_members`만 본다(`users.department_id` 미러는 활성 버전용이라
 * 과거·예정 버전에서 섞이면 안 된다).
 */
export function OrgDirectory({ versionId, keyword, detailBasePath }: OrgDirectoryProps) {
  const navigate = useNavigate()
  const { data: deptRows, isLoading: deptLoading } = useDepartments(false, versionId)
  const { data: memberRows, isLoading: memberLoading } = useDeptMembers(versionId)
  const { data: empRows, isLoading: empLoading } = useEmployees()
  // 이름 옆 호칭은 직급·직책 태그 원장의 표기 방식이 정한다(코드에 목록을 박지 않는다).
  const jobTitle = useJobTitleLabel()

  const nodes = useMemo(() => toNodes(deptRows ?? []), [deptRows])
  const tree = useMemo(() => buildTree(nodes), [nodes])

  // 부서 id → 직접 소속 인물. 임직원 목록이 이름 순이라 카드 순서도 이름 순이 된다.
  const membersByDept = useMemo(() => {
    const placement = new Map<string, string>()
    for (const r of memberRows ?? []) placement.set(r.user_id, r.department_id)
    const m = new Map<string, DirectoryMember[]>()
    for (const e of empRows ?? []) {
      const deptId = placement.get(e.id)
      if (!deptId) continue
      const profile = e.profile ?? {}
      const rank = str(profile.rank)
      const list = m.get(deptId) ?? []
      list.push({
        id: e.id,
        name: e.name,
        photo: str(profile.photo) || null,
        title: jobTitle(rank, str(profile.position)),
        rank,
      })
      m.set(deptId, list)
    }
    return m
  }, [memberRows, empRows, jobTitle])

  const [selectedId, setSelectedId] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 최초 진입·버전 전환 시 최상위 조직을 기점으로 잡는다(선택이 트리에서 사라진 경우 포함).
  useEffect(() => {
    if (!tree.length) return
    if (selectedId && findTreeNode(tree, selectedId)) return
    setSelectedId(tree[0]!.id)
  }, [tree, selectedId])

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selected = selectedId ? findTreeNode(tree, selectedId) : null
  const sections = useMemo(
    () =>
      selectedId ? buildSections({ nodes, tree, rootId: selectedId, membersByDept, keyword }) : [],
    [nodes, tree, selectedId, membersByDept, keyword],
  )

  if (
    (deptLoading && !deptRows) ||
    (memberLoading && !memberRows) ||
    (empLoading && !empRows)
  ) {
    return <Spinner />
  }

  return (
    <div className="flex gap-5">
      <OrgTreeNav
        tree={tree}
        selectedId={selectedId}
        collapsed={collapsed}
        onSelect={setSelectedId}
        onToggle={toggle}
        onExpandAll={() => setCollapsed(new Set())}
        onCollapseAll={() => setCollapsed(collapsibleIds(tree))}
        allExpanded={collapsed.size === 0}
      />

      <div className="min-w-0 flex-1 space-y-4">
        {/* 선택 조직(전체 경로) + 표시 인원(하위 포함). */}
        <OrgScopeHeading
          names={selected ? deptPathNames(nodes, selected.id) : []}
          count={totalMembers(sections)}
        />

        {sections.length === 0 ? (
          <p className="py-10 text-center text-body text-gray-500">
            {keyword.trim() ? '검색 결과가 없습니다.' : '이 조직에 배치된 인력이 없습니다.'}
          </p>
        ) : (
          <OrgDirectorySections
            sections={sections}
            onSelectMember={(m) => navigate(`${detailBasePath}/${m.id}`)}
          />
        )}
      </div>
    </div>
  )
}
