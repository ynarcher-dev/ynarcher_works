import { Select, TextArea } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import { FieldLine, FieldLines } from '@/components/FieldGrid'
import { DEV_INSOURCING_OPTIONS, DEV_STAGE_OPTIONS } from '@/features/startup/startupProfile'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 통합 수정 폼의 '제품·기술' 입력 섹션.
 *
 * 개발 단계·개발 내재화는 자유 텍스트가 아니라 고정 선택지다 — 같은 뜻을 사람마다 다르게 적으면
 * (자체개발 / 인하우스 / 내재화) 나중에 목록에서 걸러볼 수 없고, 고를 값이 정해져 있다는 것 자체가
 * 무엇을 답해야 하는 칸인지 말해 준다.
 *
 * **다섯 칸이 한 줄에 하나씩 선다**(2026-09-09 저녁 사용자 지정 — `FieldLines`, 조회의
 * `InfoRows`와 같은 축). 선택지 둘도 서술 셋과 같은 줄 규격을 받는다 — 이 카드에서 가르는
 * 축은 값의 종류가 아니라 **한 물음의 다섯 답**이고, 답끼리 폭이 갈리면 그중 둘만 다른 성격의
 * 값처럼 읽힌다. 선택지를 따로 감싼 2열 격자를 걷은 것도 같은 이유였다.
 */
export function StartupTechFields({
  register,
}: {
  register: UseFormRegister<StartupDetailFormValues>
}) {
  return (
    <FieldLines>
      <FieldLine label="제품·서비스">
        <TextArea rows={2} autoGrow placeholder="무엇을 만드는가" {...register('product')} />
      </FieldLine>
      <FieldLine label="개발 단계">
        <Select {...register('devStage')}>
          <option value="">선택</option>
          {DEV_STAGE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </FieldLine>
      <FieldLine label="개발 내재화">
        <Select {...register('devInsourcing')}>
          <option value="">선택</option>
          {DEV_INSOURCING_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </FieldLine>
      <FieldLine label="핵심 기술">
        <TextArea rows={2} autoGrow placeholder="무엇이 자체 기술인가" {...register('coreTech')} />
      </FieldLine>
      <FieldLine label="차별 역량">
        <TextArea
          rows={2}
          autoGrow
          placeholder="우리만 가진 것 — 독점 기술 · 독점 계약 · 데이터 자산"
          {...register('differentiator')}
        />
      </FieldLine>
    </FieldLines>
  )
}
