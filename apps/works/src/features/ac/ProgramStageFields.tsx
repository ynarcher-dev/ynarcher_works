import { Input, Select } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import {
  PROGRAM_OPERATION_STATUSES,
  PROGRAM_PROPOSAL_STATUSES,
  PROGRAM_STATUS_LABEL,
  type ProgramStage,
} from '@/features/ac/config'

/** 프로그램 등록/편집 폼 값(상태는 단계별 셀렉트가 별도 상태로 소유). */
export interface ProgramFormValues {
  title: string
  /** 사업구분(공공/민간/매출). 빈 문자열 = 미지정. */
  category: string
  proposal_start_date: string
  proposal_end_date: string
  start_date: string
  end_date: string
  description: string
}

/**
 * 프로그램 단계(제안/운영) 이원화 입력 블록.
 * 단계 라디오로 현재 단계를 고르면 해당 섹션의 상태 셀렉트만 활성화된다.
 * 기간은 단계와 무관하게 상시 입력 가능(제안 단계에서도 운영 예정 기간을 미리 잡는다).
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
              ['PROPOSAL', '제안 단계'],
              ['OPERATION', '운영 단계'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-1.5 text-body text-gray-800"
            >
              <input
                type="radio"
                name="program-stage"
                className="h-4 w-4 accent-brand"
                checked={stage === value}
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
          <span className="text-caption text-gray-400">제안서 작성~발표 기간</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <label className="text-caption text-gray-500" htmlFor="proposal_status">
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
          <div>
            <label className="text-caption text-gray-500" htmlFor="proposal_start_date">
              시작일
            </label>
            <Input id="proposal_start_date" type="date" {...register('proposal_start_date')} />
          </div>
          <div>
            <label className="text-caption text-gray-500" htmlFor="proposal_end_date">
              종료일
            </label>
            <Input id="proposal_end_date" type="date" {...register('proposal_end_date')} />
          </div>
        </div>
      </div>

      <div className={sectionClass(stage === 'OPERATION')}>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <span className="text-body font-medium text-gray-800">운영</span>
          <span className="text-caption text-gray-400">실제 행사 관리 기간</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <label className="text-caption text-gray-500" htmlFor="operation_status">
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
            <label className="text-caption text-gray-500" htmlFor="start_date">
              시작일
            </label>
            <Input id="start_date" type="date" {...register('start_date')} />
          </div>
          <div>
            <label className="text-caption text-gray-500" htmlFor="end_date">
              종료일
            </label>
            <Input id="end_date" type="date" {...register('end_date')} />
          </div>
        </div>
      </div>
    </div>
  )
}
