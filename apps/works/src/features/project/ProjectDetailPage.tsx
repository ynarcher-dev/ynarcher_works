import { Badge, Banner, Spinner, PageHeader } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  PRIORITY_LABELS,
  TYPE_LABELS,
  priorityTone,
} from '@/features/project/config'
import { GanttRoadmap } from '@/features/project/GanttRoadmap'
import { TaskKanban } from '@/features/project/TaskKanban'
import { useProject } from '@/features/project/hooks'

type Tab = 'tasks' | 'gantt'

/** 프로젝트 상세: 협업 태스크 칸반 / 마일스톤 간트 로드맵. */
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: project, isLoading } = useProject(id)
  const [tab, setTab] = useState<Tab>('tasks')

  if (isLoading) return <Spinner />
  if (!project || !id)
    return <Banner tone="warning">프로젝트를 찾을 수 없습니다.</Banner>

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Link
            to="/project"
            className="text-caption font-semibold text-brand hover:text-brand-600"
          >
            ← PROJECT 대시보드
          </Link>
        }
        title={project.name}
        titleExtra={
          <>
            <Badge tone="info">{TYPE_LABELS[project.project_type]}</Badge>
            <Badge tone={priorityTone[project.priority]}>
              {PRIORITY_LABELS[project.priority]}
            </Badge>
          </>
        }
      />

      <nav className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'tasks' as const, label: '태스크 칸반' },
          { key: 'gantt' as const, label: '마일스톤 로드맵' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'tasks' ? (
        <TaskKanban projectId={id} />
      ) : (
        <GanttRoadmap projectId={id} />
      )}
    </div>
  )
}
