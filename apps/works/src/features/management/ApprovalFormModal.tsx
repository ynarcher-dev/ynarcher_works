import { Button, Input, Modal, Select, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { FORM_TYPES } from '@/features/management/config'
import { useCreateApproval, useEmployees } from '@/features/management/hooks'

/** 결재선 지정 및 문서 상신 폼(조직도 기반 순차 결재자 지정). */
export function ApprovalFormModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateApproval()
  const { data: employees } = useEmployees()
  const [title, setTitle] = useState('')
  const [formType, setFormType] = useState('GENERAL')
  const [amount, setAmount] = useState('')
  const [body, setBody] = useState('')
  const [approvers, setApprovers] = useState<string[]>([''])

  const setApprover = (i: number, v: string) =>
    setApprovers((prev) => prev.map((a, idx) => (idx === i ? v : a)))

  const onSubmit = async () => {
    if (!title.trim()) {
      toast.show('문서 제목을 입력하세요.', 'warning')
      return
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        form_type: formType,
        amount: amount ? Number(amount) : null,
        body: body.trim() || null,
        approver_ids: approvers.filter(Boolean),
      })
      toast.show('문서를 상신했습니다.', 'success')
      setTitle('')
      setAmount('')
      setBody('')
      setApprovers([''])
      onClose()
    } catch {
      toast.show('상신에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="문서 상신"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={create.isPending}>
            상신
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-body font-medium text-gray-800">문서 양식</label>
          <Select value={formType} onChange={(e) => setFormType(e.target.value)}>
            {FORM_TYPES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">제목</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">금액(원)</label>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">본문</label>
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">
            결재선(순차)
          </label>
          <div className="space-y-2">
            {approvers.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-caption text-gray-600">{i + 1}차</span>
                <Select value={a} onChange={(e) => setApprover(i, e.target.value)}>
                  <option value="">결재자 선택</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() => setApprovers((p) => [...p, ''])}
            >
              + 결재자 추가
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
