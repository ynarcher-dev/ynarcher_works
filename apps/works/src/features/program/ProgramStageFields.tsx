import { Input, Select } from '@ynarcher/ui'
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

/**
 * 프로그램 단계(제안/운영) 이원화 입력 블록.
 * 제안 단계 상태는 시도/선정/미선정 3분류이며 별도 기간(날짜)이 없다.
 * '선정'을 고르면 운영 단계(준비)로 즉시 자동 전환된다(전환 처리는 상위 onProposalStatusChange).
 * 운영 단계 라디오는 제안이 '선정'일 때만 활성화되고, 운영 기간(start/end_date)만 입력한다.
 */
export function ProgramStageFields({
  stage,
  onStageChange,
  proposalStatus,
  onProposalStatusChange,
  operationStatus,
  onOperationStatusChange,
  register,
}: {
  stage: ProgramStage
  onStageChange: (stage: ProgramStage) => void
  proposalStatus: string
  onProposalStatusChange: (status: string) => void
  operationStatus: string
  onOperationStatusChange: (status: string) => void
  register: UseFormRegister<ProgramFormValues>
}) {
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
            <label
              key={value}
              className={
                'flex items-center gap-1.5 text-body ' +
                (enabled ? 'cursor-pointer text-gray-800' : 'cursor-not-allowed text-gray-300')
              }
              title={enabled ? undefined : "제안이 '선정'된 후 운영 단계로 넘어갈 수 있습니다."}
            >
              <input
                type="radio"
                name="program-stage"
                className="h-4 w-4 accent-brand"
                checked={stage === value}
                disabled={!enabled}
                onChange={() => onStageChange(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className={sectionClass(stage === 'PROPOSAL')}>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <span className="text-body font-medium text-gray-800">제안</span>
          <span className="text-caption text-gray-600">
            선정 시 운영 단계로 전환 · 미선정 시 프로젝트 종료
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <label className="text-caption text-gray-600" htmlFor="proposal_status">
              상태
            </label>
            <Select
              id="proposal_status"
              value={proposalStatus}
              disabled={stage !== 'PROPOSAL'}
              onChange={(e) => onProposalStatusChange(e.target.value)}
            >
              {PROGRAM_PROPOSAL_STATUSES.map((key) => (
                <option key={key} value={key}>
                  {PROGRAM_STATUS_LABEL[key]}
                </option>
              ))}
            </Select>
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
            <Select
              id="operation_status"
              value={operationStatus}
              disabled={stage !== 'OPERATION'}
              onChange={(e) => onOperationStatusChange(e.target.value)}
            >
              {PROGRAM_OPERATION_STATUSES.map((key) => (
                <option key={key} value={key}>
                  {PROGRAM_STATUS_LABEL[key]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-caption text-gray-600" htmlFor="start_date">
              시작일
            </label>
            <Input id="start_date" type="date" {...register('start_date')} />
          </div>
          <div>
            <label className="text-caption text-gray-600" htmlFor="end_date">
              종료일
            </label>
            <Input id="end_date" type="date" {...register('end_date')} />
          </div>
        </div>
      </div>
    </div>
  )
}
