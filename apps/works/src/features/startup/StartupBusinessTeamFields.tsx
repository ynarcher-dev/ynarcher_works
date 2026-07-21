import { Button, Input, TagChip, TextArea, cardText } from '@ynarcher/ui'
import { useState, type ReactNode } from 'react'
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form'
import type { StartupDetailFormValues } from '@/features/startup/StartupDetailForm'

/** 라벨 + 입력 래퍼. */
function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-body font-medium text-gray-800">{text}</p>
      {children}
    </div>
  )
}

interface Props {
  register: UseFormRegister<StartupDetailFormValues>
  control: Control<StartupDetailFormValues>
  capabilities: string[]
  setCapabilities: (c: string[]) => void
}

/**
 * 통합 수정 폼의 '비즈니스 & 팀 역량' 입력 섹션.
 * 핵심 팀원은 동적 목록(useFieldArray), 핵심 역량은 태그 입력으로 관리한다.
 */
export function StartupBusinessTeamFields({ register, control, capabilities, setCapabilities }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'members' })
  const [capInput, setCapInput] = useState('')

  const addCap = () => {
    const c = capInput.trim()
    if (c && !capabilities.includes(c)) setCapabilities([...capabilities, c])
    setCapInput('')
  }
  const removeCap = (c: string) => setCapabilities(capabilities.filter((x) => x !== c))

  return (
    <div className="space-y-5">
      {/* 비즈니스 */}
      <div className="space-y-3">
        <h3 className={cardText.subhead}>비즈니스</h3>
        {/* 한 줄 소개는 기본 데이터 카드에서 입력한다(헤더 부제로 노출). */}
        <Label text="비즈니스 모델">
          <TextArea rows={3} {...register('businessModel')} />
        </Label>
        <Label text="타겟 시장 & 고객">
          <TextArea rows={3} {...register('targetMarket')} />
        </Label>
        <Label text="경쟁 우위 / 차별점">
          <TextArea rows={3} {...register('competitiveEdge')} />
        </Label>
      </div>

      {/* 팀 역량 */}
      <div className="space-y-3">
        <h3 className={cardText.subhead}>팀 역량</h3>
        <Label text="대표 / 창업자 역량">
          <TextArea rows={3} {...register('founderStrength')} />
        </Label>

        {/* 핵심 팀원(동적 목록) */}
        <div>
          <p className="mb-1 text-body font-medium text-gray-800">핵심 팀원</p>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-2">
                {/* Input 래퍼가 w-full이라 폭 클래스는 바깥 div에 준다(안쪽 input에 주면 슬롯만 좁고 여백이 남음). */}
                <div className="w-28 shrink-0">
                  <Input placeholder="이름" {...register(`members.${i}.name`)} />
                </div>
                <div className="w-28 shrink-0">
                  <Input placeholder="역할" {...register(`members.${i}.role`)} />
                </div>
                <div className="min-w-0 flex-1">
                  <Input placeholder="한 줄 설명" {...register(`members.${i}.background`)} />
                </div>
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => remove(i)}>
                  삭제
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => append({ name: '', role: '', background: '' })}
          >
            팀원 추가
          </Button>
        </div>

        {/* 핵심 역량(태그 입력) */}
        <div>
          <p className="mb-1 text-body font-medium text-gray-800">핵심 역량</p>
          <div className="flex gap-2">
            <Input
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCap()
                }
              }}
              placeholder="역량 입력 후 Enter"
            />
            <Button type="button" variant="outline" onClick={addCap}>
              추가
            </Button>
          </div>
          {capabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {capabilities.map((c) => (
                <TagChip key={c} onClick={() => removeCap(c)} title="제거">
                  {c} <span aria-hidden className="text-gray-500">×</span>
                </TagChip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
