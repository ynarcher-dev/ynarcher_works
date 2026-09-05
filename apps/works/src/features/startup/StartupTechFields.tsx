import { Select, TextArea } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import { Label } from '@/features/startup/StartupFieldLabel'
import { DEV_INSOURCING_OPTIONS, DEV_STAGE_OPTIONS } from '@/features/startup/startupProfile'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 통합 수정 폼의 '제품·기술' 입력 섹션.
 *
 * 개발 단계·개발 내재화는 자유 텍스트가 아니라 고정 선택지다 — 같은 뜻을 사람마다 다르게 적으면
 * (자체개발 / 인하우스 / 내재화) 나중에 목록에서 걸러볼 수 없고, 고를 값이 정해져 있다는 것 자체가
 * 무엇을 답해야 하는 칸인지 말해 준다.
 */
export function StartupTechFields({
  register,
}: {
  register: UseFormRegister<StartupDetailFormValues>
}) {
  return (
    <div className="space-y-3">
      <Label text="제품·서비스">
        <TextArea rows={3} placeholder="무엇을 만드는가" {...register('product')} />
      </Label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Label text="개발 단계">
          <Select {...register('devStage')}>
            <option value="">선택</option>
            {DEV_STAGE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Label>
        <Label text="개발 내재화">
          <Select {...register('devInsourcing')}>
            <option value="">선택</option>
            {DEV_INSOURCING_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      <Label text="핵심 기술">
        <TextArea rows={3} placeholder="무엇이 자체 기술인가" {...register('coreTech')} />
      </Label>
      <Label text="차별 역량">
        <TextArea
          rows={3}
          placeholder="우리만 가진 것 — 독점 기술 · 독점 계약 · 데이터 자산 · 전환비용"
          {...register('differentiator')}
        />
      </Label>
    </div>
  )
}
