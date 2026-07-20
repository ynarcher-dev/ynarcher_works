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
import {
  PROGRAM_CATEGORY_LABEL,
  PROGRAM_CATEGORY_OPTIONS,
  programStage,
  type ProgramStage,
} from '@/features/ac/config'
import {
  ProgramStageFields,
  type ProgramFormValues as FormValues,
} from '@/features/ac/ProgramStageFields'

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
  // 상태는 단계(제안/운영)로 이원화 — 단계 라디오가 어느 셀렉트를 쓸지 정하고,
  // 단계 전환 시 반대편 선택값을 잃지 않도록 단계별 상태를 각각 보관한다.
  const initialStatus = program?.status ?? 'PROPOSED'
  const [stage, setStage] = useState<ProgramStage>(() => programStage(initialStatus))
  const [proposalStatus, setProposalStatus] = useState(() =>
    programStage(initialStatus) === 'PROPOSAL' ? initialStatus : 'PROPOSED',
  )
  const [operationStatus, setOperationStatus] = useState(() =>
    programStage(initialStatus) === 'OPERATION' ? initialStatus : 'DRAFT',
  )
  // 제안 상태 변경 핸들러: '선정'을 고르면 운영 단계(준비)로 즉시 자동 전환한다.
  // 운영 상태는 기존 값(신규는 '준비')을 유지해 편집 중이던 진행 상태를 잃지 않는다.
  const handleProposalStatusChange = (status: string) => {
    setProposalStatus(status)
    if (status === 'SELECTED') setStage('OPERATION')
  }
  // 편집 대상이 바뀌면(모달 재사용) 배치·단계 상태를 해당 프로그램 기준으로 다시 초기화한다.
  useEffect(() => {
    setDepartments(toDepartmentSegments(program))
    setManagers(toManagerSegments(program))
    const status = program?.status ?? 'PROPOSED'
    setStage(programStage(status))
    setProposalStatus(programStage(status) === 'PROPOSAL' ? status : 'PROPOSED')
    setOperationStatus(programStage(status) === 'OPERATION' ? status : 'DRAFT')
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
      category: program?.category ?? '',
      start_date: program?.start_date ?? '',
      end_date: program?.end_date ?? '',
      description: program?.description ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    if (values.start_date && values.end_date && values.start_date > values.end_date) {
      toast.show('운영 종료일은 운영 시작일 이후여야 합니다.', 'warning')
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
      status: stage === 'PROPOSAL' ? proposalStatus : operationStatus,
      // 제안 단계는 별도 기간을 두지 않는다(컬럼은 유지, 항상 null로 기록).
      proposal_start_date: null,
      proposal_end_date: null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      description: values.description || null,
      category: values.category || null,
    }
    try {
      if (isEdit && program) {
        await update.mutateAsync(payload)
        await saveStaffing.mutateAsync({
          programId: program.id,
          departments: departmentRows,
          managers: managerRows,
        })
        toast.show('사업을 수정했습니다.', 'success')
      } else {
        const newId = await create.mutateAsync(payload)
        await saveStaffing.mutateAsync({
          programId: newId,
          departments: departmentRows,
          managers: managerRows,
        })
        toast.show('사업을 등록했습니다.', 'success')
        reset()
        setDepartments([])
        setManagers([])
        setStage('PROPOSAL')
        setProposalStatus('PROPOSED')
        setOperationStatus('DRAFT')
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
      title={isEdit ? '사업 편집' : '사업 등록'}
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
            사업명 <span className="text-brand">*</span>
          </label>
          <Input
            id="title"
            invalid={Boolean(errors.title)}
            {...register('title', { required: '사업명은 필수입니다.' })}
          />
          {errors.title && (
            <p className="mt-1 text-caption text-danger">{errors.title.message}</p>
          )}
        </div>
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="category">
            사업구분
          </label>
          <Select id="category" {...register('category')}>
            <option value="">미지정</option>
            {PROGRAM_CATEGORY_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {PROGRAM_CATEGORY_LABEL[key]}
              </option>
            ))}
          </Select>
        </div>
        <ProgramStageFields
          stage={stage}
          onStageChange={setStage}
          proposalStatus={proposalStatus}
          onProposalStatusChange={handleProposalStatusChange}
          operationStatus={operationStatus}
          onOperationStatusChange={setOperationStatus}
          register={register}
        />
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
                  운영 기간(시작·종료일)을 입력하면 단계별 배치를 설정할 수 있습니다.
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
            placeholder="상세 헤더에 표시할 사업 소개"
            {...register('description')}
          />
        </div>
      </form>
    </Modal>
  )
}
