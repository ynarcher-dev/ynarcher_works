import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  TextArea,
  cn,
  formText,
  useToast,
} from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  programIndustries,
  useCreateProgram,
  useSetProgramStaffing,
  type Program,
} from '@/features/program/hooks'
import { useUpdateProgram } from '@/features/program/detail/detailHooks'
import { useEditReasonPrompt } from '@/components/EditReasonPrompt'
import { useTagTokenField } from '@/features/admin/TagTokenField'
import type {
  ProgramDepartmentSegment,
  ProgramManagerSegment,
} from '@/features/program/staffingTypes'
import { PhaseStaffingEditor } from '@/features/program/PhaseStaffingEditor'
import { ProgramHostField } from '@/features/program/ProgramHostField'
import { computePhases, validateStaffing } from '@/features/program/programManagerCoverage'
import { useOrgVersions } from '@/features/management/orgHooks'
import {
  MAX_PROGRAM_INDUSTRIES,
  defaultProgramStatus,
  programStage,
} from '@/features/program/config'
import { useProgramWorkspace, type ProgramWorkspaceConfig } from '@/features/program/workspace'
import {
  ProgramStatusFields,
  type ProgramFormValues as FormValues,
} from '@/features/program/ProgramStatusFields'

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
 * 편집 대상의 초기 상태값.
 *
 * 제안 단계를 쓰지 않는 워크스페이스(M&A·PROJECT)에서 제안 상태로 남은 레거시 행은 운영의
 * 첫 칸으로 환산한다 — 셀렉트에 없는 값을 그대로 들고 있으면 아무것도 고르지 않은 것처럼
 * 보이고, 저장하면 CHECK 제약에 걸린다.
 */
function initialStatusOf(config: ProgramWorkspaceConfig, program?: Program): string {
  const status = program?.status ?? defaultProgramStatus(config.hasProposalStage)
  if (!config.hasProposalStage && programStage(status) === 'PROPOSAL') return 'DRAFT'
  return status
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
  const config = useProgramWorkspace()
  const toast = useToast()
  const create = useCreateProgram()
  const update = useUpdateProgram(program?.id ?? '')
  const saveStaffing = useSetProgramStaffing()
  const { data: orgVersions } = useOrgVersions()
  const isEdit = Boolean(program)
  const { askReason, reasonModal } = useEditReasonPrompt()
  const [departments, setDepartments] = useState<ProgramDepartmentSegment[]>(() =>
    toDepartmentSegments(program),
  )
  const [managers, setManagers] = useState<ProgramManagerSegment[]>(() =>
    toManagerSegments(program),
  )
  // 분야 태그: ADMIN 분야 관리(industry_tags — 물리명은 구 표기 그대로)에서 다중 선택. 폼 값이 아니라
  // 배열 상태로 따로 든다 — react-hook-form의 register는 단일 값 입력을 전제로 한다.
  const [industries, setIndustries] = useState<string[]>(() => programIndustries(program))
  const industryField = useTagTokenField({
    table: 'industry_tags',
    noun: '분야',
    adminMenu: '분야 관리',
    value: industries,
    onChange: setIndustries,
    max: MAX_PROGRAM_INDUSTRIES,
  })
  // 원장에 저장되는 값은 상태 하나뿐이므로 폼도 하나만 든다. 단계(제안/운영)는 이 값에서
  // 따라 나오는 것이라(`programStage()`) 따로 묻지 않는다.
  const [status, setStatus] = useState(() => initialStatusOf(config, program))
  // 편집 대상이 바뀌면(모달 재사용) 배치·단계 상태를 해당 프로그램 기준으로 다시 초기화한다.
  useEffect(() => {
    setDepartments(toDepartmentSegments(program))
    setManagers(toManagerSegments(program))
    setIndustries(programIndustries(program))
    setStatus(initialStatusOf(config, program))
  }, [config, program])
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: program?.title ?? '',
      category: program?.category ?? '',
      host_organization: program?.host_organization ?? '',
      start_date: program?.start_date ?? '',
      end_date: program?.end_date ?? '',
      description: program?.description ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    // 담당자는 제안·운영을 가리지 않고 필수이며, 배치는 운영 기간이 있어야 단계를 산출할 수 있다.
    // 따라서 기간이 담당자보다 앞선 선행 조건이 된다.
    if (!values.start_date || !values.end_date) {
      toast.show('운영 기간(시작일·종료일)을 입력해야 담당자를 배정할 수 있습니다.', 'warning')
      return
    }
    if (values.start_date > values.end_date) {
      toast.show('운영 종료일은 운영 시작일 이후여야 합니다.', 'warning')
      return
    }
    // 부서+담당자 배치 검증(단계별). 담당자 1명(구간) 이상은 필수다.
    const phases = computePhases(
      orgVersions ?? [],
      values.start_date || null,
      values.end_date || null,
    )
    const check = validateStaffing(departments, managers, phases)
    if (!check.ok) {
      toast.show(check.message, 'warning')
      return
    }
    const departmentRows = departments.map(({ _key, ...r }) => r)
    const managerRows = managers.map(({ _key, ...r }) => r)
    const payload = {
      title: values.title,
      status,
      // 제안 단계는 별도 기간을 두지 않는다(컬럼은 유지, 항상 null로 기록).
      proposal_start_date: null,
      proposal_end_date: null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      description: values.description || null,
      category: values.category || null,
      industries,
      // 주관을 운용하지 않는 워크스페이스는 키 자체를 빼고 보낸다 — update_entity는 넘어온
      // 키만 SET하므로, 화면에 없는 칸이 저장 때 원장 값을 null로 덮는 일이 생기지 않는다.
      ...(config.hasHostOrganization
        ? { host_organization: values.host_organization?.trim() || null }
        : {}),
    }
    try {
      if (isEdit && program) {
        // 수정은 사유를 받아야 확정된다(변동 이력에 note로 남는다).
        const reason = await askReason()
        if (!reason) return
        await update.mutateAsync({ values: payload, reason })
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
        setIndustries([])
        setStatus(initialStatusOf(config, undefined))
      }
      onClose()
    } catch {
      toast.show(
        `${isEdit ? '수정' : '등록'}에 실패했습니다. 권한과 담당자 배치를 확인하세요.`,
        'danger',
      )
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={onClose}
      size="xl"
      // 칸이 열 개를 넘는 폼이라 흰 바닥 위에 흰 칸만 늘어놓으면 어디까지가 한 묶음인지
      // 화면이 답하지 못한다(2026-09-06 사용자 지정). 바닥을 내리고 묶음마다 카드로 세운다.
      sectioned
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
      {/*
        폼을 세 카드로 나눈다(2026-09-06 사용자 지정) — 이 사업이 **무엇인가** / **언제·어디까지
        왔나** / **누가 하는가**. 셋은 채우는 시점도 고치는 빈도도 다르다.

        카드가 밀도(card, 32px)를 함께 내려주므로 컨트롤이 한 단 작아진다. 크기를 가르는 축은
        중요도가 아니라 놓이는 자리이고, 이제 이 칸들이 놓인 자리가 카드 안이다 — 종전에 수행
        조직 블록만 `DensityProvider`로 손수 내려 주던 것을 카드가 대신한다.
      */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {reasonModal}
        <Card title="기본 정보">
          <div className="space-y-3">
            <Field label="사업명" required error={errors.title?.message}>
              <Input
                id="title"
                invalid={Boolean(errors.title)}
                {...register('title', { required: '사업명은 필수입니다.' })}
              />
            </Field>
            {/*
              사업구분과 주관은 한 줄이다 — 둘 다 '이 사업이 어디서 왔나'를 답하는 같은 층위이고,
              기간·배치처럼 운영을 적는 칸보다 앞선다.

              **폭이 값을 말한다.** 사업구분은 고를 것이 서너 개뿐인데 모달 폭(xl)을 통째로 쓰면
              사업명·설명과 같은 무게로 서서, 짧은 값이 들어갈 칸이라는 사실을 폭이 감춘다. 같은
              판단을 `ProgramHostField`가 이미 자기 입력에 적용하고 있었다 — 그 규칙을 이 칸에도
              맞추고, 남는 폭은 실제로 긴 값이 들어갈 주관이 가져간다.

              한 쪽만 운용하는 워크스페이스에서도 줄이 무너지지 않는다 — 사업구분이 없으면 주관이
              홀로 그 줄을 쓰고, 주관이 없으면 사업구분이 자기 폭(w-48)만 차지한다.

              주관을 register 대신 watch/setValue로 잇는 이유 — '자체 프로젝트' 체크가 입력값 자체를
              갈아 끼우므로 값의 주인이 입력 엘리먼트가 아니라 폼 상태여야 한다.
            */}
            {(config.categories.length > 0 || config.hasHostOrganization) && (
              <div className="flex flex-wrap items-start gap-3">
                {config.categories.length > 0 && (
                  <Field label="사업구분" className="w-48 shrink-0">
                    <Select id="category" {...register('category')}>
                      <option value="">미지정</option>
                      {config.categories.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {config.hasHostOrganization && (
                  <div className="min-w-0 flex-1">
                    <ProgramHostField
                      value={watch('host_organization')}
                      onChange={(next) => setValue('host_organization', next)}
                    />
                  </div>
                )}
              </div>
            )}
            {/*
              분야. 사업구분 바로 아래에 둔다 — 둘 다 '이 사업이 무엇인가'를 가르는 분류 축이고,
              기간·배치처럼 운영을 적는 칸과는 층위가 다르다. 태그 원장은 스타트업과 공유한다.
            */}
            <Field label="분야" hint={industryField.hint} hintInline={industryField.hintInline}>
              {industryField.control}
            </Field>
            {/*
              설명은 기본 정보에 함께 든다. 이 사업이 무엇인지 적는 마지막 칸이고, 종전처럼 폼 맨
              끝에 두면 한 줄짜리 소개를 적으러 수행 조직 표 전체를 지나 스크롤해야 한다.
            */}
            <Field label="설명">
              <TextArea
                id="description"
                rows={3}
                placeholder="상세 헤더에 표시할 사업 소개"
                {...register('description')}
              />
            </Field>
          </div>
        </Card>

        {/* 기간이 수행 조직 바로 위에 서는 것이 순서다 — 아래 카드는 이 기간에서 단계를 산출해
            열리므로, 못 채우는 이유를 물었을 때 답이 바로 위 칸에 있어야 한다. */}
        <Card title="상태와 기간">
          <ProgramStatusFields
            hasProposalStage={config.hasProposalStage}
            status={status}
            onStatusChange={setStatus}
            register={register}
          />
        </Card>
        {/*
          이 폼의 마지막이자 유일하게 **앞 칸에 종속된 칸**이다(운영 기간이 있어야 단계를 산출해
          열린다).

          이름이 '배치'가 아니라 '수행 조직'인 이유(2026-09-06 사용자 지적) — 안에 든 칸이 '부서
          구성'과 '담당자'이므로 바깥이 '배치'면 안쪽 '담당자 배치'와 같은 낱말이 두 층에서 겹쳐
          **바깥이 무엇을 더 묻는 칸인지 화면이 답하지 못한다**. 바깥 묶음이 실제로 답하는 물음은
          "이 사업을 어느 부서가, 누가 맡는가"이고 그것이 곧 수행 조직이다.

          라벨(`Field`)이 아니라 **카드 제목**인 것은 이것이 입력 한 칸이 아니라 묶음이기 때문이다
          — 앞의 두 카드와 같은 층에 서야 셋이 나란한 묶음으로 읽힌다. 필수 표식은 제목에 그대로
          붙인다(`formText.required`가 규격을 갖는다): 이 사업이 저장되려면 반드시 채워야 하는
          묶음이므로, 표식이 없으면 저장을 눌러야 비로소 알게 된다. 규칙 설명은 제목 옆 ⓘ에
          접는다(2026-09-01) — 제목 줄에 규칙이 같은 크기로 붙으면 무엇을 묻는 자리인지가 규칙에
          밀린다.
        */}
        <Card
          title={
            <>
              수행 조직
              <span className={cn('ml-0.5', formText.required)}>*</span>
            </>
          }
          help={
            '부서를 추가하고 그 안에서 담당자를 고릅니다.\n' +
            '운영 기간에 조직개편이 걸치면 그 경계마다 단계로 나눠 따로 설정합니다.\n' +
            '메인 부서는 1개, 부서 협업비율의 합은 100%여야 합니다.\n' +
            '각 부서는 담당자 투입률 합이 그 부서의 협업비율만큼 채워져야 하고, PM은 1명 이상입니다.'
          }
        >
          {(() => {
            const phases = computePhases(orgVersions ?? [], watch('start_date'), watch('end_date'))
            if (!watch('start_date') || !watch('end_date')) {
              return (
                <p className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 px-3 py-4 text-body text-gray-500">
                  운영 기간(시작·종료일)을 입력하면 수행 부서와 담당자를 정할 수 있습니다.
                </p>
              )
            }
            if (phases.length === 0) {
              return (
                <p className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 px-3 py-4 text-body text-gray-500">
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
                    // 단계가 하나뿐이면 나눌 단계가 없다 — 상자와 기간 표기를 걷어 층을 줄인다.
                    phased={phases.length > 1}
                  />
                ))}
                {lastEnd < (watch('end_date') || '') && (
                  <p className="text-caption text-gray-600">
                    {lastEnd} 이후 기간은 조직개편 확정(조직 버전 발행) 후 설정할 수 있습니다.
                  </p>
                )}
              </div>
            )
          })()}
        </Card>
      </form>
    </Modal>
  )
}
