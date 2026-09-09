import { TextArea } from '@ynarcher/ui'
import type { UseFormRegister } from 'react-hook-form'
import { FieldLine, FieldLines } from '@/components/FieldGrid'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 통합 수정 폼의 '비즈니스' 입력 섹션.
 *
 * 입력 카드의 단위와 순서는 조회 화면의 카드와 같다 — 어긋나면 어느 카드를 고치러 들어왔는지가
 * 흐려지고, 저장 후 값이 어디에 가서 붙는지도 예측할 수 없다.
 *
 * **다섯 칸이 한 줄에 하나씩 선다**(2026-09-09 저녁 사용자 지정 — `FieldLines`). 같은 날 낮에는
 * 한 행 다섯 열이었는데, 조회 화면의 이 카드가 `InfoRows`로 세로로 서 있다 — 방금 읽은 값을
 * 고치러 들어왔을 때 줄 방향이 뒤집히면 눈이 자리를 다시 찾는다. 라벨 열 폭이 6rem으로 같아
 * 두 화면에서 값의 왼쪽 끝도 같은 자리에 선다.
 */
export function StartupBusinessFields({
  register,
}: {
  register: UseFormRegister<StartupDetailFormValues>
}) {
  return (
    <FieldLines>
      {/* 한 줄 소개는 기본 데이터 카드에서 입력한다(헤더 부제로 노출). */}
      <FieldLine label="비즈니스 모델">
        <TextArea rows={2} autoGrow {...register('businessModel')} />
      </FieldLine>
      <FieldLine label="타겟 고객">
        <TextArea rows={2} autoGrow {...register('targetMarket')} />
      </FieldLine>
      <FieldLine label="수익 구조">
        <TextArea rows={2} autoGrow placeholder="과금 방식 · 단가 · 마진" {...register('revenueModel')} />
      </FieldLine>
      <FieldLine label="판매 채널">
        <TextArea rows={2} autoGrow placeholder="직판 / 대리점 / 온라인" {...register('salesChannel')} />
      </FieldLine>
      <FieldLine label="생산 방식">
        <TextArea rows={2} autoGrow placeholder="자체 / OEM·ODM / 외주" {...register('supplyMode')} />
      </FieldLine>
    </FieldLines>
  )
}
