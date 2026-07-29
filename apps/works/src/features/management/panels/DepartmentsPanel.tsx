import { Button, Modal, Spinner } from '@ynarcher/ui'
import { Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  activeOrgVersionId,
  useOrgDraftVersions,
  useOrgVersions,
  useUpdateOrgVersion,
} from '@/features/management/hooks'
import { OrgTreeEditor, type OrgTreeEditorHandle } from '@/features/management/panels/OrgTreeEditor'
import { OrgVersionBar } from '@/features/management/panels/OrgVersionBar'

/** 조직 개편 설계 페이지 경로. 초안이 있으면 그 초안을 열고, 없으면 생성 폼으로 들어간다. */
const REFORM_PATH = '/management/org-reform'

export interface DepartmentsPanelProps {
  /**
   * 조회 전용(OFFICE 진입). 편집·개편·버전 삭제 진입점을 감추고 조직도만 보여준다.
   * 원장과 실제 쓰기 권한은 MANAGEMENT가 갖는다 — 여기서 숨기는 것은 화면 정리 목적이며,
   * 권한 강제는 서버(RLS/RPC)가 담당한다.
   */
  readOnly?: boolean
}

export function DepartmentsPanel({ readOnly = false }: DepartmentsPanelProps = {}) {
  const navigate = useNavigate()
  const { data: versionRows, isLoading: versionLoading } = useOrgVersions()
  const { data: draftRows } = useOrgDraftVersions()
  const versions = useMemo(() => versionRows ?? [], [versionRows])
  const activeVersionId = useMemo(() => activeOrgVersionId(versions), [versions])
  // 설계 중인 개편 초안(있으면 배너로 복귀 동선을 준다). 조회 전용 진입에서는 노출하지 않는다.
  const draft = readOnly ? null : (draftRows ?? [])[0] ?? null

  const [versionId, setVersionId] = useState('')
  useEffect(() => {
    if (!versionId && versions.length) setVersionId(activeVersionId ?? versions[0]!.id)
  }, [versions, activeVersionId, versionId])

  const [editMode, setEditMode] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const editorRef = useRef<OrgTreeEditorHandle>(null)

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
    editorRef.current?.cancel()
    setVersionId(id)
    setEditMode(false)
  }

  const saveEdit = async () => {
    await editorRef.current?.save()
    setEditMode(false)
  }

  const cancelEdit = () => {
    editorRef.current?.cancel()
    setEditMode(false)
  }

  if ((versionLoading && !versionRows) || !versionId) {
    return <Spinner />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OrgVersionBar
          versions={versions}
          selectedId={versionId}
          activeId={activeVersionId}
          onSelect={selectVersion}
          showClone={false}
          onDelete={readOnly ? undefined : deleteVersion}
          deleting={updateVersion.isPending}
        />
        <div className="flex items-center gap-2 pt-0.5">
          {readOnly ? null : editMode ? (
            <>
              <Button onClick={() => void saveEdit()}>
                저장
              </Button>
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
      </div>

      {/* 편집 안내문은 편집 권한이 있는 MANAGEMENT에서만 노출한다. */}
      {!readOnly && !editMode && (
        <p className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-600">
          조회 모드입니다. 운영 중인 조직을 즉시 수정하려면 직접 편집을 사용하고, 예정 조직은 조직 개편에서 설계하세요.
        </p>
      )}

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

      <OrgTreeEditor
        ref={editorRef}
        versionId={versionId}
        activeVersionId={activeVersionId}
        editable={!readOnly && editMode}
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
