import { Button, Input, Modal, Select, TextArea, useToast } from '@ynarcher/ui'
import { useForm } from 'react-hook-form'
import {
  MODULE_PARTICIPATION,
  MODULE_VISIBILITY_OPTIONS,
  PARTICIPATION_MODE_LABEL,
} from '@/features/ac/config'
import type { Program, ProgramModule } from '@/features/ac/hooks'
import { useUpdateModuleSettings } from '@/features/ac/detail/detailHooks'
import { MODULE_STATUS_META, readModuleSettings } from '@/features/ac/detail/moduleMeta'
import { isCompleteRange, moduleWithin, type CompleteRange } from '@/features/ac/programPeriods'

interface FormValues {
  status: string
  visibility: string
  /** 매칭 모듈에서만 선택 입력. 그 외 모듈은 모듈 기본값으로 강제되어 폼에 없다. */
  participation_mode: string
  start_date: string
  end_date: string
  memo: string
}

/** 기간 구간의 표시 라벨(YYYY-MM-DD ~ YYYY-MM-DD). */
function periodLabel(r: CompleteRange): string {
  return `${r.start} ~ ${r.end}`
}

/** 모듈 설정 모달: 상태(준비/진행/완료/취소)·참여 방식·일정·메모를 편집한다. */
export function ModuleSettingsModal({
  program,
  module,
  label,
  onClose,
}: {
  program: Program
  module: ProgramModule
  label: string
  onClose: () => void
}) {
  const toast = useToast()
  const update = useUpdateModuleSettings(program.id)
  // 모듈 기간이 들어갈 수 있는 구간: 제안 기간·운영 기간 중 완전 구간만 후보.
  const proposalRange: CompleteRange | null = isCompleteRange({
    start: program.proposal_start_date,
    end: program.proposal_end_date,
  })
    ? { start: program.proposal_start_date!, end: program.proposal_end_date! }
    : null
  const operationRange: CompleteRange | null = isCompleteRange({
    start: program.start_date,
    end: program.end_date,
  })
    ? { start: program.start_date!, end: program.end_date! }
    : null
  const allowedRanges = [proposalRange, operationRange].filter(
    (r): r is CompleteRange => r !== null,
  )
  const settings = readModuleSettings(module.settings)
  // 모듈 타입별 배정 방식 정책: options가 있으면 선택형(매칭), 없으면 기본값 고정.
  const modePolicy = MODULE_PARTICIPATION[module.module_type]
  const fixedMode = modePolicy?.default ?? null
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      status: module.status,
      visibility: module.visibility || 'INTERNAL_ONLY',
      participation_mode: module.participation_mode ?? fixedMode ?? '',
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
    // 모듈 기간은 제안 기간 또는 운영 기간 안에서만 설정할 수 있다.
    // (프로그램에 설정된 완전 구간이 하나도 없으면 판정 대상이 없어 통과시킨다.)
    if (
      (values.start_date || values.end_date) &&
      allowedRanges.length > 0 &&
      !allowedRanges.some((r) => moduleWithin(r, values.start_date, values.end_date))
    ) {
      toast.show('모듈 기간은 제안 기간 또는 운영 기간 내에서만 설정할 수 있습니다.', 'warning')
      return
    }
    // 선택형(매칭)만 폼 값을 쓰고, 나머지는 모듈 기본값으로 강제한다.
    const participationMode = modePolicy?.options
      ? values.participation_mode || fixedMode
      : fixedMode
    try {
      await update.mutateAsync({
        moduleType: module.module_type,
        status: values.status,
        participationMode,
        visibility: values.visibility,
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
            <label className="text-body font-medium text-gray-800" htmlFor="mod-visibility">
              공유 범위
            </label>
            <Select id="mod-visibility" {...register('visibility')}>
              {MODULE_VISIBILITY_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="mod-mode">
            배정 방식
          </label>
          {modePolicy?.options ? (
            <Select id="mod-mode" {...register('participation_mode')}>
              {modePolicy.options.map((m) => (
                <option key={m} value={m}>
                  {PARTICIPATION_MODE_LABEL[m] ?? m}
                </option>
              ))}
            </Select>
          ) : (
            <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-body text-gray-600">
              {fixedMode ? (PARTICIPATION_MODE_LABEL[fixedMode] ?? fixedMode) : '해당 없음'}
              <span className="ml-1 text-caption text-gray-400">· 모듈 기본값(고정)</span>
            </p>
          )}
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
          {allowedRanges.length > 0 && (
            <p className="col-span-2 text-caption text-gray-400">
              모듈 기간은 다음 범위 안에서만 설정할 수 있습니다 —{' '}
              {proposalRange && <>제안 {periodLabel(proposalRange)}</>}
              {proposalRange && operationRange && ' · '}
              {operationRange && <>운영 {periodLabel(operationRange)}</>}
            </p>
          )}
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
