import { TagSelect } from '@/features/admin/TagSelect'

interface HrTagSelectProps {
  /** 태그 원장 테이블명(position_tags / rank_tags / pay_step_tags). */
  table: string
  /** 현재 선택값(태그명 문자열). 빈 문자열은 미선택. */
  value: string
  onChange: (value: string) => void
}

/**
 * 임직원 직책/직급/호봉 선택 드롭다운. 공용 TagSelect(ADMIN 태그 원장 연동)의 얇은 래퍼다.
 */
export function HrTagSelect(props: HrTagSelectProps) {
  return <TagSelect {...props} />
}
