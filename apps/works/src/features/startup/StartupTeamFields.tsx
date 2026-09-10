import { Checkbox, Input, Select, TextArea, TokenMultiSelect } from '@ynarcher/ui'
import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form'
import { FieldLine, FieldLines } from '@/components/FieldGrid'
import { ItemRows, type ItemCol } from '@/components/ItemRows'
import { PersonPickerControl } from '@/features/networks/PersonPickerField'
import { EMPLOYMENT_OPTIONS } from '@/features/startup/startupProfile'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

interface Props {
  register: UseFormRegister<StartupDetailFormValues>
  control: Control<StartupDetailFormValues>
  capabilities: string[]
  setCapabilities: (c: string[]) => void
  /** 이 기업의 이름. 팀원을 새 인물로 등록할 때 소속으로 채운다. */
  companyName?: string
}

/** 핵심 팀원 한 줄. 한 줄 설명이 길이를 모르는 값이라 남는 폭을 가져간다. */
const MEMBER_COLS: ItemCol[] = [
  { label: '이름', kind: 'name' },
  { label: '역할', kind: 'name' },
  { label: '재직 형태', kind: 'pick' },
  { label: '합류 시점', kind: 'date' },
  { label: '한 줄 설명' },
  { label: '지분', kind: 'flag' },
]

/** 자문단 한 줄. */
const ADVISOR_COLS: ItemCol[] = [
  { label: '이름', kind: 'name' },
  { label: '소속', kind: 'name' },
  { label: '역할' },
]

/**
 * 통합 수정 폼의 '팀·조직' 입력 섹션.
 *
 * 핵심 팀원 한 줄이 여러 칸으로 갈린 이유는 칸이 늘어서가 아니라 **자유 텍스트에 섞여 있던
 * 사실을 꺼냈기** 때문이다. 재직 형태(전업·겸업)는 초기 기업 심사의 실질 리스크라 한 줄 설명에
 * 적히거나 안 적히는 값으로 두면 안 된다 — 칸이 되면 비어 있다는 사실 자체가 보인다.
 *
 * 대표 지분율 칸은 두지 않는다. 주주 구성 이력의 최신 스냅샷이 이미 아는 값이고, 여기 또 받으면
 * 캡테이블을 고쳤을 때 이 칸만 옛 값으로 남는다.
 */
export function StartupTeamFields({
  register,
  control,
  capabilities,
  setCapabilities,
  companyName,
}: Props) {
  const members = useFieldArray({ control, name: 'members' })
  const advisors = useFieldArray({ control, name: 'advisors' })

  return (
    <div className="space-y-3">
      {/* 서술 셋을 한자리에 모아 한 줄씩 세운다(2026-09-09). 종전에는 창업자 역량이 맨 위에
          홀로 서고 조직 구성·채용 계획이 목록들 사이에 끼어 있었다 — 셋 다 '이 팀이 어떤
          팀인가'를 적는 같은 성격의 칸이라 흩어 두면 어느 것이 한 묶음인지 화면이 말하지 못한다. */}
      <FieldLines>
        <FieldLine label="창업자 역량">
          <TextArea rows={2} autoGrow {...register('founderStrength')} />
        </FieldLine>
        {/* 조직 구성·채용 계획: 총 인원이 아니라 '어느 기능에 사람이 있는가'를 받는다
            (총원 추이는 실적 밴드의 고용 표가 답한다). */}
        <FieldLine label="조직 구성">
          <TextArea rows={2} autoGrow placeholder="개발 5 · 영업 2 · 경영지원 1 등" {...register('orgComposition')} />
        </FieldLine>
        <FieldLine label="채용 계획">
          <TextArea rows={2} autoGrow placeholder="채용 계획 · 주요 결원" {...register('hiringPlan')} />
        </FieldLine>
      </FieldLines>

      {/* 핵심 팀원(동적 목록) — 줄의 key는 순번이 아니라 useFieldArray가 준 id다. */}
      <div>
        <p className="mb-1 text-body font-medium text-gray-800">핵심 팀원</p>
        <ItemRows
          cols={MEMBER_COLS}
          rows={members.fields}
          rowKey={(f) => f.id}
          onRemove={(i) => members.remove(i)}
          onAdd={() =>
            members.append({
              name: '',
              networkId: null,
              role: '',
              background: '',
              employment: '',
              joinedAt: '',
              hasEquity: false,
            })
          }
          addLabel="팀원 추가"
        >
          {(_row, i) => (
            <>
              {/* 팀원도 대표자와 같은 피커다 — 사람이 사는 원장이 하나이므로 담는 손놀림도
                  하나여야 한다. 직함은 코드가 아니라 명함에 적힌 말 그대로 받는다(공동대표·
                  각자대표·CTO). 이 값이 그대로 관계 줄의 직함이 된다. */}
              <PersonPickerControl
                control={control}
                namePath={`members.${i}.name`}
                idPath={`members.${i}.networkId`}
                createCategory="startup"
                defaultAffiliation={companyName}
              />
              <Input placeholder="대표 · 공동대표 · CTO" {...register(`members.${i}.role`)} />
              <Select {...register(`members.${i}.employment`)}>
                <option value="">선택</option>
                {EMPLOYMENT_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
              <Input type="month" {...register(`members.${i}.joinedAt`)} />
              <Input {...register(`members.${i}.background`)} />
              <Checkbox aria-label="지분 보유" {...register(`members.${i}.hasEquity`)} />
            </>
          )}
        </ItemRows>
      </div>

      {/* 자문단(동적 목록) */}
      <div>
        <p className="mb-1 text-body font-medium text-gray-800">자문단</p>
        <ItemRows
          cols={ADVISOR_COLS}
          rows={advisors.fields}
          rowKey={(f) => f.id}
          onRemove={(i) => advisors.remove(i)}
          onAdd={() => advisors.append({ name: '', affiliation: '', role: '' })}
          addLabel="자문 추가"
        >
          {(_row, i) => (
            <>
              <Input {...register(`advisors.${i}.name`)} />
              <Input {...register(`advisors.${i}.affiliation`)} />
              <Input {...register(`advisors.${i}.role`)} />
            </>
          )}
        </ItemRows>
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
