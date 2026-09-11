import { Button, Select } from '@ynarcher/ui'
import { CountryOptionList } from '@/features/networks/CountryOptionList'
import type { CountryTag } from '@/features/networks/countryOptions'
import type { Decision } from '@/features/networks/BulkReviewTable'

export interface BulkSelectionBarProps {
  count: number
  categoryOptions: { value: string; label: string }[]
  countryOptions: { domestic: CountryTag[]; overseas: CountryTag[] } | undefined
  onDecision: (decision: Decision) => void
  onCategory: (value: string) => void
  onCountry: (tagId: string) => void
  onClear: () => void
}

/**
 * 선택한 행에 같은 값을 한 번에 얹는 줄. 행이 하나라도 선택되어야 선다.
 *
 * 셋 다 **고르는 순간 적용되고 되돌리는 자리는 각 행의 드롭다운**이다 — 일괄은 값을 세우는
 * 지름길이지 확정이 아니며, 확정은 언제나 '최종 업로드' 하나다. 그래서 첫 줄은 값이 아니라
 * 그 축의 이름(`구분 일괄`)이고, 고른 뒤 다시 빈 값으로 돌아온다(같은 값을 두 번 얹을 수 있어야
 * 한다 — 사이에 다른 행을 골랐을 수 있다).
 */
export function BulkSelectionBar({
  count,
  categoryOptions,
  countryOptions,
  onDecision,
  onCategory,
  onCountry,
  onClear,
}: BulkSelectionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-50 px-3 py-2">
      <span className="text-caption font-medium text-gray-700">선택 {count}건</span>
      <div className="w-32">
        <Select value="" onChange={(e) => e.target.value && onDecision(e.target.value as Decision)}>
          <option value="">결정 일괄</option>
          <option value="merge">합치기</option>
          <option value="new">신규 등록</option>
          <option value="skip">미업로드</option>
        </Select>
      </div>
      <div className="w-32">
        <Select value="" onChange={(e) => e.target.value && onCategory(e.target.value)}>
          <option value="">구분 일괄</option>
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>
      {/*
        국가 일괄. 리멤버 파일에는 국가 열이 없어 국가는 연락처로 짐작하는데, 그 짐작은 묶음으로
        빗나간다 — 해외 법인 담당자·해외 체류자는 한국 번호를 그대로 쓰므로 전부 '한국'으로 선다.
        한 행씩 고치는 자리(표의 국가 열)만 있으면 그 묶음을 손보는 데 스무 번을 눌러야 한다.
      */}
      <div className="w-32">
        <Select value="" onChange={(e) => e.target.value && onCountry(e.target.value)}>
          <CountryOptionList options={countryOptions} emptyLabel="국가 일괄" />
        </Select>
      </div>
      <Button variant="secondary" onClick={onClear}>선택 해제</Button>
    </div>
  )
}
