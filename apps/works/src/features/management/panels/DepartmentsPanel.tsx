import { Button, Modal, Spinner } from '@ynarcher/ui'
import { Lock, Pencil, Table2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  activeOrgVersionId,
  useDepartments,
  useDeptMembers,
  useEmployees,
  useOrgLevels,
  useOrgVersions,
  useUpdateOrgVersion,
} from '@/features/management/hooks'
import { HrReflectPreview } from '@/features/management/panels/HrReflectPreview'
import { OrgReformModal } from '@/features/management/panels/OrgReformModal'
import { OrgTreeEditor } from '@/features/management/panels/OrgTreeEditor'
import { OrgVersionBar } from '@/features/management/panels/OrgVersionBar'
import { toNodes } from '@/features/management/panels/departmentsMock'

/**
 * 조직 관리 — 조직도 트리 편집기(OrgTreeEditor)를 버전 스코프로 렌더한다.
 * 운영 중 조직을 실수로 훼손하지 않도록 기본은 읽기전용이며, 구조 변경은 "조직 개편"(초안→예약)
 * 흐름을 권장한다. 즉시 편집이 필요하면 경고 후 "직접 편집" 모드로 전환한다.
 */
export function DepartmentsPanel() {
  const { data: versionRows, isLoading: versionLoading } = useOrgVersions()
  const versions = useMemo(() => versionRows ?? [], [versionRows])
  const activeVersionId = useMemo(() => activeOrgVersionId(versions), [versions])

  // 편집 대상 버전(기본 = 오늘의 유효 버전). 버전 로드 후 1회 초기화.
  const [versionId, setVersionId] = useState('')
  useEffect(() => {
    if (!versionId && versions.length) setVersionId(activeVersionId ?? versions[0]!.id)
  }, [versions, activeVersionId, versionId])

  // 화면 상태
  const [editMode, setEditMode] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const [reformOpen, setReformOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  // 인사 반영 미리보기용 파생 데이터(선택 버전 스코프, react-query 캐시 공유).
  const { data: deptRows } = useDepartments(true, versionId || undefined)
  const { data: levelRows } = useOrgLevels()
  const { data: empRows } = useEmployees()
  const { data: memberRows } = useDeptMembers(versionId || undefined)
  const nodes = useMemo(() => toNodes(deptRows ?? []), [deptRows])
  const levels = useMemo(() => levelRows ?? [], [levelRows])
  const previewEmployees = useMemo(() => {
    const placement = new Map<string, string>()
    for (const r of memberRows ?? []) placement.set(r.user_id, r.department_id)
    return (empRows ?? []).map((e) => ({ id: e.id, name: e.name, deptId: placement.get(e.id) ?? null }))
  }, [empRows, memberRows])

  // 버전을 바꾸면 편집 모드를 해제(항상 조회 상태로 진입).
  const selectVersion = (id: string) => {
    setVersionId(id)
    setEditMode(false)
  }

  // 예약(예정) 버전 취소 = soft delete. 예약 시 현재 조직에 걸어둔 종료일(핸드오프)을
  // 무기한으로 되돌려 현재 조직이 계속 운영되게 한다. 취소 후 선택을 현재(활성) 버전으로 되돌린다.
  const updateVersion = useUpdateOrgVersion()
  const deleteVersion = async (id: string) => {
    await updateVersion.mutateAsync({ id, values: { deleted_at: new Date().toISOString() } })
    if (activeVersionId) {
      await updateVersion.mutateAsync({ id: activeVersionId, values: { effective_to: null } })
    }
    setVersionId(activeVersionId ?? '')
    setEditMode(false)
  }

  if ((versionLoading && !versionRows) || !versionId) {
    return <Spinner />
  }

  return (
    <div className="space-y-4">
      {/* 상단 도구막대: 조직 버전(가용기간) + 액션 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OrgVersionBar
          versions={versions}
          selectedId={versionId}
          activeId={activeVersionId}
          onSelect={selectVersion}
          showClone={false}
          onDelete={deleteVersion}
          deleting={updateVersion.isPending}
        />
        <div className="flex items-center gap-2 pt-0.5">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Table2 size={14} /> 인사 반영 미리보기
          </Button>
          {editMode ? (
            <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
              <Lock size={14} /> 편집 잠금
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setWarnOpen(true)}>
              <Pencil size={14} /> 직접 편집
            </Button>
          )}
          <Button size="sm" onClick={() => setReformOpen(true)}>
            조직 개편
          </Button>
        </div>
      </div>

      {!editMode && (
        <p className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-500">
          조회 모드입니다. 구조 변경은 상단 <span className="font-semibold">‘조직 개편’</span>(초안 →
          예약)을 사용하세요. 운영 중 조직을 즉시 수정하려면 ‘직접 편집’을 누르세요.
        </p>
      )}

      {/* 조직도 트리(버전 스코프) */}
      <OrgTreeEditor versionId={versionId} activeVersionId={activeVersionId} editable={editMode} />

      {/* 직접 편집 전환 경고 */}
      <Modal
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        size="sm"
        title="직접 편집으로 전환"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setWarnOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
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
          운영 중인 현재 조직을 직접 수정합니다. 변경 이력이 별도로 남지 않으니, 구조 개편이
          필요하면 <span className="font-semibold">‘조직 개편’</span>을 사용하세요.
        </p>
      </Modal>

      <OrgReformModal
        open={reformOpen}
        onClose={() => setReformOpen(false)}
        versions={versions}
        activeVersionId={activeVersionId}
      />

      <HrReflectPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        levels={levels}
        nodes={nodes}
        employees={previewEmployees}
      />
    </div>
  )
}
