import { useCallback, useMemo, useState } from 'react'
import type { MasterCandidate, ParticipantRow } from '@/features/program/participantHooks'
import { isChoiceReady, type PersonChoice } from '@/features/program/participantPerson'

/**
 * 계정생성 창의 좌우 이관 상태 — **왼쪽은 계정 없음, 오른쪽은 계정 있음**이고 그 사이를 옮기는 일이
 * 곧 계정을 세우고 거두는 일이다.
 *
 * 상태를 화면이 아니라 여기 두는 이유는 두 목록이 **같은 사실의 두 면**이기 때문이다. 한쪽에서
 * 빼면 반드시 다른 쪽에 서야 하고, 그 짝을 화면에서 손으로 맞추면 어느 한 줄이 양쪽에 서거나
 * 어느 쪽에도 서지 않는 순간이 생긴다.
 *
 * **확정 전에는 아무 일도 일어나지 않는다**(결재선 설정 창과 같은 규약) — 옮기는 동안 계정이
 * 세워지거나 명부 행이 지워지면, 잘못 눌렀다는 것을 알아차렸을 때 이미 되돌릴 수 없다.
 */

/** 좌측(계정 없음)에 서는 한 줄. */
export interface LeftRow {
  masterId: string
  name: string
  /** 이름 아래 회색 한 줄 — 원장 연락처, 되돌림 줄이면 지금 걸려 있는 계정. */
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
  /** 올린 줄이 **누구로** 들어오는가. 키는 원장 행 id다. */
  const [people, setPeople] = useState<Record<string, PersonChoice>>({})

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
        meta: c.email ?? c.phone ?? '원장에 연락처 없음 · 오른쪽에서 입력',
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
    // 입력해 둔 값(`people`)은 지우지 않는다 — 잘못 내렸다가 다시 올릴 때 방금 적은 이메일을
    // 두 번 적게 하지 않는다.
    else setDrafts((prev) => prev.filter((d) => d.id !== row.masterId))
  }, [])

  /**
   * 전체 넣기·전체 빼기는 **보이는 것에만** 걸린다 — 그래서 목록을 인자로 받는다.
   *
   * 검색으로 좁혀 놓은 뜻을 '전체'가 무시하면, 담당자는 자기가 무엇을 옮겼는지 화면에서
   * 확인할 수 없는 상태로 확정 버튼 앞에 서게 된다.
   */
  const addAll = useCallback((rows: LeftRow[]) => rows.forEach(add), [add])
  const takeAll = useCallback((rows: RightRow[]) => rows.forEach(take), [take])

  // 행이 기본값을 정할 때마다 불린다. 참조가 매 렌더 바뀌면 그 행의 effect가 다시 돌아
  // 방금 고친 값을 되돌리므로 여기서 고정한다.
  const setChoice = useCallback(
    (masterId: string, next: PersonChoice) =>
      setPeople((prev) => ({ ...prev, [masterId]: next })),
    [],
  )

  const reset = useCallback(() => {
    setDrafts([])
    setRemoved([])
    setPeople({})
  }, [])

  const additions = useMemo(
    () => drafts.map((d) => ({ masterId: d.id, choice: people[d.id] })),
    [drafts, people],
  )

  return {
    left,
    right,
    people,
    add,
    addAll,
    take,
    takeAll,
    setChoice,
    reset,
    /** 확정하면 계정을 세우고 명부에 담을 줄. */
    additions,
    /** 확정하면 명부에서 빠질 줄(되돌릴 수 없다). */
    removals: removed,
    /** 올린 줄마다 누구인지가 정해졌는가. */
    ready: drafts.every((d) => isChoiceReady(people[d.id])),
    dirty: drafts.length > 0 || removed.length > 0,
  }
}
