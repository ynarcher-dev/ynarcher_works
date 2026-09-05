import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/** 원장 목록이 담는 범위. 'mine'은 내가 만들었거나 맡은 것, 'all'은 볼 수 있는 전부. */
export type ListScope = 'mine' | 'all'

/** 넓은 범위를 가리키는 주소 값. 기본(mine)은 주소에 적지 않는다. */
const ALL = 'all'

/**
 * 목록 범위를 주소(`?scope=`)에 싣고 읽는다 — STARTUP·NETWORKS·FUND·사업 3종 공용.
 *
 * 범위가 컴포넌트 상태가 아니라 주소인 이유는 링크가 범위까지 실어 나르기 때문이다
 * (대시보드 '내 데이터베이스'·'내 사업' 카드가 내 범위로 들어오고, 상세 뒤로가기는 전체
 * 범위로 돌아온다 — 내 것이 아닌 레코드를 열었을 때 '내 ~' 목록에는 그 행이 없다).
 *
 * 기본 범위를 주소에 적지 않는 것은 같은 화면을 가리키는 주소가 둘이 되지 않게 하기
 * 위함이고, 히스토리에 쌓지 않는 것(replace)은 토글이 화면 이동이 아니라 이 화면의 상태
 * 변경이기 때문이다 — 뒤로가기가 토글 횟수만큼 소모되면 목록에서 나가지를 못한다.
 */
export function useListScope(): [ListScope, (next: ListScope) => void] {
  const [params, setParams] = useSearchParams()
  const scope: ListScope = params.get('scope') === ALL ? ALL : 'mine'

  const setScope = useCallback(
    (next: ListScope) => setParams(next === ALL ? { scope: ALL } : {}, { replace: true }),
    [setParams],
  )

  return [scope, setScope]
}

/** 범위를 실은 목록 경로(기본 범위는 적지 않는다). 상세 뒤로가기·대시보드 링크가 쓴다. */
export function listPathOf(basePath: string, scope: ListScope): string {
  return scope === ALL ? `${basePath}?scope=${ALL}` : basePath
}
