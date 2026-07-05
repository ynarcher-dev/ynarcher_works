import { Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  PRIORITY_LABELS,
  TYPE_LABELS,
  type Priority,
  type ProjectType,
} from '@/features/project/config'
import { useCreateProject } from '@/features/project/hooks'

/** 프로젝트 신규 개설 폼(유형/우선순위/기간 지정). */
export function ProjectFormModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [type, setType] = useState<ProjectType>('GENERAL')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const onSubmit = async () => {
    if (!name.trim()) {
      toast.show('프로젝트명을 입력하세요.', 'warning')
      return
    }
    try {
      await create.mutateAsync({
        name: name.trim(),
        project_type: type,
        priority,
        start_date: start || null,
        end_date: end || null,
      })
      toast.show('프로젝트를 개설했습니다.', 'success')
      setName('')
      onClose()
    } catch {
      toast.show('개설에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="프로젝트 개설"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            개설
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-body font-medium text-gray-800">프로젝트명</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-body font-medium text-gray-800">유형</label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as ProjectType)}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-body font-medium text-gray-800">우선순위</label>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-body font-medium text-gray-800">시작 예정</label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800">종료 예정</label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
