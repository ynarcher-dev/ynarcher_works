import { useQuery } from '@tanstack/react-query'
import { COUNTRY_TAG_TABLE } from '@/features/networks/config'
import { supabase } from '@/lib/supabase'

export interface CountryTag {
  id: string
  name: string
  region_tag_id: string | null
  is_domestic: boolean
}

/**
 * 국가 선택지.
 *
 * 자국(한국)을 맨 위로 빼고 나머지는 가나다순으로 세운다 — 실제 등록의 대부분이 한국인데
 * 가나다 어딘가에 섞여 있으면 매번 찾아 내려가야 한다. 화면은 둘 사이에 구분선을 그어
 * "다른 분류라서"가 아니라 "자주 쓰는 것을 위로 뺐다"는 뜻을 말한다.
 *
 * ADMIN 노출순위(sort_order)를 정렬에 쓰지 않는 이유: 국가는 업무상 우열이 없어 순위를
 * 매길 근거가 없고, 순위가 같은 값들이 뒤섞이면 매번 다른 자리에서 찾게 된다. 자국이
 * 먼저인가만 순위이고 나머지는 이름이 답한다.
 */
export function useCountryOptions() {
  return useQuery({
    queryKey: ['networks', 'country-options'],
    queryFn: async (): Promise<{ domestic: CountryTag[]; overseas: CountryTag[] }> => {
      const { data, error } = await supabase
        .from(COUNTRY_TAG_TABLE)
        .select('id, name, region_tag_id, is_domestic')
        .is('deleted_at', null)
        .order('name', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as CountryTag[]
      return {
        domestic: rows.filter((r) => r.is_domestic),
        overseas: rows.filter((r) => !r.is_domestic),
      }
    },
  })
}

/** 자국 국가의 id(등록 폼 기본값). 아직 안 읽혔으면 undefined. */
export function defaultCountryId(
  options: { domestic: CountryTag[] } | undefined,
): string | undefined {
  return options?.domestic[0]?.id
}

/**
 * 자국이 속한 권역 id 집합. 권역 태그에서 '국내'를 이름으로 찾지 않는 이유는 이름이
 * ADMIN에서 바뀔 수 있는 값이기 때문이다 — 국내/해외를 아는 것은 국가 원장의
 * `is_domestic`이고, 권역은 그 국가가 가리키는 부모일 뿐이다.
 */
export function domesticRegionIds(
  options: { domestic: CountryTag[] } | undefined,
): Set<string> {
  return new Set(
    (options?.domestic ?? []).map((c) => c.region_tag_id).filter((id): id is string => Boolean(id)),
  )
}
