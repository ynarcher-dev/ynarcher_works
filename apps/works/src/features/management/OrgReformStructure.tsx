import { Badge, Button, ListToolbar } from '@ynarcher/ui'
import { Layers, Trash2 } from 'lucide-react'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useOrgEditing } from '@/features/management/orgEditHooks'
import { DeletedDeptModal } from '@/features/management/panels/DeletedDeptModal'
import { OrgEditWorkspace } from '@/features/management/panels/OrgEditWorkspace'
import { OrgLevelModal } from '@/features/management/panels/OrgLevelModal'

interface OrgReformStructureProps {
  /** 설계 중인 초안 버전(org_versions.id). */
  versionId: string
  /** 오늘의 유효 버전(인력 배치를 users.department_id로 미러할지 판단). */
  activeVersionId: string | null
}

export interface OrgReformStructureHandle {
  save: () => Promise<void>
  cancel: () => void
}

/**
 * 조직 개편 초안의 구조 설계부 — 조직 관리의 직접 편집과 같은 구성을 쓴다.
 *
 * 두 화면이 하는 일(조직을 짜고 사람을 배치한다)이 같은데 다루는 방식이 다르면, 개편 때만
 * 쓰는 조작을 따로 익혀야 한다. 다른 것은 대상 버전뿐이라 화면은 같게 두고 버전만 갈아 끼운다.
 *
 * 저장/폐기·발효일 같은 초안 자체의 결정은 페이지가 갖고, 여기는 구조만 맡는다.
 */
export const OrgReformStructure = forwardRef<OrgReformStructureHandle, OrgReformStructureProps>(
function OrgReformStructure({ versionId, activeVersionId }, ref) {
  const editing = useOrgEditing(versionId, activeVersionId)
  const [levelOpen, setLevelOpen] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
  const [keyword, setKeyword] = useState('')

  useImperativeHandle(ref, () => ({ save: editing.save, cancel: editing.cancel }))

  return (
    <div className="space-y-4">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="조직명 검색"
        filters={
          <>
            <Button variant="outline" onClick={() => setLevelOpen(true)}>
              <Layers size={14} /> 조직 레벨
            </Button>
            <Button variant="outline" onClick={() => setRemovedOpen(true)}>
              <Trash2 size={14} /> 삭제된 조직
              {editing.removed.length > 0 && <Badge tone="neutral">{editing.removed.length}</Badge>}
            </Button>
          </>
        }
      />

      <OrgEditWorkspace editing={editing} keyword={keyword} />

      <OrgLevelModal open={levelOpen} onClose={() => setLevelOpen(false)} editing={editing} />
      <DeletedDeptModal open={removedOpen} onClose={() => setRemovedOpen(false)} editing={editing} />
    </div>
  )
})
