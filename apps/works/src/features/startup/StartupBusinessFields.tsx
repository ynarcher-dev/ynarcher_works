import { TextArea } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import { Label } from '@/features/startup/StartupFieldLabel'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 통합 수정 폼의 '비즈니스' 입력 섹션.
 *
 * 입력 카드의 단위와 순서는 조회 화면의 카드와 같다 — 어긋나면 어느 카드를 고치러 들어왔는지가
 * 흐려지고, 저장 후 값이 어디에 가서 붙는지도 예측할 수 없다.
 */
export function StartupBusinessFields({
  register,
}: {
  register: UseFormRegister<StartupDetailFormValues>
}) {
  return (
    <div className="space-y-3">
      {/* 한 줄 소개는 기본 데이터 카드에서 입력한다(헤더 부제로 노출). */}
      <Label text="비즈니스 모델">
        <TextArea rows={3} {...register('businessModel')} />
      </Label>
      <Label text="타겟 고객">
        <TextArea rows={3} {...register('targetMarket')} />
      </Label>
      <Label text="수익 구조">
        <TextArea rows={3} placeholder="과금 방식 · 단가 · 마진 구조" {...register('revenueModel')} />
      </Label>
      <Label text="판매 채널">
        <TextArea rows={2} placeholder="직판 / 대리점 / 온라인 / B2G 등" {...register('salesChannel')} />
      </Label>
      <Label text="생산 방식">
        <TextArea rows={2} placeholder="자체 생산 / OEM·ODM / 외주 등" {...register('supplyMode')} />
      </Label>
    </div>
  )
}
