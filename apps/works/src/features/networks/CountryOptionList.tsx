import type { CountryTag } from '@/features/networks/countryOptions'

export interface CountryOptionListProps {
  options: { domestic: CountryTag[]; overseas: CountryTag[] } | undefined
  /** 맨 위에 서는 빈 값의 라벨(`미확인`·`국가 일괄` 등). 생략하면 빈 값 줄을 두지 않는다. */
  emptyLabel?: string
}

/**
 * 국가 `<option>` 한 벌 — 자국이 맨 위, 그 아래 구분선, 나머지는 가나다순.
 *
 * 목록을 부품으로 뺀 이유는 줄 수가 아니라 **순서와 구분선이 규칙이기 때문**이다. 자국을 위로
 * 빼는 것도 둘 사이에 선을 긋는 것도 "다른 분류라서"가 아니라 "자주 쓰는 것을 위로 뺐다"는
 * 뜻이라(`useCountryOptions` 주석), 세우는 자리마다 손으로 적으면 한 곳만 순서가 달라졌을 때
 * 같은 국가가 화면마다 다른 자리에서 찾아진다. 지금 이 목록이 서는 자리는 리뷰 표의 국가 열과
 * 선택 일괄 바 둘이고, 등록 폼도 같은 규칙을 쓴다.
 */
export function CountryOptionList({ options, emptyLabel }: CountryOptionListProps) {
  const domestic = options?.domestic ?? []
  const overseas = options?.overseas ?? []
  return (
    <>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {domestic.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      {domestic.length > 0 && overseas.length > 0 && <option disabled>──────────</option>}
      {overseas.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </>
  )
}
