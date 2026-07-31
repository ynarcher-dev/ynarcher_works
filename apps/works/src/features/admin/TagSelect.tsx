import { Select } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'

interface TagSelectProps {
  /** 태그 원장 테이블명(예: industry_tags / investment_stage_tags). */
  table: string
  /** 현재 선택값(태그명 문자열). 빈 문자열은 미선택. */
  value: string
  onChange: (value: string) => void
  id?: string
  invalid?: boolean
  /** 빈 값 옵션 라벨. 기본 '선택 안 함'. */
  placeholder?: string
}

/**
 * ADMIN 태그 관리 원장(*_tags)에서 옵션을 실시간으로 채우는 선택 드롭다운.
 * 태그 목록에 없는 레거시 자유 입력값도 유실 없이 현재값으로 노출한다.
 *
 * 옵션 순서는 ADMIN에서 매긴 노출순위(sort_order)를 그대로 따른다. 레거시 값은 그 순서에
 * 자리가 없으므로 목록 맨 뒤에 따로 붙인다 — 앞에 끼우면 태그 순서가 한 칸씩 밀린 것처럼 보이고,
 * 정리 대상인 값이 정작 정식 태그들보다 먼저 읽힌다.
 */
export function TagSelect({ table, value, onChange, id, invalid, placeholder = '선택 안 함' }: TagSelectProps) {
  const { data: tags } = useTags(table)
  const options = tags ?? []
  const legacy = value && !options.some((t) => t.name === value) ? value : null
  return (
    <Select id={id} invalid={invalid} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((t) => (
        <option key={t.id} value={t.name}>
          {t.name}
        </option>
      ))}
      {legacy && <option value={legacy}>{legacy}</option>}
    </Select>
  )
}
