import { Button, Input, Spinner, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  useCreateMilestone,
  useMilestones,
  type Milestone,
} from '@/features/project/hooks'

const DAY = 86_400_000

function toTime(d: string | null): number | null {
  return d ? new Date(d).getTime() : null
}

/** 간트 차트 기반 마일스톤 로드맵(선형 막대, 다국어/UTC 병기). */
export function GanttRoadmap({ projectId }: { projectId: string }) {
  const toast = useToast()
  const { data, isLoading } = useMilestones(projectId)
  const create = useCreateMilestone(projectId)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const milestones = useMemo(
    () => (data ?? []).filter((m) => m.start_date && m.end_date),
    [data],
  )

  const { min, span } = useMemo(() => {
    const starts = milestones.map((m) => toTime(m.start_date)!).filter(Boolean)
    const ends = milestones.map((m) => toTime(m.end_date)!).filter(Boolean)
    if (starts.length === 0) return { min: 0, span: 1 }
    const lo = Math.min(...starts)
    const hi = Math.max(...ends)
    return { min: lo, span: Math.max(hi - lo, DAY) }
  }, [milestones])

  const onAdd = async () => {
    if (!name.trim() || !start || !end) {
      toast.show('마일스톤명과 시작/종료일을 입력하세요.', 'warning')
      return
    }
    try {
      await create.mutateAsync({ name: name.trim(), start_date: start, end_date: end })
      toast.show('마일스톤을 추가했습니다. 전사 캘린더에 연계됩니다.', 'success')
      setName('')
      setStart('')
      setEnd('')
    } catch {
      toast.show('추가에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const barStyle = (m: Milestone) => {
    const s = toTime(m.start_date)!
    const e = toTime(m.end_date)!
    return {
      left: `${((s - min) / span) * 100}%`,
      width: `${Math.max(((e - s) / span) * 100, 2)}%`,
    }
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <label className="text-caption text-gray-600">마일스톤명</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-caption text-gray-600">시작</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="text-caption text-gray-600">종료</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button onClick={() => void onAdd()} disabled={create.isPending}>
          추가
        </Button>
      </div>

      {milestones.length === 0 ? (
        <p className="rounded border border-dashed border-gray-200 py-8 text-center text-body text-gray-400">
          등록된 마일스톤이 없습니다.
        </p>
      ) : (
        <div className="space-y-2 rounded border border-gray-200 bg-white p-4">
          {milestones.map((m) => (
            <div key={m.id} className="grid grid-cols-[9rem_1fr] items-center gap-3">
              <span className="truncate text-body text-gray-800" title={m.name}>
                {m.name}
              </span>
              <div className="relative h-5 rounded bg-gray-50">
                <div
                  className="absolute top-0 h-5 rounded bg-brand/80"
                  style={barStyle(m)}
                  title={`${m.start_date} ~ ${m.end_date}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
