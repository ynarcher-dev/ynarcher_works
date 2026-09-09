import { TextArea } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import { FieldRow } from '@/components/FieldGrid'
import { Label } from '@/components/FormRowFields'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 통합 수정 폼의 '비즈니스' 입력 섹션.
 *
 * 입력 카드의 단위와 순서는 조회 화면의 카드와 같다 — 어긋나면 어느 카드를 고치러 들어왔는지가
 * 흐려지고, 저장 후 값이 어디에 가서 붙는지도 예측할 수 없다.
 *
 * **다섯 칸이 한 행에 선다**(2026-09-09 사용자 지정 — `FieldRow`). 이 카드는 칸이 전부 적는
 * 칸이라 종류로 가를 것이 없고, 그때 12칸 격자에 폭을 맞추면 다섯이 2·2·1이나 3·2로 접히면서
 * 마지막 줄 옆이 빈다. **칸 수가 곧 열 수**이므로 폭은 이 화면도 칸의 종류도 아닌 칸의 개수가
 * 정한다.
 */
export function StartupBusinessFields({
  register,
}: {
  register: UseFormRegister<StartupDetailFormValues>
}) {
  return (
    <FieldRow>
      {/* 한 줄 소개는 기본 데이터 카드에서 입력한다(헤더 부제로 노출). */}
      <Label text="비즈니스 모델">
        <TextArea rows={4} {...register('businessModel')} />
      </Label>
      <Label text="타겟 고객">
        <TextArea rows={4} {...register('targetMarket')} />
      </Label>
      <Label text="수익 구조">
        <TextArea rows={4} placeholder="과금 방식 · 단가 · 마진" {...register('revenueModel')} />
      </Label>
      <Label text="판매 채널">
        <TextArea rows={4} placeholder="직판 / 대리점 / 온라인" {...register('salesChannel')} />
      </Label>
      <Label text="생산 방식">
        <TextArea rows={4} placeholder="자체 / OEM·ODM / 외주" {...register('supplyMode')} />
      </Label>
    </FieldRow>
  )
}
