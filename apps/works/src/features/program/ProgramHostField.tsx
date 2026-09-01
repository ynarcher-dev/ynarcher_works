import { Checkbox, Field, Input } from '@ynarcher/ui'
import { useState } from 'react'
import { SELF_HOSTED_PROGRAM_HOST } from '@/features/program/config'

interface ProgramHostFieldProps {
  /** 주관 값(원장에 그대로 저장되는 문자열). 빈 문자열 = 미지정. */
  value: string
  onChange: (next: string) => void
}

/**
 * 주관 입력 칸(기관명 자유 입력 + '자체 프로젝트' 체크).
 *
 * 체크를 켜면 입력을 잠그고 주관 값 자체가 '자체 프로젝트'가 된다 — 별도 플래그를 두지 않는
 * 이유는 config.ts의 `SELF_HOSTED_PROGRAM_HOST` 주석 참조. 잠긴 칸에 그 문구를 그대로 띄우는
 * 것은 "보이는 것이 저장되는 것"을 지키기 위해서다. 종전에 적어 둔 기관명을 남겨 두면
 * 화면과 저장값이 어긋난 채로 저장 버튼을 누르게 된다.
 *
 * 체크를 풀면 직전에 적어 둔 기관명으로 돌아온다 — 한 번 잘못 눌렀다고 입력이 사라지면
 * 다시 타이핑해야 한다. 되돌릴 값은 체크를 켜는 순간에만 갈무리하므로 오래된 값이 남지 않는다.
 */
export function ProgramHostField({ value, onChange }: ProgramHostFieldProps) {
  const selfHosted = value === SELF_HOSTED_PROGRAM_HOST
  const [restore, setRestore] = useState('')
  return (
    // 라벨 층은 Field가 소유한다 — 규격을 화면에서 적으면 같은 모달 안에서도 칸마다 라벨이 달라진다.
    <Field
      as="div"
      label="주관"
      hint={`이 사업을 발주·주관하는 기관 또는 기업 · 받아 온 사업이 아니면 '${SELF_HOSTED_PROGRAM_HOST}'`}
    >
      {/*
        체크는 입력 칸 **바로 옆**에 선다. 라벨 줄 오른쪽 끝에 두었을 때는 폼 폭이 넓어질수록
        스위치가 자기가 바꾸는 칸에서 멀어져, 화면 반대편의 체크가 왼쪽 칸을 잠그는 것으로
        보였다 — 붙여 두면 무엇을 바꾸는 스위치인지 자리로 드러난다.

        칸 자체도 폭을 줄인다. 기관명은 한 줄에 몇 글자 들어가지 않는데 모달 폭을 다 쓰면
        빈 칸이 사업명·설명과 같은 무게로 서서, 짧은 값이 들어갈 칸이라는 사실을 숨긴다.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 max-w-lg flex-1">
          <Input
            id="host_organization"
            placeholder="예: 중소벤처기업부, 창업진흥원"
            disabled={selfHosted}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </span>
        <Checkbox
          checked={selfHosted}
          onChange={(e) => {
            if (e.target.checked) {
              setRestore(value)
              onChange(SELF_HOSTED_PROGRAM_HOST)
            } else {
              onChange(restore)
            }
          }}
          label={SELF_HOSTED_PROGRAM_HOST}
          wrapperClassName="shrink-0"
        />
      </div>
    </Field>
  )
}
