import { Button, Input, Modal, useToast } from '@ynarcher/ui'
import { Controller, useForm } from 'react-hook-form'
import {
  checkDuplicateName,
  useCreateEntity,
  useUpdateEntity,
  type EntityRow,
} from '@/features/networks/hooks'
import { TagSelect } from '@/features/admin/TagSelect'
import type { EntityConfig } from '@/features/networks/config'

interface Props {
  config: EntityConfig
  open: boolean
  onClose: () => void
  initial: EntityRow | null
}

/** 개별 등록/수정 모달(필수값 + 이름 중복 검사). */
export function EntityFormModal({ config, open, onClose, initial }: Props) {
  const toast = useToast()
  const create = useCreateEntity(config.table)
  const update = useUpdateEntity(config.table)
  const isEdit = Boolean(initial)

  const defaults: Record<string, string> = {}
  for (const f of config.fields) {
    defaults[f.name] = (initial?.[f.name] as string) ?? ''
  }

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>({ values: defaults })

  const onSubmit = async (values: Record<string, string>) => {
    const payload: Record<string, unknown> = {}
    for (const f of config.fields) {
      payload[f.name] = values[f.name]?.trim() || null
    }
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, values: payload })
        toast.show(`${config.label} 정보를 수정했습니다.`, 'success')
      } else {
        if (await checkDuplicateName(config.table, (values.name ?? '').trim())) {
          toast.show('동일한 이름이 이미 등록되어 있습니다.', 'warning')
          return
        }
        await create.mutateAsync(payload)
        toast.show(`${config.label}을(를) 등록했습니다.`, 'success')
      }
      reset()
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한 또는 입력값을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${config.label} ${isEdit ? '수정' : '등록'}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isEdit ? '수정' : '등록'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {config.fields.map((f) => (
          <div key={f.name}>
            <label className="text-body font-medium text-gray-800" htmlFor={f.name}>
              {f.label}
              {f.required && <span className="text-brand"> *</span>}
            </label>
            {f.tagTable ? (
              // 태그 원장 연동 필드는 자유 입력 대신 ADMIN 태그에서 선택한다.
              <Controller
                control={control}
                name={f.name}
                rules={{ required: f.required ? `${f.label}은(는) 필수입니다.` : false }}
                render={({ field }) => (
                  <TagSelect
                    id={f.name}
                    table={f.tagTable!}
                    invalid={Boolean(errors[f.name])}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder={`${f.label} 선택`}
                  />
                )}
              />
            ) : (
              <Input
                id={f.name}
                invalid={Boolean(errors[f.name])}
                {...register(f.name, {
                  required: f.required ? `${f.label}은(는) 필수입니다.` : false,
                })}
              />
            )}
            {errors[f.name] && (
              <p className="mt-1 text-caption text-danger">
                {errors[f.name]?.message}
              </p>
            )}
          </div>
        ))}
      </form>
    </Modal>
  )
}
