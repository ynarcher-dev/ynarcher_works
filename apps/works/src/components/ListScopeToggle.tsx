import { SegmentedToggle, type SegmentedOption } from '@ynarcher/ui'
import { useMemo } from 'react'
import type { ListScope } from '@/lib/listScope'

export interface ListScopeToggleProps {
  scope: ListScope
  onChange: (scope: ListScope) => void
  /**
   * 원장 단위 명사(네트워크·스타트업·운용펀드·프로젝트). 두 칸은 `내 {명사}` / `전체 {명사}`로
   * 선다 — 한 축의 두 값이므로 명사가 같아야 한다. 명사가 갈리면(내 참여 / 전체 관리)
   * 세그먼트가 형태로 말하는 '같은 것의 범위 둘'과 어긋나 서로 다른 축처럼 읽힌다.
   */
  noun: string
}

/**
 * 목록 범위 토글(내 ~ / 전체 ~) — 원장 목록 5종 공용.
 *
 * 2026-09-05에 워크스페이스마다 사이드바 두 줄로 갈려 있던 범위를 목록 안의 축 하나로 모았다.
 * 범위를 메뉴로 두면 그것이 '어디에 있는가'가 되어 구분·지역·상태 같은 다른 축과 함께 걸 수
 * 없고, 메뉴를 옮길 때마다 걸어 둔 검색어와 필터가 사라진다.
 *
 * 칩을 늘어놓지 않는 이유는 배타 선택이기 때문이다 — 칩은 낱개라 여러 개를 켤 수 있는 것처럼
 * 보이지만, 세그먼트는 한 테두리 안에 칸을 나눠 담아 반드시 하나만 켜진다고 형태가 말한다.
 */
export function ListScopeToggle({ scope, onChange, noun }: ListScopeToggleProps) {
  const options = useMemo<SegmentedOption<ListScope>[]>(
    () => [
      { key: 'mine', label: `내 ${noun}` },
      { key: 'all', label: `전체 ${noun}` },
    ],
    [noun],
  )

  return (
    <SegmentedToggle label="목록 범위" options={options} value={scope} onChange={onChange} />
  )
}
