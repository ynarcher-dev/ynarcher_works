import { Badge, Button, Input, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { NEXT_TASK_STATUS, TASK_COLUMNS } from '@/features/project/config'
import {
  useCreateTask,
  useTasks,
  useUpdateTaskStatus,
  type Task,
} from '@/features/project/hooks'

function isOverdue(due: string | null): boolean {
  return Boolean(due && new Date(due).getTime() < Date.now())
}

function TaskCard({
  task,
  projectId,
}: {
  task: Task
  projectId: string
}) {
  const update = useUpdateTaskStatus(projectId)
  const next = NEXT_TASK_STATUS[task.status]
  return (
    <div className="rounded-radius-md border border-gray-300 bg-white p-3 shadow-soft">
      <p className="text-body font-medium text-gray-900">{task.title}</p>
      {task.due_date && (
        <p className="mt-1 flex items-center gap-1 text-caption text-gray-500">
          <span>
            마감 {new Date(task.due_date).toLocaleDateString('ko-KR')}
            <span className="ml-1 text-gray-400">
              (UTC {new Date(task.due_date).toISOString().slice(0, 10)})
            </span>
          </span>
          {isOverdue(task.due_date) && task.status !== 'DONE' && (
            <Badge tone="danger">지연</Badge>
          )}
        </p>
      )}
      {next && (
        <button
          type="button"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: task.id, status: next })}
          className="mt-2 w-full rounded-radius-md border border-gray-300 py-1 text-caption text-gray-600 transition-all duration-fast hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info/10 disabled:opacity-50"
        >
          {TASK_COLUMNS.find((c) => c.key === next)?.label}(으)로 →
        </button>
      )}
    </div>
  )
}

/** 협업 태스크 칸반(To-Do → In-Progress → Review → Done). */
export function TaskKanban({ projectId }: { projectId: string }) {
  const toast = useToast()
  const { data, isLoading } = useTasks(projectId)
  const create = useCreateTask(projectId)
  const [title, setTitle] = useState('')

  const onAdd = async () => {
    if (!title.trim()) return
    try {
      await create.mutateAsync({ title: title.trim(), due_date: null })
      setTitle('')
    } catch {
      toast.show('추가에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  if (isLoading) return <Spinner />
  const tasks = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-caption text-gray-600">새 태스크(할 일)</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void onAdd()}
          />
        </div>
        <Button onClick={() => void onAdd()} disabled={create.isPending}>
          추가
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {TASK_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key)
          return (
            <div key={col.key} className="rounded-radius-lg bg-gray-50 p-2">
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-body font-semibold text-gray-800">
                  {col.label}
                </span>
                <Badge tone="neutral">{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <TaskCard key={t.id} task={t} projectId={projectId} />
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-3 text-center text-caption text-gray-400">
                    없음
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
