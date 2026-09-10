import { useCallback, useMemo, useState } from 'react'
import type { MasterCandidate, ParticipantRow } from '@/features/program/participantHooks'
import {
  isPersonReady,
  needsPerson,
  resolvePerson,
  type PersonInput,
} from '@/features/program/participantPerson'

/**
 * 계정생성 창의 좌우 이관 상태 — **왼쪽은 계정 없음, 오른쪽은 계정 있음**이고 그 사이를 옮기는 일이
 * 곧 계정을 세우고 거두는 일이다.
 *
 * 상태를 화면이 아니라 여기 두는 이유는 두 목록이 **같은 사실의 두 면**이기 때문이다. 한쪽에서
 * 빼면 반드시 다른 쪽에 서야 하고, 그 짝을 화면에서 손으로 맞추면 어느 한 줄이 양쪽에 서거나
 * 어느 쪽에도 서지 않는 순간이 생긴다.
 *
 * **옮기는 것은 체크한 줄이다**(2026-09-10 사용자 지정). 줄을 누르면 곧바로 건너가던
 * 종전 방식은 한 번에 한 줄뿐이라, 스무 곳에 계정을 세우는 기수 시작에 스무 번을 눌러야
 * 했다. 체크 상태를 여기 두는 이유도 목록과 같다 — 어느 줄이 체크됐는가와 그 줄이 어느
 * 기둥에 서 있는가는 함께 움직여야 하고(옮긴 줄의 체크는 풀린다), 화면에서 손으로 맞추면
 * 옮겨진 뒤에도 체크가 남아 가운데 버튼의 건수가 거짓을 말한다.
 *
 * **확정 전에는 아무 일도 일어나지 않는다**(결재선 설정 창과 같은 규약) — 옮기는 동안 계정이
 * 세워지거나 명부 행이 지워지면, 잘못 눌렀다는 것을 알아차렸을 때 이미 되돌릴 수 없다.
 */

/** 좌측(계정 없음)에 서는 한 줄. */
export interface LeftRow {
  masterId: string
  name: string
  /**
   * 원장 연락처(되돌림 줄이면 지금 걸려 있는 계정).
   *
   * **화면에는 서지 않고 검색만 탄다**(2026-09-10). 왼쪽 기둥에서 하는 일은 이름으로 찾아
   * 고르는 것이고, 연락처는 옮기고 나서 오른쪽 기둥이 답한다. 줄에서 걷으면서도 여기 남긴
   * 것은 이메일 조각으로 찾아 들어오는 길이 실제로 쓰이기 때문이다 — 검색칸의 안내 문구가
   * 무엇으로 찾을 수 있는지를 대신 말한다.
   */
  meta: string
  /**
   * 확정하면 명부에서 **실제로 빠지는** 행의 id. 우측에서 내린 줄만 값을 갖는다.
   *
   * 두 갈래(아직 안 담은 후보 / 방금 내린 기존 행)를 한 모양으로 맞춘 이유는 담당자가 하는
   * 일이 같기 때문이다 — 둘 다 "왼쪽에 있고, 누르면 오른쪽으로 간다". 다른 것은 확정할 때의
   * 파급뿐이고, 그 차이는 이 한 칸이 답한다.
   */
  removingParticipantId: string | null
  /** 우측으로 올릴 때 쓰는 원장 후보. 되돌림 줄은 제자리로 돌아갈 뿐이라 null이다. */
  candidate: MasterCandidate | null
}

/** 우측(계정 있음)에 서는 한 줄. */
export type RightRow =
  | {
      /** 이미 명부에 있는 줄 — 계정이 서 있고, 내리면 그 줄이 지워진다. */
      kind: 'existing'
      participantId: string
      masterId: string
      name: string
      personName: string | null
      personEmail: string | null
    }
  | {
      /** 이번에 올린 줄 — 아직 아무것도 세워지지 않았고, 누구로 들어올지를 이 줄에서 정한다. */
      kind: 'draft'
      masterId: string
      name: string
      candidate: MasterCandidate
    }

/** 그 줄이 검색어에 걸리는가. 견주는 값은 그 줄이 실제로 보여 주는 것뿐이다. */
function hits(row: { name: string; meta: string }, lowerTerm: string): boolean {
  if (!lowerTerm) return true
  return `${row.name} ${row.meta}`.toLowerCase().includes(lowerTerm)
}

export function useParticipantTransfer(
  candidates: MasterCandidate[] | undefined,
  participants: ParticipantRow[],
  search: string,
) {
  /** 이번에 올린 대상(원장 후보 그대로). 순서는 올린 순서다. */
  const [drafts, setDrafts] = useState<MasterCandidate[]>([])
  /** 이번에 내린 기존 행(`participant_id`). 확정 전까지는 표시일 뿐이다. */
  const [removed, setRemoved] = useState<string[]>([])
  /**
   * 담당자가 그 줄에 적은 명의. 키는 원장 행 id다.
   *
   * **원장이 명의를 다 알고 있는 줄은 여기 들어오지 않는다** — 대부분의 줄이 그렇고, 그래서
   * 이 표는 보통 비어 있다. 원장 값을 미리 복사해 두지 않는 것이 요점이다: 복사해 두면
   * 화면이 원장의 사본을 들게 되어, 저장 직전에 원장이 바뀌어도 옛 값을 보낸다.
   */
  const [typed, setTyped] = useState<Record<string, PersonInput>>({})
  /** 지금 체크된 줄(원장 행 id). 기둥마다 따로 센다 — 가운데 버튼이 방향별로 서 있다. */
  const [checkedLeft, setCheckedLeft] = useState<string[]>([])
  const [checkedRight, setCheckedRight] = useState<string[]>([])

  const term = search.trim().toLowerCase()

  const right = useMemo<RightRow[]>(() => {
    // 이번에 올린 줄이 위에 선다 — 그 줄만 입력을 기다리고 있으므로, 기존 수십 건 아래로
    // 밀리면 담당자가 무엇을 채워야 하는지 찾으러 스크롤해야 한다.
    const fresh: RightRow[] = drafts.map((c) => ({
      kind: 'draft',
      masterId: c.id,
      name: c.name,
      candidate: c,
    }))
    const kept: RightRow[] = participants
      .filter((p) => p.master_id && !removed.includes(p.id))
      .map((p) => ({
        kind: 'existing',
        participantId: p.id,
        masterId: p.master_id!,
        name: p.targetName,
        personName: p.accountName,
        personEmail: p.accountEmail,
      }))
    return [...fresh, ...kept]
  }, [drafts, participants, removed])

  const left = useMemo<LeftRow[]>(() => {
    // 내린 줄이 맨 위에 선다(방금 한 조작의 결과는 눈에 보이는 자리에 있어야 되돌릴 수 있다).
    const back: LeftRow[] = participants
      .filter((p) => removed.includes(p.id) && p.master_id)
      .map((p) => ({
        masterId: p.master_id!,
        name: p.targetName,
        meta: [p.accountName, p.accountEmail].filter(Boolean).join(' · ') || '계정 정보 없음',
        removingParticipantId: p.id,
        candidate: null,
      }))
    const backIds = new Set(back.map((r) => r.masterId))
    const inRight = new Set(right.map((r) => r.masterId))
    const fresh: LeftRow[] = (candidates ?? [])
      .filter((c) => !inRight.has(c.id) && !backIds.has(c.id))
      .map((c) => ({
        masterId: c.id,
        name: c.name,
        meta: c.email ?? c.phone ?? '원장에 명의 없음 · 오른쪽에서 채웁니다',
        removingParticipantId: null,
        candidate: c,
      }))
    // 후보는 조회가 이미 걸렀고(같은 검색어), 내린 줄은 여기서 건다 — 걸지 않으면 검색으로
    // 좁힌 목록에 방금 내린 줄만 남아 검색어와 무관한 행이 하나 서 있게 된다.
    return [...back.filter((r) => hits(r, term)), ...fresh]
  }, [candidates, participants, removed, right, term])

  const add = useCallback((row: LeftRow) => {
    if (row.removingParticipantId) {
      setRemoved((prev) => prev.filter((id) => id !== row.removingParticipantId))
      return
    }
    if (row.candidate) setDrafts((prev) => [...prev, row.candidate!])
  }, [])

  const take = useCallback((row: RightRow) => {
    if (row.kind === 'existing') setRemoved((prev) => [...prev, row.participantId])
    // 입력해 둔 값(`typed`)은 지우지 않는다 — 잘못 내렸다가 다시 올릴 때 방금 적은 이메일을
    // 두 번 적게 하지 않는다.
    else setDrafts((prev) => prev.filter((d) => d.id !== row.masterId))
  }, [])

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

  /**
   * 체크는 **지금 그 기둥에 서 있는 줄**만 센다. 검색어를 바꾸면 왼쪽 목록이 갈리는데, 그때
   * 사라진 줄의 체크가 남아 있으면 가운데 버튼이 화면에 없는 건수를 세어 보여 준다.
   */
  const leftChecked = useMemo(() => {
    const visible = new Set(left.map((r) => r.masterId))
    return checkedLeft.filter((id) => visible.has(id))
  }, [checkedLeft, left])
  const rightChecked = useMemo(() => {
    const visible = new Set(right.map((r) => r.masterId))
    return checkedRight.filter((id) => visible.has(id))
  }, [checkedRight, right])

  const moveRight = useCallback(() => {
    left.filter((r) => leftChecked.includes(r.masterId)).forEach(add)
    setCheckedLeft([])
  }, [add, left, leftChecked])

  const moveLeft = useCallback(() => {
    right.filter((r) => rightChecked.includes(r.masterId)).forEach(take)
    setCheckedRight([])
  }, [right, rightChecked, take])

  /**
   * 전체 넣기·전체 빼기는 **보이는 것에만** 걸린다.
   *
   * 검색으로 좁혀 놓은 뜻을 '전체'가 무시하면, 담당자는 자기가 무엇을 옮겼는지 화면에서
   * 확인할 수 없는 상태로 확정 버튼 앞에 서게 된다.
   */
  const moveAllRight = useCallback(() => {
    left.forEach(add)
    setCheckedLeft([])
  }, [add, left])

  const moveAllLeft = useCallback(() => {
    right.forEach(take)
    setCheckedRight([])
  }, [right, take])

  const setPerson = useCallback(
    (masterId: string, next: PersonInput) => setTyped((prev) => ({ ...prev, [masterId]: next })),
    [],
  )

  const reset = useCallback(() => {
    setDrafts([])
    setRemoved([])
    setTyped({})
    setCheckedLeft([])
    setCheckedRight([])
  }, [])

  /**
   * 확정하면 계정을 세울 줄. `writeLedger`는 **담당자가 채운 줄**만 참이다 — 원장이 이미
   * 알고 있던 값을 되쓰는 것은 아무것도 바꾸지 않으면서 원장의 수정일만 오늘로 민다.
   */
  const additions = useMemo(
    () =>
      drafts.map((d) => ({
        masterId: d.id,
        person: resolvePerson(d, typed[d.id]),
        writeLedger: needsPerson(d),
      })),
    [drafts, typed],
  )

  return {
    left,
    right,
    typed,
    checkedLeft: leftChecked,
    checkedRight: rightChecked,
    toggleLeft,
    toggleRight,
    moveRight,
    moveLeft,
    moveAllRight,
    moveAllLeft,
    setPerson,
    reset,
    additions,
    /** 확정하면 명부에서 빠질 줄(되돌릴 수 없다). */
    removals: removed,
    /** 올린 줄마다 명의가 갖춰졌는가(원장이 답했든 담당자가 적었든). */
    ready: drafts.every((d) => isPersonReady(resolvePerson(d, typed[d.id]))),
    dirty: drafts.length > 0 || removed.length > 0,
  }
}
