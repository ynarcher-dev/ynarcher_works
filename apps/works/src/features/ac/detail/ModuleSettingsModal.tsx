import { Button, Input, Modal, Select, TextArea, useToast } from '@ynarcher/ui'
import { useForm } from 'react-hook-form'
import { PARTICIPATION_MODES } from '@/features/ac/config'
import type { ProgramModule } from '@/features/ac/hooks'
import { useUpdateModuleSettings } from '@/features/ac/detail/detailHooks'
import { MODULE_STATUS_META, readModuleSettings } from '@/features/ac/detail/moduleMeta'

interface FormValues {
  status: string
  participation_mode: string
  start_date: string
  end_date: string
  memo: string
}

/** 모듈 설정 모달: 상태(준비/진행/완료)·참여 방식·일정·메모를 편집한다. */
export function ModuleSettingsModal({
  programId,
  module,
  label,
  onClose,
}: {
  programId: string
  module: ProgramModule
  label: string
  onClose: () => void
}) {
  const toast = useToast()
  const update = useUpdateModuleSettings(programId)
  const settings = readModuleSettings(module.settings)
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      status: module.status,
      participation_mode: module.participation_mode ?? '',
      start_date: settings.start_date ?? '',
      end_date: settings.end_date ?? '',
      memo: settings.memo ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    if (values.start_date && values.end_date && values.start_date > values.end_date) {
      toast.show('종료일은 시작일 이후여야 합니다.', 'warning')
      return
    }
    try {
      await update.mutateAsync({
        moduleType: module.module_type,
        status: values.status,
        participationMode: values.participation_mode || null,
        currentSettings: module.settings,
        settings: {
          start_date: values.start_date || undefined,
          end_date: values.end_date || undefined,
          memo: values.memo || undefined,
        },
      })
      toast.show('모듈 설정을 저장했습니다.', 'success')
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${label} 설정`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            저장
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-status">
              상태
            </label>
            <Select id="mod-status" {...register('status')}>
              {Object.entries(MODULE_STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-mode">
              참여 방식
            </label>
            <Select id="mod-mode" {...register('participation_mode')}>
              <option value="">선택 안 함</option>
              {PARTICIPATION_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-start">
              시작일
            </label>
            <Input id="mod-start" type="date" {...register('start_date')} />
          </div>
          <div>
            <label className="text-body font-medium text-gray-800" htmlFor="mod-end">
              종료일
            </label>
            <Input id="mod-end" type="date" {...register('end_date')} />
          </div>
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="mod-memo">
            메모
          </label>
          <TextArea
            id="mod-memo"
            rows={3}
            placeholder="카드에 표시할 운영 메모"
            {...register('memo')}
          />
        </div>
      </form>
    </Modal>
  )
}
