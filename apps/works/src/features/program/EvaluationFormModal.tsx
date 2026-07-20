import { Banner, Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  useCreateEvaluationForm,
  useEvalModules,
} from '@/features/program/evaluationHooks'

const FORM_TYPE_LABEL: Record<string, string> = {
  DOC_REVIEW: '서면평가',
  ONSITE_EVAL: '대면평가',
  DEMO_DAY: '데모데이',
}

/** 평가 폼(라운드) 생성 모달. */
export function EvaluationFormModal({
  programId,
  open,
  onClose,
}: {
  programId: string
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const { data: modules } = useEvalModules(programId)
  const create = useCreateEvaluationForm(programId)
  const [moduleId, setModuleId] = useState('')
  const [title, setTitle] = useState('')

  const selectedModule = (modules ?? []).find((m) => m.id === moduleId)

  const onSubmit = async () => {
    if (!moduleId || !title.trim() || !selectedModule) {
      toast.show('모듈과 제목을 입력하세요.', 'warning')
      return
    }
    try {
      await create.mutateAsync({
        programModuleId: moduleId,
        formType: selectedModule.module_type,
        title: title.trim(),
      })
      toast.show('평가 폼을 생성했습니다.', 'success')
      setTitle('')
      onClose()
    } catch {
      toast.show('생성에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="평가 폼 생성"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            생성
          </Button>
        </>
      }
    >
      {(modules ?? []).length === 0 ? (
        <Banner tone="warning">
          평가 대상 모듈(서면/대면/데모데이)을 먼저 모듈 보드에서 활성화하세요.
        </Banner>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-body font-medium text-gray-800">평가 모듈</label>
            <Select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">선택</option>
              {(modules ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {FORM_TYPE_LABEL[m.module_type] ?? m.module_type}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-body font-medium text-gray-800">평가 폼 제목</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  )
}
