import { Field, Input, Select } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import {
  PROGRAM_OPERATION_STATUSES,
  PROGRAM_PROPOSAL_STATUSES,
  PROGRAM_STATUS_LABEL,
} from '@/features/program/config'

/** 프로그램 등록/편집 폼 값(상태는 셀렉트가 별도 상태로 소유). */
export interface ProgramFormValues {
  title: string
  /** 사업구분(공공/민간/매출). 빈 문자열 = 미지정. */
  category: string
  /**
   * 주관(발주·주관하는 기관 또는 기업, 자유 서술). 빈 문자열 = 미지정.
   * 운용 여부는 워크스페이스가 정한다(ProgramWorkspaceConfig.hasHostOrganization).
   */
  host_organization: string
  start_date: string
  end_date: string
  description: string
}

interface ProgramStatusFieldsProps {
  /** 제안 단계 운용 여부(ProgramWorkspaceConfig.hasProposalStage). false면 운영 4종만 고른다. */
  hasProposalStage: boolean
  status: string
  onStatusChange: (status: string) => void
  register: UseFormRegister<ProgramFormValues>
}

/**
 * 상태 · 운영 기간 입력 블록 — 어느 워크스페이스에서든 같은 한 줄이다.
 *
 * **단계는 고르는 것이 아니라 상태에서 따라 나온다(2026-08-21).** 이전에는 AC에만 단계
 * 라디오(제안/운영)와 테두리 블록 두 개가 있었고, 운영 라디오는 제안 상태가 '선정'일 때만
 * 열렸다. 그래서 사업 하나를 등록하려면 단계를 고르고 → 그 단계의 상태를 고르는 두 번의
 * 결정을 거쳐야 했는데, 정작 원장에 저장되는 값은 **상태 하나**였다. 두 결정이 한 값으로
 * 합쳐지는 구조라 단계는 사용자가 답할 질문이 아니라 상태에서 계산되는 값이었던 셈이다
 * (`programStage()`가 이미 그 계산을 하고 있다).
 *
 * 잠금도 함께 걷었다. 순서를 강제하던 것은 화면뿐이고 원장에는 그런 제약이 없었다 — 두 원장의
 * CHECK 제약은 M&A·PROJECT에서 제안 상태를 **금지**할 뿐 AC의 상태 전이 순서는 보지 않는다.
 * 화면에만 있는 규칙은 데이터를 지켜 주지 못하면서 등록만 어렵게 한다.
 *
 * 단계라는 사실 자체는 남긴다 — AC의 셀렉트는 `optgroup`으로 제안/운영을 갈라 보여주고,
 * 진행 현황(`ProgramPipeline`)도 계속 두 줄로 그린다. 없앤 것은 단계를 **묻는 절차**이지
 * 단계라는 개념이 아니다.
 */
export function ProgramStatusFields({
  hasProposalStage,
  status,
  onStatusChange,
  register,
}: ProgramStatusFieldsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="상태">
        <Select value={status} onChange={(e) => onStatusChange(e.target.value)}>
          {hasProposalStage ? (
            // 제안·운영을 묶어 보여주되 어느 쪽이든 바로 고를 수 있다. 묶음 이름이 곧 단계다.
            <>
              <optgroup label="제안 단계">
                <StatusOptions statuses={PROGRAM_PROPOSAL_STATUSES} />
              </optgroup>
              <optgroup label="운영 단계">
                <StatusOptions statuses={PROGRAM_OPERATION_STATUSES} />
              </optgroup>
            </>
          ) : (
            <StatusOptions statuses={PROGRAM_OPERATION_STATUSES} />
          )}
        </Select>
      </Field>
      {/* 담당자 배치 단계가 이 기간에서 산출되므로, 어느 상태에서든 기간은 필수다. */}
      <Field label="시작일" required>
        <Input type="date" {...register('start_date')} />
      </Field>
      <Field label="종료일" required>
        <Input type="date" {...register('end_date')} />
      </Field>
    </div>
  )
}

/** 라벨은 수명주기 정의(config.ts)에서 가져와 폼·목록이 같은 말을 쓰게 한다. */
function StatusOptions({ statuses }: { statuses: readonly string[] }) {
  return (
    <>
      {statuses.map((key) => (
        <option key={key} value={key}>
          {PROGRAM_STATUS_LABEL[key]}
        </option>
      ))}
    </>
  )
}
