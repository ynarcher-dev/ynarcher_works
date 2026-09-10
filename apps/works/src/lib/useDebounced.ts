import { useEffect, useState } from 'react'

/**
 * 입력값을 지연시켜 반환한다 — 매 키 입력마다 원장을 조회하지 않도록 검색어를 눅인다.
 *
 * 도메인 지식이 하나도 없는 부품이라 여기 산다. 종전 자리는 회의록의 외부 참석자 검색
 * 모듈이었는데, 회의실 예약 검색이 그것을 가져다 쓰기 시작한 순간 그 자리는 틀린 자리가
 * 됐다(2026-09-10에 스타트업 폼이 셋째 소비자가 되며 옮겼다).
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
