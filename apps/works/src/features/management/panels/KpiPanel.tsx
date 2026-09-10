import { useEffect, useMemo } from 'react'
import { Badge, Button, Card, EmptyState, Select, Skeleton, Tabs, useToast } from '@ynarcher/ui'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { useSearchParams } from 'react-router-dom'
import { KpiActualPanel } from '@/features/management/kpi/KpiActualPanel'
import { KpiAssignmentsPanel } from '@/features/management/kpi/KpiAssignmentsPanel'
import { KpiTemplateBuilder } from '@/features/management/kpi/KpiTemplateBuilder'
import { useKpiVersions, usePublishKpiVersion } from '@/features/management/kpi/kpiApi'
import type { KpiVersionStatus } from '@/features/management/kpi/kpiTypes'

type View = 'templates' | 'departments' | 'people' | 'actuals'
const VIEW_ITEMS = [
  { key: 'templates', label: 'KPI 구성' },
  { key: 'departments', label: '부서 할당' },
  { key: 'people', label: '개인 할당' },
  { key: 'actuals', label: '실적·점수' },
]
const isView = (value: string | null): value is View => VIEW_ITEMS.some((item) => item.key === value)
const statusLabel: Record<KpiVersionStatus, string> = { DRAFT: '설계 중', PUBLISHED: '운영 중', CLOSED: '마감' }
const statusTone: Record<KpiVersionStatus, 'warning' | 'success' | 'neutral'> = { DRAFT: 'warning', PUBLISHED: 'success', CLOSED: 'neutral' }

/** 조직 버전과 1:1로 묶인 KPI 스냅샷을 구성·할당·운영한다. */
export function KpiPanel() {
  const toast = useToast()
  const user = useAuthStore((state) => state.user)
  const canWrite = hasWorkspaceWrite(user, 'management')
  const [params, setParams] = useSearchParams()
  const { data: versions = [], isLoading, isError } = useKpiVersions()
  const publish = usePublishKpiVersion()
  const requestedOrgVersion = params.get('orgVersion')
  const requestedKpiVersion = params.get('kpiVersion')
  const selected = useMemo(() => versions.find((version) => version.id === requestedKpiVersion)
    ?? versions.find((version) => version.org_version_id === requestedOrgVersion)
    ?? versions[0] ?? null, [versions, requestedKpiVersion, requestedOrgVersion])
  const view: View = isView(params.get('kpiView')) ? params.get('kpiView') as View : 'templates'

  useEffect(() => {
    if (!selected || requestedKpiVersion === selected.id) return
    const next = new URLSearchParams(params)
    next.set('kpiVersion', selected.id)
    next.delete('orgVersion')
    setParams(next, { replace: true })
  }, [params, requestedKpiVersion, selected, setParams])

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    next.set(key, value)
    if (key === 'kpiVersion') next.delete('orgVersion')
    setParams(next, { replace: true })
  }

  if (isLoading) return <Skeleton className="h-96 rounded-radius-lg" />
  if (isError) return <Card><EmptyState title="KPI 스냅샷을 불러오지 못했습니다." description="잠시 후 다시 시도하세요." /></Card>
  if (!selected) return <Card><EmptyState title="KPI 스냅샷이 없습니다." description="조직 원장 버전을 먼저 생성하세요." /></Card>

  const configurationEditable = canWrite && selected.status === 'DRAFT'
  const assignmentEditable = canWrite && selected.status !== 'CLOSED'
  const actualEditable = canWrite && selected.status === 'PUBLISHED'

  return (
    <div className="space-y-4">
      <Card
        title="KPI 스냅샷"
        subtitle={`${selected.org.label} · ${selected.org.effective_from} ~ ${selected.org.effective_to ?? '계속'}`}
        help="조직 개편 시 KPI 구성과 할당도 새 스냅샷으로 복제됩니다. 발행 이후 구성 변경은 다음 조직·KPI 버전에서 진행합니다."
        actions={configurationEditable && canWrite ? (
          <Button
            disabled={publish.isPending}
            onClick={() => void publish.mutateAsync(selected.org_version_id)
              .then(() => toast.show('KPI를 발행했습니다. 미할당 대상은 발행 후에도 할당할 수 있습니다.', 'success'))
              .catch((error: Error) => toast.show(error.message, 'danger'))}
          >{publish.isPending ? '발행 중…' : '조직·KPI 함께 발행'}</Button>
        ) : undefined}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select className="sm:max-w-md" value={selected.id} onChange={(event) => updateParam('kpiVersion', event.target.value)} aria-label="KPI 스냅샷 선택">
            {versions.map((version) => <option key={version.id} value={version.id}>{version.label} · {version.org.label}</option>)}
          </Select>
          <Badge tone={statusTone[selected.status]}>{statusLabel[selected.status]}</Badge>
          {selected.source_version_id && <span className="text-caption text-gray-500">이전 스냅샷에서 복제됨</span>}
        </div>
      </Card>

      <Tabs items={VIEW_ITEMS} value={view} onChange={(key) => updateParam('kpiView', key)} />
      {view === 'templates' && <KpiTemplateBuilder versionId={selected.id} editable={configurationEditable} />}
      {view === 'departments' && <KpiAssignmentsPanel versionId={selected.id} orgVersionId={selected.org_version_id} scope="DEPARTMENT" editable={assignmentEditable} fillOnly={selected.status === 'PUBLISHED'} />}
      {view === 'people' && <KpiAssignmentsPanel versionId={selected.id} orgVersionId={selected.org_version_id} scope="PERSON" editable={assignmentEditable} fillOnly={selected.status === 'PUBLISHED'} />}
      {view === 'actuals' && <KpiActualPanel versionId={selected.id} orgVersionId={selected.org_version_id} editable={actualEditable} />}
    </div>
  )
}
