import { useEffect, useState } from 'react'

/**
 * 입력값을 지연시켜 반환한다 — 매 키 입력마다 원장을 조회하지 않도록 검색어를 눅인다.
 *
 * 도메인 지식이 하나도 없는 부품이라 여기 산다. 회의록의 외부 참석자 검색과 회의실 예약
 * 검색이 같은 동작을 쓰므로 공용 자리에 둔다.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
