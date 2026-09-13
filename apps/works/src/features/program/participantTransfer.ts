import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GuestAccountCandidate } from '@/features/program/participantHooks'
import {
  buildLeftRows,
  buildRightRows,
  dropStaged,
  stageAccount,
  type GuestRosterRow,
  type TransferLeftRow,
  type TransferRightRow,
} from '@/features/program/guestRoster'

/**
 * `GUEST 계정 추가` 창의 좌우 이관 상태 — **왼쪽은 이 사업 밖의 계정, 오른쪽은 이 사업의
 * GUEST 명부**이고 그 사이를 옮기는 일이 곧 명부에 잇고 거두는 일이다.
 *
 * **계정을 만들지 않는다**(2026-09-13 사용자 확정). 종전 이 창은 원장 후보를 올린 뒤 오른쪽
 * 표에서 성명·이메일·연락처를 받아 **계정을 세웠다.** 지금은 세우는 자리가 `/guest-accounts`
 * 하나이고, 여기서 하는 일은 이미 있는 계정을 고르는 것뿐이다. 그래서 입력칸이 사라지고
 * (`people`·`patchPerson`·`importLedgerPerson`·`ready`), 오른쪽 표는 계정의 사실을 읽기만 한다.
 *
 * **키는 계정 id다**(원장 행 id가 아니다). 원장 연결은 계정의 선택적 속성이라, 원장으로
 * 키를 삼으면 연결이 없는 계정은 애초에 다룰 수 없다.
 *
 * 상태를 화면이 아니라 여기 두는 이유는 두 목록이 **같은 사실의 두 면**이기 때문이다. 한쪽에서
 * 빼면 반드시 다른 쪽에 서야 하고, 그 짝을 화면에서 손으로 맞추면 어느 한 줄이 양쪽에 서거나
 * 어느 쪽에도 서지 않는 순간이 생긴다.
 *
 * **확정 전에는 아무 일도 일어나지 않는다**(결재선 설정 창과 같은 규약) — 옮기는 동안 명부
 * 줄이 생기거나 지워지면, 잘못 눌렀다는 것을 알아차렸을 때 이미 되돌릴 수 없다.
 */

export type { TransferLeftRow, TransferRightRow }

export function useParticipantTransfer(
  /** 이번 페이지의 계정 후보(서버가 검색·페이징해 보낸다). */
  candidates: GuestAccountCandidate[] | undefined,
  /** 이 사업의 현재 GUEST 명부. */
  roster: GuestRosterRow[],
  search: string,
) {
  /** 이번에 올린 계정. 순서는 올린 순서다. */
  const [staged, setStaged] = useState<GuestAccountCandidate[]>([])
  /** 이번에 내린 명부 줄(`participant_id`). 확정 전까지는 표시일 뿐이다. */
  const [removed, setRemoved] = useState<string[]>([])
  /** 지금 체크된 줄. 기둥마다 따로 센다 — 가운데 버튼이 방향별로 서 있다. */
  const [checkedLeft, setCheckedLeft] = useState<string[]>([])
  const [checkedRight, setCheckedRight] = useState<string[]>([])

  /**
   * 저장 응답이 끊겨도 서버에서는 줄이 생겼을 수 있다. 재조회한 정본 명부에 이미 선 계정은
   * `추가 예정`에서 걷어, 담당자가 같은 계정을 재전송하지 않게 한다. 실제로 생기지 않은 줄은
   * 그대로 남으므로 다시 시도할 수 있다.
   */
  const rosterUserIds = useMemo(
    () => new Set(roster.flatMap((row) => (row.userId ? [row.userId] : []))),
    [roster],
  )
  useEffect(() => {
    setStaged((prev) => {
      const next = prev.filter((row) => !rosterUserIds.has(row.userId))
      return next.length === prev.length ? prev : next
    })
  }, [rosterUserIds])

  const right = useMemo(
    () => buildRightRows(staged, roster, removed),
    [staged, roster, removed],
  )
  const left = useMemo(
    () => buildLeftRows(candidates ?? [], roster, staged, removed, search),
    [candidates, roster, staged, removed, search],
  )

  const add = useCallback((row: TransferLeftRow) => {
    if (row.kind === 'returning') {
      setRemoved((prev) => prev.filter((id) => id !== row.participantId))
      return
    }
    // 같은 계정을 두 번 올려도 한 줄이다(`stageAccount`).
    setStaged((prev) => stageAccount(prev, row.candidate))
  }, [])

  const take = useCallback((row: TransferRightRow) => {
    if (row.kind === 'member') setRemoved((prev) => [...prev, row.row.participantId])
    else setStaged((prev) => dropStaged(prev, [row.userId]))
  }, [])

  const toggleLeft = useCallback(
    (key: string) =>
      setCheckedLeft((prev) =>
        prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
      ),
    [],
  )

  /**
   * 체크는 **지금 그 기둥에 서 있는 줄**만 센다. 검색어나 페이지를 바꾸면 목록이 갈리는데,
   * 그때 사라진 줄의 체크가 남아 있으면 가운데 버튼이 화면에 없는 건수를 세어 보여 준다.
   *
   * 원본 상태에서는 지우지 않는다 — 페이지를 넘겼다 되돌아오면 체크가 그대로 있어야 한다.
   */
  const leftChecked = useMemo(() => {
    const visible = new Set(left.map((r) => r.key))
    return checkedLeft.filter((key) => visible.has(key))
  }, [checkedLeft, left])
  const rightChecked = useMemo(() => {
    const visible = new Set(right.map((r) => r.key))
    return checkedRight.filter((key) => visible.has(key))
  }, [checkedRight, right])

  const moveRight = useCallback(() => {
    left.filter((r) => leftChecked.includes(r.key)).forEach(add)
    setCheckedLeft([])
  }, [add, left, leftChecked])

  const moveLeft = useCallback(() => {
    right.filter((r) => rightChecked.includes(r.key)).forEach(take)
    setCheckedRight([])
  }, [right, rightChecked, take])

  /**
   * 전체 넣기·전체 빼기는 **보이는 것에만** 걸린다(검색·페이지가 좁힌 뜻을 '전체'가 무시하면,
   * 담당자는 자기가 무엇을 옮겼는지 확인할 수 없는 상태로 확정 버튼 앞에 서게 된다).
   */
  const moveAllRight = useCallback(() => {
    left.forEach(add)
    setCheckedLeft([])
  }, [add, left])

  const moveAllLeft = useCallback(() => {
    right.forEach(take)
    setCheckedRight([])
  }, [right, take])

  const reset = useCallback(() => {
    setStaged([])
    setRemoved([])
    setCheckedLeft([])
    setCheckedRight([])
  }, [])

  /**
   * **끝난 일은 상태에서 지운다** — 빼기는 성공하고 담기가 실패하는 순간이 실제로 있다.
   *
   * 지우지 않으면 담당자가 사유를 보고 다시 [저장]을 누를 때 이미 끝난 빼기가 **다시** 나가고,
   * 따라쓰기 확인창도 한 번 더 뜬다. 이미 사라진 줄에 대고 빼기를 또 부르는 것은 아무 일도
   * 하지 않거나(0건) 오류가 되는데, 어느 쪽이든 화면이 말하는 건수가 사실과 어긋난다.
   */
  const commitRemovals = useCallback((ids: readonly string[]) => {
    setRemoved((prev) => prev.filter((id) => !ids.includes(id)))
    setCheckedLeft([])
  }, [])

  /** 담기가 끝난 계정을 대기 목록에서 뺀다 — 같은 이유로, 성공한 것을 다시 보내지 않는다. */
  const commitAdditions = useCallback((userIds: readonly string[]) => {
    setStaged((prev) => dropStaged(prev, userIds))
    setCheckedRight([])
  }, [])

  /** 확정하면 이 사업 명부에 이어질 계정 id. */
  const additions = useMemo(() => staged.map((c) => c.userId), [staged])

  return {
    left,
    right,
    checkedLeft: leftChecked,
    checkedRight: rightChecked,
    toggleLeft,
    /**
     * 오른쪽은 표라 선택을 통째로 받는다(표의 머리글 체크가 여러 줄을 한 번에 바꾼다).
     * 왼쪽은 줄을 눌러 하나씩 켜는 목록이라 `toggleLeft`가 그대로 남는다.
     */
    setCheckedRight,
    moveRight,
    moveLeft,
    moveAllRight,
    moveAllLeft,
    reset,
    commitRemovals,
    commitAdditions,
    additions,
    /** 확정하면 명부에서 빠질 줄(되돌릴 수 없다). */
    removals: removed,
    dirty: staged.length > 0 || removed.length > 0,
  }
}
