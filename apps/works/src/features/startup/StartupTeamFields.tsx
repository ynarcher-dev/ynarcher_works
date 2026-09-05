import { Button, Checkbox, Input, Select, TextArea, TokenMultiSelect } from '@ynarcher/ui'
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form'
import { Cell, Label, RowActions, RowBox } from '@/features/startup/StartupFieldLabel'
import { EMPLOYMENT_OPTIONS } from '@/features/startup/startupProfile'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

interface Props {
  register: UseFormRegister<StartupDetailFormValues>
  control: Control<StartupDetailFormValues>
  capabilities: string[]
  setCapabilities: (c: string[]) => void
}

/**
 * 통합 수정 폼의 '팀·조직' 입력 섹션.
 *
 * 핵심 팀원 한 줄이 상자 안 여러 칸이 된 이유는 칸이 늘어서가 아니라 **자유 텍스트에 섞여 있던
 * 사실을 꺼냈기** 때문이다. 재직 형태(전업·겸업)는 초기 기업 심사의 실질 리스크라 한 줄 설명에
 * 적히거나 안 적히는 값으로 두면 안 된다 — 칸이 되면 비어 있다는 사실 자체가 보인다.
 *
 * 대표 지분율 칸은 두지 않는다. 주주 구성 이력의 최신 스냅샷이 이미 아는 값이고, 여기 또 받으면
 * 캡테이블을 고쳤을 때 이 칸만 옛 값으로 남는다.
 */
export function StartupTeamFields({ register, control, capabilities, setCapabilities }: Props) {
  const members = useFieldArray({ control, name: 'members' })
  const advisors = useFieldArray({ control, name: 'advisors' })

  return (
    <div className="space-y-3">
      <Label text="창업자 역량">
        <TextArea rows={3} {...register('founderStrength')} />
      </Label>

      {/* 핵심 팀원(동적 목록) */}
      <div>
        <p className="mb-1 text-body font-medium text-gray-800">핵심 팀원</p>
        <div className="space-y-2">
          {members.fields.map((f, i) => (
            <RowBox key={f.id}>
              <Cell label="이름">
                <Input {...register(`members.${i}.name`)} />
              </Cell>
              <Cell label="역할">
                <Input {...register(`members.${i}.role`)} />
              </Cell>
              <Cell label="재직 형태">
                <Select {...register(`members.${i}.employment`)}>
                  <option value="">선택</option>
                  {EMPLOYMENT_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Cell>
              <Cell label="합류 시점">
                <Input type="month" {...register(`members.${i}.joinedAt`)} />
              </Cell>
              <Cell label="한 줄 설명" wide>
                <Input {...register(`members.${i}.background`)} />
              </Cell>
              <RowActions>
                <Checkbox label="지분 보유" wrapperClassName="mr-auto" {...register(`members.${i}.hasEquity`)} />
                <Button type="button" variant="secondary" onClick={() => members.remove(i)}>
                  삭제
                </Button>
              </RowActions>
            </RowBox>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() =>
            members.append({ name: '', role: '', background: '', employment: '', joinedAt: '', hasEquity: false })
          }
        >
          팀원 추가
        </Button>
      </div>

      {/* 조직 구성·채용 계획: 총 인원이 아니라 '어느 기능에 사람이 있는가'를 받는다
          (총원 추이는 실적 밴드의 고용 표가 답한다). */}
      <Label text="조직 구성">
        <TextArea rows={2} placeholder="개발 5 · 영업 2 · 경영지원 1 등" {...register('orgComposition')} />
      </Label>
      <Label text="채용 계획">
        <TextArea rows={2} placeholder="채용 계획 · 주요 결원" {...register('hiringPlan')} />
      </Label>

      {/* 자문단(동적 목록) */}
      <div>
        <p className="mb-1 text-body font-medium text-gray-800">자문단</p>
        <div className="space-y-2">
          {advisors.fields.map((f, i) => (
            <RowBox key={f.id}>
              <Cell label="이름">
                <Input {...register(`advisors.${i}.name`)} />
              </Cell>
              <Cell label="소속">
                <Input {...register(`advisors.${i}.affiliation`)} />
              </Cell>
              <Cell label="역할" wide>
                <Input {...register(`advisors.${i}.role`)} />
              </Cell>
              <RowActions>
                <Button type="button" variant="secondary" onClick={() => advisors.remove(i)}>
                  삭제
                </Button>
              </RowActions>
            </RowBox>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => advisors.append({ name: '', affiliation: '', role: '' })}
        >
          자문 추가
        </Button>
      </div>

      {/* 핵심 역량(태그 입력) — 표준 토큰 입력. */}
      <div>
        <p className="mb-1 text-body font-medium text-gray-800">핵심 역량</p>
        <TokenMultiSelect<string>
          selected={capabilities}
          onChange={setCapabilities}
          getKey={(c) => c}
          getLabel={(c) => c}
          allowFreeText
          createOption={(text) => text}
          placeholder="역량 입력 후 Enter"
        />
      </div>
    </div>
  )
}
