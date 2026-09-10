import { Badge, Card, EmptyState, Select, Skeleton, useToast } from '@ynarcher/ui'
import { useDepartments } from '@/features/management/orgHooks'
import { useKpiAssignments, useKpiPeople, useKpiTemplates, useSetKpiAssignment } from './kpiApi'
import type { KpiScope } from './kpiTypes'

interface Props {
  versionId: string
  orgVersionId: string
  scope: KpiScope
  editable: boolean
  fillOnly?: boolean
}

export function KpiAssignmentsPanel({ versionId, orgVersionId, scope, editable, fillOnly = false }: Props) {
  const toast = useToast()
  const { data: departments = [], isLoading: departmentLoading } = useDepartments(false, orgVersionId)
  const { data: people = [], isLoading: peopleLoading } = useKpiPeople(orgVersionId)
  const { data: templates = [], isLoading: templateLoading } = useKpiTemplates(versionId)
  const { data: assignments = [], isLoading: assignmentLoading } = useKpiAssignments(versionId)
  const setAssignment = useSetKpiAssignment()
  const scopedTemplates = templates.filter((template) => template.scope_type === scope)
  const subjects = scope === 'DEPARTMENT'
    ? departments.map((department) => ({ id: department.id, name: department.name, detail: null }))
    : people.map((person) => ({
        id: person.id,
        name: person.name,
        detail: [person.position, departments.find((department) => department.id === person.department_id)?.name]
          .filter(Boolean).join(' · ') || null,
      }))
  const assignmentBySubject = new Map(
    assignments.filter((assignment) => assignment.subject_type === scope && assignment.assignment_kind === 'PRIMARY')
      .map((assignment) => [scope === 'DEPARTMENT' ? assignment.department_id : assignment.user_id, assignment]),
  )
  const assigned = subjects.filter((subject) => assignmentBySubject.has(subject.id)).length
  const loading = departmentLoading || peopleLoading || templateLoading || assignmentLoading

  if (loading) return <Skeleton className="h-72 rounded-radius-lg" />

  return (
    <Card
      title={scope === 'DEPARTMENT' ? '부서 KPI 할당' : '개인 KPI 할당'}
      count={assigned}
      subtitle={`전체 ${subjects.length}개 대상 중 ${assigned}개 할당`}
      help={fillOnly
        ? '발행 후에는 미할당 대상만 최초 할당할 수 있습니다. 이미 할당된 KPI는 스냅샷 보호를 위해 바꿀 수 없습니다.'
        : scope === 'DEPARTMENT'
          ? '임직원은 발효일 기준 소속 부서의 KPI를 자동으로 상속합니다. 변경 전 실적은 이력으로 보존됩니다.'
          : '개인 KPI는 부서 이동과 관계없이 같은 조직·KPI 버전 동안 유지됩니다.'}
    >
      {!scopedTemplates.length ? (
        <EmptyState title={`${scope === 'DEPARTMENT' ? '부서' : '개인'} KPI 템플릿이 없습니다.`} description="먼저 KPI 구성 탭에서 템플릿을 만드세요." />
      ) : !subjects.length ? (
        <EmptyState title="할당할 대상이 없습니다." />
      ) : (
        <div className="divide-y divide-gray-200 rounded-radius-md border border-gray-200">
          {subjects.map((subject) => {
            const current = assignmentBySubject.get(subject.id)
            return (
              <div key={subject.id} className="grid grid-cols-1 items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-gray-900">{subject.name}</p>
                    <Badge tone={current ? 'success' : 'warning'}>{current ? '할당 완료' : '미할당'}</Badge>
                  </div>
                  {subject.detail && <p className="mt-0.5 truncate text-caption text-gray-500">{subject.detail}</p>}
                </div>
                <Select
                  aria-label={`${subject.name} KPI 템플릿`}
                  value={current?.template_id ?? ''}
                  disabled={!editable || setAssignment.isPending || (fillOnly && Boolean(current))}
                  onChange={(event) => {
                    void setAssignment.mutateAsync({
                      versionId,
                      templateId: event.target.value || null,
                      scope,
                      subjectId: subject.id,
                    }).then(() => toast.show('KPI 할당을 저장했습니다.', 'success'))
                      .catch((error: Error) => toast.show(error.message, 'danger'))
                  }}
                >
                  <option value="">미할당</option>
                  {scopedTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </Select>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
