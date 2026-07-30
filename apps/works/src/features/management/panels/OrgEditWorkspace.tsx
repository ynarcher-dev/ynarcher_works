import { Spinner } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import type { OrgEditing } from '@/features/management/orgEditHooks'
import { DeptMemberPicker } from '@/features/management/panels/DeptMemberPicker'
import { findTreeNode } from '@/features/management/panels/departmentsMock'
import { OrgEditTree } from '@/features/management/panels/OrgEditTree'
import { OrgScopeHeading } from '@/features/management/panels/OrgScopeHeading'

interface OrgEditWorkspaceProps {
  editing: OrgEditing
  /** 툴바 검색어(편집 모드에서는 조직명 기준으로 좌측 트리를 좁힌다). */
  keyword: string
}

/**
 * 직접 편집의 좌우 2단 — 좌측에서 조직을 짜고, 우측에서 그 조직에 사람을 넣는다.
 * 조회 모드(부서 정보)와 같은 자리·같은 머리글을 쓰되 하는 일만 편집으로 바뀐다.
 */
export function OrgEditWorkspace({ editing, keyword }: OrgEditWorkspaceProps) {
  const [selectedId, setSelectedId] = useState('')

  // 최초 진입·버전 전환 시 최상위 조직을 배치 대상으로 잡는다(선택이 사라진 경우 포함).
  useEffect(() => {
    if (!editing.tree.length) return
    if (selectedId && findTreeNode(editing.tree, selectedId)) return
    setSelectedId(editing.tree[0]!.id)
  }, [editing.tree, selectedId])

  if (editing.loading) return <Spinner />

  const selected = selectedId ? findTreeNode(editing.tree, selectedId) : null
  const memberCount = selected ? (editing.membersByDept.get(selected.id) ?? []).length : 0

  return (
    <div className="flex gap-5">
      <OrgEditTree
        editing={editing}
        selectedId={selectedId}
        onSelect={setSelectedId}
        keyword={keyword}
      />

      <div className="min-w-0 flex-1 space-y-4">
        {/* 머리글의 건수는 이 조직에 "직접" 속한 인원이다 — 배치는 직접 소속만 다루기 때문이다. */}
        <OrgScopeHeading
          names={selected ? editing.pathNamesOf(selected.id) : []}
          count={memberCount}
        />

        {selected ? (
          <DeptMemberPicker editing={editing} deptId={selected.id} />
        ) : (
          <p className="py-10 text-center text-body text-gray-500">
            왼쪽에서 조직을 먼저 만들어 주세요.
          </p>
        )}
      </div>
    </div>
  )
}
