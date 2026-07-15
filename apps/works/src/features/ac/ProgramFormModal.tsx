import { Button, Input, Modal, Select, TextArea, useToast } from '@ynarcher/ui'
import { useForm } from 'react-hook-form'
import { useCreateProgram, type Program } from '@/features/ac/hooks'
import { useUpdateProgram } from '@/features/ac/detail/detailHooks'
import { PROGRAM_STATUS_LABEL } from '@/features/ac/config'

interface FormValues {
  title: string
  status: string
  start_date: string
  end_date: string
  description: string
}

/**
 * 프로그램 등록/편집 모달. `program`을 넘기면 편집 모드로 동작한다.
 * 편집 모드는 defaultValues 초기화를 위해 열 때만 마운트한다.
 */
export function ProgramFormModal({
  open,
  onClose,
  program,
}: {
  open: boolean
  onClose: () => void
  program?: Program
}) {
  const toast = useToast()
  const create = useCreateProgram()
  const update = useUpdateProgram(program?.id ?? '')
  const isEdit = Boolean(program)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: program?.title ?? '',
      status: program?.status ?? 'DRAFT',
      start_date: program?.start_date ?? '',
      end_date: program?.end_date ?? '',
      description: program?.description ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    if (values.start_date && values.end_date && values.start_date > values.end_date) {
      toast.show('종료일은 시작일 이후여야 합니다.', 'warning')
      return
    }
    const payload = {
      title: values.title,
      status: values.status,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      description: values.description || null,
    }
    try {
      if (isEdit) {
        await update.mutateAsync(payload)
        toast.show('프로그램을 수정했습니다.', 'success')
      } else {
        await create.mutateAsync(payload)
        toast.show('프로그램을 등록했습니다.', 'success')
        reset()
      }
      onClose()
    } catch {
      toast.show(`${isEdit ? '수정' : '등록'}에 실패했습니다. 권한을 확인하세요.`, 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '프로그램 편집' : '프로그램 등록'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isEdit ? '저장' : '등록'}
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
        <div className="grid grid-cols-3 gap-3">
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
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="start_date">
              시작일
            </label>
            <Input id="start_date" type="date" {...register('start_date')} />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="end_date">
              종료일
            </label>
            <Input id="end_date" type="date" {...register('end_date')} />
          </div>
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="description">
            설명
          </label>
          <TextArea
            id="description"
            rows={3}
            placeholder="상세 헤더에 표시할 프로그램 소개"
            {...register('description')}
          />
        </div>
      </form>
    </Modal>
  )
}
