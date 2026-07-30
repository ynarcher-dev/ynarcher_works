import { Badge, Button, ListToolbar, Modal, Spinner } from '@ynarcher/ui'
import { Layers, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  activeOrgVersionId,
  useOrgDraftVersions,
  useOrgVersions,
  useUpdateOrgVersion,
} from '@/features/management/hooks'
import { useOrgEditing } from '@/features/management/orgEditHooks'
import { DeletedDeptModal } from '@/features/management/panels/DeletedDeptModal'
import { OrgDirectory } from '@/features/management/panels/OrgDirectory'
import { OrgEditWorkspace } from '@/features/management/panels/OrgEditWorkspace'
import { OrgLevelModal } from '@/features/management/panels/OrgLevelModal'
import { OrgVersionBar } from '@/features/management/panels/OrgVersionBar'

/** 조직 개편 설계 페이지 경로. 초안이 있으면 그 초안을 열고, 없으면 생성 폼으로 들어간다. */
const REFORM_PATH = '/management/org-reform'

/**
 * MANAGEMENT 조직 관리 — 조직 버전 선택 + 조직도 직접 편집 + 조직 개편 진입.
 *
 * 조회 화면은 OFFICE 부서 정보와 같은 것(`OrgDirectory`)을 그대로 쓴다 — 같은 조직을 보는 일에
 * 워크스페이스별 방언을 두지 않는다. 조직 관리가 더 갖는 것은 "고칠 수 있다"는 것뿐이라,
 * 편집판은 직접 편집을 켰을 때만 나온다.
 *
 * 편집 모드의 자리 배치는 하는 일의 빈도를 따른다 — 자주 하는 일(조직 짜기·인력 배치)은 좌우
 * 2단 본문에, 가끔 하는 일(조직 레벨 정의·삭제 조직 복원)은 조직 운영 기간 옆 진입점 뒤 모달에.
 *
 * 반대로 OFFICE 화면(OfficeDepartmentsPanel)이 이 패널을 재사용하지는 않는다. 편집 상태·개편
 * 동선이 조회 화면에 얹히면 "숨긴 기능"이 늘어나기만 한다 — 공유하는 것은 부품이다.
 */
export function DepartmentsPanel() {
  const navigate = useNavigate()
  const { data: versionRows, isLoading: versionLoading } = useOrgVersions()
  const { data: draftRows } = useOrgDraftVersions()
  const versions = useMemo(() => versionRows ?? [], [versionRows])
  const activeVersionId = useMemo(() => activeOrgVersionId(versions), [versions])
  // 설계 중인 개편 초안(있으면 배너로 복귀 동선을 준다).
  const draft = (draftRows ?? [])[0] ?? null

  const [versionId, setVersionId] = useState('')
  useEffect(() => {
    if (!versionId && versions.length) setVersionId(activeVersionId ?? versions[0]!.id)
  }, [versions, activeVersionId, versionId])

  const [editMode, setEditMode] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const [levelOpen, setLevelOpen] = useState(false)
  const [removedOpen, setRemovedOpen] = useState(false)
  const [keyword, setKeyword] = useState('')

  // 편집 세션은 툴바(저장·취소·두 모달)와 본문이 함께 쓰므로 화면 최상단에서 연다.
  const editing = useOrgEditing(versionId, activeVersionId)

  const updateVersion = useUpdateOrgVersion()
  const deleteVersion = async (id: string) => {
    await updateVersion.mutateAsync({ id, values: { deleted_at: new Date().toISOString() } })
    if (activeVersionId) {
      await updateVersion.mutateAsync({ id: activeVersionId, values: { effective_to: null } })
    }
    setVersionId(activeVersionId ?? '')
    setEditMode(false)
  }

  const selectVersion = (id: string) => {
    editing.cancel()
    setVersionId(id)
    setEditMode(false)
  }

  const saveEdit = async () => {
    await editing.save()
    setEditMode(false)
  }

  const cancelEdit = () => {
    editing.cancel()
    setEditMode(false)
  }

  if ((versionLoading && !versionRows) || !versionId) {
    return <Spinner />
  }

  return (
    <div className="space-y-4">
      {/* 검색·버전·액션은 모두 "무엇을 어떻게 보여줄지"를 정하는 같은 층이라 한 줄에 둔다. */}
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={editMode ? '조직명 검색' : '이름, 직급·직책, 소속 검색'}
        filters={
          <>
            <OrgVersionBar
              versions={versions}
              selectedId={versionId}
              activeId={activeVersionId}
              onSelect={selectVersion}
              showClone={false}
              onDelete={deleteVersion}
              deleting={updateVersion.isPending}
            />
            {/* 조직 레벨·삭제 조직은 이 버전에 딸린 설정이라 버전 선택 바로 옆에 둔다. */}
            {editMode && (
              <>
                <Button variant="outline" onClick={() => setLevelOpen(true)}>
                  <Layers size={14} /> 조직 레벨
                </Button>
                <Button variant="outline" onClick={() => setRemovedOpen(true)}>
                  <Trash2 size={14} /> 삭제된 조직
                  {editing.removed.length > 0 && (
                    <Badge tone="neutral">{editing.removed.length}</Badge>
                  )}
                </Button>
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <Button onClick={() => void saveEdit()}>저장</Button>
                <Button variant="outline" onClick={cancelEdit}>
                  취소
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setWarnOpen(true)}>
                  <Pencil size={14} /> 직접 편집
                </Button>
                <Button onClick={() => navigate(REFORM_PATH)}>
                  {draft ? '개편 설계 이어서' : '조직 개편'}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/*
        모드 안내문은 두지 않는다 — 무엇을 할 수 있는지는 툴바의 버튼이, 지금 무엇을 하는 중인지는
        화면 자체(저장/취소가 떠 있는지)가 이미 말한다.
      */}
      {/* 설계 중인 초안은 어느 버전에도 발효되지 않아 아래 조직도에 나타나지 않는다 — 복귀 동선을 준다. */}
      {draft && !editMode && (
        <p className="flex flex-wrap items-center gap-2 rounded-radius-md border border-info-border bg-info-subtle px-3 py-2 text-caption text-info">
          설계 중인 개편 초안 <span className="font-semibold">{draft.label}</span>
          (발효 예정 <span className="tabular-nums">{draft.effective_from}</span>)이 있습니다.
          <button
            type="button"
            onClick={() => navigate(`${REFORM_PATH}?draft=${draft.id}`)}
            className="font-semibold underline underline-offset-2"
          >
            이어서 설계하기
          </button>
        </p>
      )}

      {editMode ? (
        <OrgEditWorkspace editing={editing} keyword={keyword} />
      ) : (
        <OrgDirectory versionId={versionId} keyword={keyword} detailBasePath="/management/hr" />
      )}

      <OrgLevelModal open={levelOpen} onClose={() => setLevelOpen(false)} editing={editing} />
      <DeletedDeptModal
        open={removedOpen}
        onClose={() => setRemovedOpen(false)}
        editing={editing}
      />

      <Modal
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        size="sm"
        title="직접 편집으로 전환"
        footer={
          <>
            <Button variant="outline" onClick={() => setWarnOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                setEditMode(true)
                setWarnOpen(false)
              }}
            >
              직접 편집 시작
            </Button>
          </>
        }
      >
        <p className="text-body text-gray-700">
          현재 선택한 조직 버전을 직접 수정합니다. 구조 개편 이력을 분리하려면 조직 개편을 사용하세요.
        </p>
      </Modal>
    </div>
  )
}
