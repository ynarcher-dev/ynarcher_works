import { useCallback, useMemo, useState } from 'react'
import type { MasterCandidate } from '@/features/program/participantHooks'

/**
 * 명단 담기 창의 좌우 이관 상태 — **왼쪽은 원장, 오른쪽은 이번에 담을 대상**이다.
 *
 * 계정생성 창(`participantTransfer`)과 축이 다르다. 저기는 두 목록이 *같은 사실의 두 면*
 * (계정 없음 / 있음)이라 오른쪽에 이미 선 줄이 있고 내리면 실제로 무언가가 빠지지만, 여기서
 * 오른쪽은 **아직 아무 데도 없는 장바구니**다. 그래서 이 훅은 원장을 읽지도 쓰지도 않고
 * 확정(`담기`)은 창이 한다 — 옮기는 동안 명단 행이 생기면, 잘못 눌렀다는 것을 알아차렸을 때
 * 이미 담겨 있다.
 *
 * **오른쪽 줄은 검색어를 따르지 않는다.** 왼쪽은 서버가 검색어로 좁힌 결과(원장 수천 건 중
 * 50건)이고, 오른쪽은 담당자가 지금까지 고른 것이라 검색어를 바꿨다고 사라지면 안 된다 —
 * 이 창을 좌우로 가른 이유가 바로 그 목록을 눈에 두는 것이다.
 */
export interface RosterPick {
  /** 왼쪽 기둥에 서는 줄(검색 결과에서 이미 고른 것을 뺀 나머지). */
  left: MasterCandidate[]
  /** 오른쪽 기둥 — 확정하면 명단에 담길 대상. 고른 순서대로 선다. */
  right: MasterCandidate[]
  checkedLeft: string[]
  checkedRight: string[]
  toggleLeft: (id: string) => void
  toggleRight: (id: string) => void
  moveRight: () => void
  moveLeft: () => void
  moveAllRight: () => void
  moveAllLeft: () => void
  reset: () => void
}

export function useRosterPick(candidates: MasterCandidate[] | undefined): RosterPick {
  /** 고른 대상은 후보 객체 그대로 든다 — 오른쪽 줄도 이름·연락처를 보여 줘야 한다. */
  const [right, setRight] = useState<MasterCandidate[]>([])
  const [checkedLeft, setCheckedLeft] = useState<string[]>([])
  const [checkedRight, setCheckedRight] = useState<string[]>([])

  const left = useMemo(() => {
    const taken = new Set(right.map((c) => c.id))
    return (candidates ?? []).filter((c) => !taken.has(c.id))
  }, [candidates, right])

  const toggleLeft = useCallback(
    (id: string) =>
      setCheckedLeft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  )
  const toggleRight = useCallback(
    (id: string) =>
      setCheckedRight((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  )

  /** 옮기는 것은 체크한 줄이다. 이미 담긴 대상은 애초에 체크되지 않으므로 여기서 다시 거르지 않는다. */
  const moveRight = useCallback(() => {
    setRight((prev) => {
      const has = new Set(prev.map((c) => c.id))
      const add = (candidates ?? []).filter((c) => checkedLeft.includes(c.id) && !has.has(c.id))
      return [...prev, ...add]
    })
    setCheckedLeft([])
  }, [candidates, checkedLeft])

  const moveLeft = useCallback(() => {
    setRight((prev) => prev.filter((c) => !checkedRight.includes(c.id)))
    setCheckedRight([])
  }, [checkedRight])

  /**
   * 전체 넣기는 **보이는 줄에만** 걸린다(검색으로 좁힌 뜻을 '전체'가 무시하면, 담당자는 자기가
   * 무엇을 옮겼는지 화면에서 확인하지 못한 채 확정 버튼 앞에 선다). 이미 담긴 대상은 고를 수
   * 없는 줄이라 함께 넘어가지 않는다.
   */
  const moveAllRight = useCallback(() => {
    setRight((prev) => {
      const has = new Set(prev.map((c) => c.id))
      return [...prev, ...left.filter((c) => !c.alreadyMapped && !has.has(c.id))]
    })
    setCheckedLeft([])
  }, [left])

  const moveAllLeft = useCallback(() => {
    setRight([])
    setCheckedRight([])
  }, [])

  const reset = useCallback(() => {
    setRight([])
    setCheckedLeft([])
    setCheckedRight([])
  }, [])

  return {
    left,
    right,
    checkedLeft,
    checkedRight,
    toggleLeft,
    toggleRight,
    moveRight,
    moveLeft,
    moveAllRight,
    moveAllLeft,
    reset,
  }
}
