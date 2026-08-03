import { Input, Radio, Select } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import {
  PROGRAM_OPERATION_STATUSES,
  PROGRAM_PROPOSAL_STATUSES,
  PROGRAM_STATUS_LABEL,
  type ProgramStage,
} from '@/features/program/config'

/** 프로그램 등록/편집 폼 값(상태는 단계별 셀렉트가 별도 상태로 소유). */
export interface ProgramFormValues {
  title: string
  /** 사업구분(공공/민간/매출). 빈 문자열 = 미지정. */
  category: string
  start_date: string
  end_date: string
  description: string
}

interface ProgramStageFieldsProps {
  /** 제안 단계 운용 여부(ProgramWorkspaceConfig.hasProposalStage). false면 운영 입력만 남는다. */
  hasProposalStage: boolean
  stage: ProgramStage
  onStageChange: (stage: ProgramStage) => void
  proposalStatus: string
  onProposalStatusChange: (status: string) => void
  operationStatus: string
  onOperationStatusChange: (status: string) => void
  register: UseFormRegister<ProgramFormValues>
}

/**
 * 프로그램 단계(제안/운영) 이원화 입력 블록.
 * 제안 단계 상태는 시도/선정/미선정 3분류이며 별도 기간(날짜)이 없다.
 * 운영 기간(시작·종료일)은 제안 단계에서도 입력할 수 있고 필수다 — 담당자 배치 단계가 이 기간에서 나온다.
 * '선정'은 운영 단계 라디오를 열어 주기만 하고 자동으로 넘기지 않는다 — 선정(제안이 통과함)과
 * 준비(운영 채비를 함)는 서로 다른 사실이라, 자동 전환하면 선정 상태가 원장에 한 번도 남지 않는다.
 * 운영 단계 라디오는 제안이 '선정'일 때만 활성화되고, 운영 기간(start/end_date)만 입력한다.
 *
 * 제안 단계를 쓰지 않는 워크스페이스(M&A·PROJECT)에서는 단계 라디오와 제안 블록이 통째로
 * 빠지고 상태·기간이 다른 필드와 같은 평면에 놓인다 — 고를 단계가 하나뿐인데 라디오와 테두리를
 * 남겨 두면 "무언가 더 있는데 잠겨 있다"로 읽힌다.
 */
export function ProgramStageFields({
  hasProposalStage,
  stage,
  onStageChange,
  proposalStatus,
  onProposalStatusChange,
  operationStatus,
  onOperationStatusChange,
  register,
}: ProgramStageFieldsProps) {
  if (!hasProposalStage) {
    return (
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-body font-medium text-gray-800" htmlFor="operation_status">
            상태
          </label>
          <StatusSelect
            id="operation_status"
            statuses={PROGRAM_OPERATION_STATUSES}
            value={operationStatus}
            onChange={onOperationStatusChange}
          />
        </div>
        <PeriodInputs register={register} labelClassName="text-body font-medium text-gray-800" />
      </div>
    )
  }

  // 운영 단계는 제안이 '선정'된 경우에만 진입할 수 있다(미선정·시도 상태에서는 잠금).
  const operationUnlocked = proposalStatus === 'SELECTED'
  const sectionClass = (active: boolean) =>
    'rounded-radius-md border p-3 ' +
    (active ? 'border-brand/40 bg-brand/[0.03]' : 'border-gray-200')
  return (
    <div className="space-y-3">
      <div>
        <span className="text-body font-medium text-gray-800">단계</span>
        <div className="mt-1 flex gap-4">
          {(
            [
              ['PROPOSAL', '제안 단계', true],
              ['OPERATION', '운영 단계', operationUnlocked],
            ] as const
          ).map(([value, label, enabled]) => (
            <Radio
              key={value}
              name="program-stage"
              label={label}
              checked={stage === value}
              disabled={!enabled}
              onChange={() => onStageChange(value)}
              wrapperClassName={enabled ? undefined : 'opacity-70'}
              title={enabled ? undefined : "제안이 '선정'된 후 운영 단계로 넘어갈 수 있습니다."}
            />
          ))}
        </div>
      </div>

      <div className={sectionClass(stage === 'PROPOSAL')}>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <span className="text-body font-medium text-gray-800">제안</span>
          <span className="text-caption text-gray-600">
            선정 후 운영 단계로 넘어갈 수 있음 · 미선정 시 프로젝트 종료
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <label className="text-caption text-gray-600" htmlFor="proposal_status">
              상태
            </label>
            <StatusSelect
              id="proposal_status"
              statuses={PROGRAM_PROPOSAL_STATUSES}
              value={proposalStatus}
              disabled={stage !== 'PROPOSAL'}
              onChange={onProposalStatusChange}
            />
          </div>
        </div>
      </div>

      <div className={sectionClass(stage === 'OPERATION')}>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <span className="text-body font-medium text-gray-800">운영</span>
          <span className="text-caption text-gray-600">실제 행사 관리 기간</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <label className="text-caption text-gray-600" htmlFor="operation_status">
              상태
            </label>
            <StatusSelect
              id="operation_status"
              statuses={PROGRAM_OPERATION_STATUSES}
              value={operationStatus}
              disabled={stage !== 'OPERATION'}
              onChange={onOperationStatusChange}
            />
          </div>
          {/* 담당자 배치가 필수이고 배치 단계는 이 기간에서 산출되므로, 제안 단계에서도 기간은 필수다. */}
          <PeriodInputs register={register} labelClassName="text-caption text-gray-600" />
        </div>
      </div>
    </div>
  )
}

/** 상태 셀렉트. 라벨은 수명주기 정의(config.ts)에서 가져와 폼·목록이 같은 말을 쓰게 한다. */
function StatusSelect({
  id,
  statuses,
  value,
  disabled,
  onChange,
}: {
  id: string
  statuses: readonly string[]
  value: string
  disabled?: boolean
  onChange: (status: string) => void
}) {
  return (
    <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {statuses.map((key) => (
        <option key={key} value={key}>
          {PROGRAM_STATUS_LABEL[key]}
        </option>
      ))}
    </Select>
  )
}

/** 운영 기간(시작·종료일). 담당자 배치 단계를 나누는 기준이라 어느 워크스페이스에서든 필수다. */
function PeriodInputs({
  register,
  labelClassName,
}: {
  register: UseFormRegister<ProgramFormValues>
  /** 놓이는 자리에 맞춘 라벨 규격(평면 폼이면 본문, 단계 블록 안이면 캡션). */
  labelClassName: string
}) {
  return (
    <>
      <div>
        <label className={labelClassName} htmlFor="start_date">
          시작일 <span className="text-brand">*</span>
        </label>
        <Input id="start_date" type="date" {...register('start_date')} />
      </div>
      <div>
        <label className={labelClassName} htmlFor="end_date">
          종료일 <span className="text-brand">*</span>
        </label>
        <Input id="end_date" type="date" {...register('end_date')} />
      </div>
    </>
  )
}
