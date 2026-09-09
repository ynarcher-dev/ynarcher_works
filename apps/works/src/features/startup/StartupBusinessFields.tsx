import { TextArea } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import { FieldGrid } from '@/components/FieldGrid'
import { Label } from '@/components/FormRowFields'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 통합 수정 폼의 '비즈니스' 입력 섹션.
 *
 * 입력 카드의 단위와 순서는 조회 화면의 카드와 같다 — 어긋나면 어느 카드를 고치러 들어왔는지가
 * 흐려지고, 저장 후 값이 어디에 가서 붙는지도 예측할 수 없다.
 *
 * **칸은 세로로 쌓지 않고 가로로 세운다**(2026-09-09 사용자 지정). 다섯 칸이 모두 서술형이라
 * 한 줄에 둘씩 선다(`lg`) — 셋씩 세우면 한글 스무 자에서 줄이 바뀌어 문장을 쓰는 칸이 아니게
 * 되고, 전폭으로 두면 한 줄이 어디서 끝나는지 눈이 따라가지 못한다. 폭을 정하는 것은 이 화면이
 * 아니라 칸의 종류다(FieldGrid).
 */
export function StartupBusinessFields({
  register,
}: {
  register: UseFormRegister<StartupDetailFormValues>
}) {
  return (
    <FieldGrid>
      {/* 한 줄 소개는 기본 데이터 카드에서 입력한다(헤더 부제로 노출). */}
      <Label text="비즈니스 모델" width="lg">
        <TextArea rows={3} {...register('businessModel')} />
      </Label>
      <Label text="타겟 고객" width="lg">
        <TextArea rows={3} {...register('targetMarket')} />
      </Label>
      <Label text="수익 구조" width="lg">
        <TextArea rows={3} placeholder="과금 방식 · 단가 · 마진 구조" {...register('revenueModel')} />
      </Label>
      <Label text="판매 채널" width="lg">
        <TextArea rows={2} placeholder="직판 / 대리점 / 온라인 / B2G 등" {...register('salesChannel')} />
      </Label>
      <Label text="생산 방식" width="lg">
        <TextArea rows={2} placeholder="자체 생산 / OEM·ODM / 외주 등" {...register('supplyMode')} />
      </Label>
    </FieldGrid>
  )
}
