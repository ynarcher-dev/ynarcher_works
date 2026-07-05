import { Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useForm } from 'react-hook-form'
import { useCreateProgram } from '@/features/ac/hooks'
import { PROGRAM_STATUS_LABEL } from '@/features/ac/config'

interface FormValues {
  title: string
  status: string
}

/** 프로그램 신규 등록 모달. */
export function ProgramFormModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const create = useCreateProgram()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { status: 'DRAFT' } })

  const onSubmit = async (values: FormValues) => {
    try {
      await create.mutateAsync(values)
      toast.show('프로그램을 등록했습니다.', 'success')
      reset()
      onClose()
    } catch {
      toast.show('등록에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="프로그램 등록"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            등록
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="title">
            프로그램명 <span className="text-brand">*</span>
          </label>
          <Input
            id="title"
            invalid={Boolean(errors.title)}
            {...register('title', { required: '프로그램명은 필수입니다.' })}
          />
          {errors.title && (
            <p className="mt-1 text-caption text-danger">{errors.title.message}</p>
          )}
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="status">
            상태
          </label>
          <Select id="status" {...register('status')}>
            {Object.entries(PROGRAM_STATUS_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Modal>
  )
}
