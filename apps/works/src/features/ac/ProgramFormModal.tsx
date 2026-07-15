import { Button, Input, Modal, Select, TextArea, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  useCreateProgram,
  useSetProgramStaffing,
  type Program,
} from '@/features/ac/hooks'
import { useUpdateProgram } from '@/features/ac/detail/detailHooks'
import type { ProgramManagerSegment } from '@/features/ac/ProgramManagerEditor'
import type { ProgramDepartmentSegment } from '@/features/ac/ProgramDepartmentEditor'
import { PhaseStaffingEditor } from '@/features/ac/PhaseStaffingEditor'
import { computePhases, validateStaffing } from '@/features/ac/programManagerCoverage'
import { useOrgVersions } from '@/features/management/orgHooks'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_OPTIONS } from '@/features/ac/config'

interface FormValues {
  title: string
  status: string
  start_date: string
  end_date: string
  description: string
}

/** 프로그램 임베드 담당자 → 편집용 구간. 단계(org 버전)·부서 미지정 레거시 행은 제외한다. */
function toManagerSegments(program?: Program): ProgramManagerSegment[] {
  return (program?.managers ?? [])
    .filter((m) => m.org_version_id && m.department_id)
    .map((m) => ({
      _key: crypto.randomUUID(),
      user_id: m.user_id,
      org_version_id: m.org_version_id,
      department_id: m.department_id,
      role: m.role,
      allocation_rate: m.allocation_rate,
      start_date: m.start_date,
      end_date: m.end_date,
    }))
}

/** 프로그램 임베드 부서 → 편집용 부서 구성. 단계 미지정 레거시 행은 제외한다. */
function toDepartmentSegments(program?: Program): ProgramDepartmentSegment[] {
  return (program?.departments ?? [])
    .filter((d) => d.org_version_id)
    .map((d) => ({
      _key: crypto.randomUUID(),
      org_version_id: d.org_version_id,
      department_id: d.department_id,
      kind: d.kind,
      collaboration_ratio: d.collaboration_ratio,
    }))
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
  const saveStaffing = useSetProgramStaffing()
  const { data: orgVersions } = useOrgVersions()
  const isEdit = Boolean(program)
  const [departments, setDepartments] = useState<ProgramDepartmentSegment[]>(() =>
    toDepartmentSegments(program),
  )
  const [managers, setManagers] = useState<ProgramManagerSegment[]>(() => toManagerSegments(program))
  // 편집 대상이 바뀌면(모달 재사용) 부서·담당자 배치를 해당 프로그램 기준으로 다시 초기화한다.
  useEffect(() => {
    setDepartments(toDepartmentSegments(program))
    setManagers(toManagerSegments(program))
  }, [program])
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: program?.title ?? '',
      status: program?.status ?? 'PROPOSED',
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
    // 부서+담당자 배치 검증(서버 RPC와 동일 규칙, 단계별). 부서·담당자 모두 비면 허용(미배정).
    const phases = computePhases(orgVersions ?? [], values.start_date || null, values.end_date || null)
    const check = validateStaffing(departments, managers, phases)
    if (!check.ok) {
      toast.show(check.message, 'warning')
      return
    }
    const departmentRows = departments.map(({ _key, ...r }) => r)
    const managerRows = managers.map(({ _key, ...r }) => r)
    const payload = {
      title: values.title,
      status: values.status,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      description: values.description || null,
    }
    try {
      if (isEdit && program) {
        await update.mutateAsync(payload)
        await saveStaffing.mutateAsync({
          programId: program.id,
          departments: departmentRows,
          managers: managerRows,
        })
        toast.show('프로그램을 수정했습니다.', 'success')
      } else {
        const newId = await create.mutateAsync(payload)
        await saveStaffing.mutateAsync({
          programId: newId,
          departments: departmentRows,
          managers: managerRows,
        })
        toast.show('프로그램을 등록했습니다.', 'success')
        reset()
        setDepartments([])
        setManagers([])
      }
      onClose()
    } catch {
      toast.show(`${isEdit ? '수정' : '등록'}에 실패했습니다. 권한과 담당자 배치를 확인하세요.`, 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
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
              {PROGRAM_STATUS_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {PROGRAM_STATUS_LABEL[key]}
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
          <label className="text-body font-medium text-gray-800">
            배치 (부서 구성 + 담당자)
            <span className="ml-1 text-caption font-normal text-gray-400">
              조직개편 경계마다 단계로 나눠 독립 설정
            </span>
          </label>
          {(() => {
            const phases = computePhases(orgVersions ?? [], watch('start_date'), watch('end_date'))
            if (!watch('start_date') || !watch('end_date')) {
              return (
                <p className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 px-3 py-4 text-caption text-gray-400">
                  프로그램 기간(시작·종료일)을 입력하면 단계별 배치를 설정할 수 있습니다.
                </p>
              )
            }
            if (phases.length === 0) {
              return (
                <p className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 px-3 py-4 text-caption text-gray-400">
                  해당 기간에 발행된 조직 버전이 없습니다. 조직관리에서 조직 버전을 발행하세요.
                </p>
              )
            }
            const lastEnd = phases[phases.length - 1]!.end
            return (
              <div className="space-y-2">
                {phases.map((phase, i) => (
                  <PhaseStaffingEditor
                    key={phase.versionId}
                    phase={phase}
                    departments={departments}
                    onDepartmentsChange={setDepartments}
                    managers={managers}
                    onManagersChange={setManagers}
                    previousPhase={i > 0 ? phases[i - 1] : undefined}
                  />
                ))}
                {lastEnd < (watch('end_date') || '') && (
                  <p className="text-caption text-gray-400">
                    {lastEnd} 이후 기간은 조직개편 확정(조직 버전 발행) 후 설정할 수 있습니다.
                  </p>
                )}
              </div>
            )
          })()}
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
