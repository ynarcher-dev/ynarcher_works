import { Select } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'

interface HrTagSelectProps {
  /** 태그 원장 테이블명(position_tags / rank_tags / pay_step_tags). */
  table: string
  /** 현재 선택값(태그명 문자열). 빈 문자열은 미선택. */
  value: string
  onChange: (value: string) => void
}

/**
 * 임직원 직책/직급/호봉 선택 드롭다운. ADMIN 태그 관리 원장에서 옵션을 실시간으로 채운다.
 * 태그 목록에 없는 레거시 자유 입력값도 유실 없이 현재값으로 노출한다.
 */
export function HrTagSelect({ table, value, onChange }: HrTagSelectProps) {
  const { data: tags } = useTags(table)
  const options = tags ?? []
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {value && !options.some((t) => t.name === value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((t) => (
        <option key={t.id} value={t.name}>
          {t.name}
        </option>
      ))}
    </Select>
  )
}
