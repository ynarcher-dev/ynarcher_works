import { createContext, useContext, type ReactNode } from 'react'

/**
 * 밀도 맥락 — 컴포넌트 크기를 가르는 유일한 축.
 *
 * 크기는 중요도가 아니라 **놓이는 자리**가 결정한다. 같은 '수정' 버튼이라도 상세 헤더에 있으면
 * 크고, 표 셀 안이면 작아야 한다. 따라서 컴포넌트에 `size` 같은 추상 크기 prop을 두지 않고,
 * 부모(Card·DataTable)가 내려주는 맥락을 자동으로 상속받는다.
 *
 * - `page`  일반 UI — 페이지 툴바, 상세 헤더, 독립 폼 (기본값)
 * - `card`  카드섹션 내부
 * - `table` 데이터 테이블 셀 내부
 *
 * 근거: 5_component_spec_rules.md §1.2
 */
export type Density = 'page' | 'card' | 'table'

const DensityContext = createContext<Density>('page')

/**
 * 하위 트리의 밀도 맥락을 고정한다. Card·DataTable이 내부적으로 감싸므로 화면 코드가 직접
 * 쓸 일은 드물다. 카드가 아닌 조밀한 영역(툴바 등)을 표 밀도로 맞출 때만 명시적으로 쓴다.
 */
export function DensityProvider({
  value,
  children,
}: {
  value: Density
  children: ReactNode
}) {
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}

/**
 * 현재 맥락을 읽는다. `override`가 주어지면 그것이 우선한다 —
 * 컴포넌트의 `density` prop이 자동 상속을 이기는 통로다.
 */
export function useDensity(override?: Density): Density {
  const inherited = useContext(DensityContext)
  return override ?? inherited
}

/** 밀도별 클래스 3종을 받아 현재 맥락의 것을 고르는 헬퍼. */
export function byDensity<T>(density: Density, map: Record<Density, T>): T {
  return map[density]
}
