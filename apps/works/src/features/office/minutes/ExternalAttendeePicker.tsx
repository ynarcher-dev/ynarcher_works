import { TokenMultiSelect } from '@ynarcher/ui'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

/**
 * 외부참석자(사외 인원) 이름 입력 피커. 시스템 계정이 없어 접근 권한(RLS)과 무관한 단순 명단이며,
 * 표준 토큰 입력(TokenMultiSelect)의 자유입력 모드를 써서 이름을 Enter로 칩으로 쌓는다.
 */
export function ExternalAttendeePicker({ value, onChange }: Props) {
  return (
    <TokenMultiSelect<string>
      selected={value}
      onChange={onChange}
      getKey={(s) => s}
      getLabel={(s) => s}
      allowFreeText
      createOption={(text) => text}
      placeholder="외부참석자 이름 입력 후 Enter (예: 홍길동/○○社)"
    />
  )
}
