import { useCallback, useMemo, useState } from 'react'
import type { MasterCandidate } from '@/features/program/participantHooks'
import type { RosterRow } from '@/features/program/rosterHooks'

/**
 * 명단 담기 창의 좌우 이관 상태 — **왼쪽은 아직 안 담긴 원장 행, 오른쪽은 이 사업 명단**이다.
 *
 * **이미 담긴 대상은 왼쪽에 서지 않는다**(2026-09-10 수정). 좌우로 가른 창에서 왼쪽은
 * '아직 아닌 것'을 뜻하는데, 담긴 줄이 거기 회색으로 서 있으면 축이 거짓을 말한다. 그렇다고
 * 목록에서 감추면 더 나쁘다 — 검색해도 안 나오니 담당자가 `새로 등록`으로 가서 **중복 원장
 * 행을 만든다**. 그래서 감추지 않고 오른쪽으로 옮긴다(계정생성 창이 기존 계정을 오른쪽에
 * 세우는 것과 같은 처리다).
 *
 * 오른쪽의 두 갈래는 성격이 다르다. `existing`은 **이미 일어난 사실**이라 이 창에서 내리지
 * 못하고(빼는 자리는 명단 표와 그 확인창이다), `draft`는 아직 아무 데도 없는 장바구니라
 * 확정 전에는 되돌릴 수 있다. 그래서 이 훅은 원장을 읽지도 쓰지도 않는다 — 옮기는 동안
 * 명단 행이 생기면, 잘못 눌렀다는 것을 알아차렸을 때 이미 담겨 있다.
 *
 * **오른쪽 줄은 검색어를 따르지 않는다.** 왼쪽은 서버가 검색어로 좁힌 결과(원장 수천 건 중
 * 50건)이고, 오른쪽은 이 사업의 사실이라 검색어를 바꿨다고 사라지면 안 된다 — 이 창을
 * 좌우로 가른 이유가 바로 그 목록을 눈에 두는 것이다.
 */
export interface RosterRightRow {
  /** `existing`은 이미 담긴 줄(이 창에서 내리지 못한다), `draft`는 이번에 담을 줄. */
  kind: 'existing' | 'draft'
  /** 원장 행 id — 두 갈래가 같은 키를 쓴다(같은 대상이 양쪽에 서지 않는다). */
  id: string
  name: string
  loginName: string | null
  email: string | null
  phone: string | null
}

export interface RosterPick {
  /** 왼쪽 기둥 — 검색 결과 중 아직 담기지도, 이번에 고르지도 않은 줄. */
  left: MasterCandidate[]
  /** 오른쪽 기둥 — 이번에 담을 줄이 위, 이미 담긴 줄이 아래. */
  right: RosterRightRow[]
  /** 확정하면 명단에 담길 대상. `담기` 버튼이 세는 값이다. */
  staged: MasterCandidate[]
  checkedLeft: string[]
  checkedRight: string[]
  toggleLeft: (id: string) => void
  setCheckedRight: (ids: string[]) => void
  moveRight: () => void
  moveLeft: () => void
  moveAllRight: () => void
  moveAllLeft: () => void
  reset: () => void
}

export function useRosterPick(
  candidates: MasterCandidate[] | undefined,
  /** 이 사업에 이미 담긴 줄(그 자격만). 검색어와 무관한 전체다. */
  existing: RosterRow[],
): RosterPick {
  /** 고른 대상은 후보 객체 그대로 든다 — 오른쪽 줄도 이름·연락처를 보여 줘야 한다. */
  const [staged, setStaged] = useState<MasterCandidate[]>([])
  const [checkedLeft, setCheckedLeft] = useState<string[]>([])
  const [checkedRight, setCheckedRight] = useState<string[]>([])

  const left = useMemo(() => {
    const taken = new Set(staged.map((c) => c.id))
    // `alreadyMapped`는 후보 조회가 이 명단과 대조해 붙인 값이다 — 그 줄은 오른쪽에 선다.
    return (candidates ?? []).filter((c) => !c.alreadyMapped && !taken.has(c.id))
  }, [candidates, staged])

  const right = useMemo<RosterRightRow[]>(() => {
    // 이번에 올린 줄이 위에 선다 — 그 줄만 아직 확정되지 않았으므로, 이미 담긴 수십 건
    // 아래로 밀리면 담당자가 방금 무엇을 골랐는지 찾으러 스크롤해야 한다.
    const fresh: RosterRightRow[] = staged.map((c) => ({
      kind: 'draft',
      id: c.id,
      name: c.name,
      loginName: c.loginName,
      email: c.email,
      phone: c.phone,
    }))
    const kept: RosterRightRow[] = existing.map((r) => ({
      kind: 'existing',
      id: r.master_id,
      name: r.name,
      loginName: r.contactName,
      email: r.email,
      phone: r.phone,
    }))
    return [...fresh, ...kept]
  }, [existing, staged])

  const toggleLeft = useCallback(
    (id: string) =>
      setCheckedLeft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  )

  const moveRight = useCallback(() => {
    setStaged((prev) => {
      const has = new Set(prev.map((c) => c.id))
      return [...prev, ...left.filter((c) => checkedLeft.includes(c.id) && !has.has(c.id))]
    })
    setCheckedLeft([])
  }, [checkedLeft, left])

  /** 내릴 수 있는 것은 이번에 올린 줄뿐이다 — 이미 담긴 줄은 체크되지 않는다. */
  const moveLeft = useCallback(() => {
    setStaged((prev) => prev.filter((c) => !checkedRight.includes(c.id)))
    setCheckedRight([])
  }, [checkedRight])

  /**
   * 전체 넣기는 **보이는 줄에만** 걸린다(검색으로 좁힌 뜻을 '전체'가 무시하면, 담당자는 자기가
   * 무엇을 옮겼는지 화면에서 확인하지 못한 채 확정 버튼 앞에 선다).
   */
  const moveAllRight = useCallback(() => {
    setStaged((prev) => {
      const has = new Set(prev.map((c) => c.id))
      return [...prev, ...left.filter((c) => !has.has(c.id))]
    })
    setCheckedLeft([])
  }, [left])

  const moveAllLeft = useCallback(() => {
    setStaged([])
    setCheckedRight([])
  }, [])

  const reset = useCallback(() => {
    setStaged([])
    setCheckedLeft([])
    setCheckedRight([])
  }, [])

  return {
    left,
    right,
    staged,
    checkedLeft,
    checkedRight,
    toggleLeft,
    /**
     * 오른쪽은 표라 선택을 통째로 받는다(머리글 체크 한 번이 여러 줄을 바꾼다). 왼쪽은 줄을
     * 눌러 하나씩 켜는 목록이라 `toggleLeft`가 그대로 남는다.
     */
    setCheckedRight,
    moveRight,
    moveLeft,
    moveAllRight,
    moveAllLeft,
    reset,
  }
}
