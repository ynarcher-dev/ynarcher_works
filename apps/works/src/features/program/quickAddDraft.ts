import { useCallback, useState } from 'react'
import { patchAt, removeAt } from '@/components/ItemRows'
import { findPersonaMatches } from '@/features/program/ledgerMatch'
import type { MasterTable } from '@/features/program/participantPersona'
import { buildEntries, type BulkDecision, type BulkEntry } from '@/features/program/rosterBulk'

/**
 * 원장 신규 등록 폼의 값과 대조 상태 — 화면(`LedgerQuickAdd`)에서 갈라 둔다.
 *
 * 가르는 이유는 재사용이 아니라 **한 파일이 컴포넌트와 함수를 함께 내보내지 않는다**는
 * 규칙이다(react-refresh). 값과 판정이 컴포넌트 옆에 있으면 그 파일이 화면이면서 동시에
 * 부품이 되고, 다음 사람이 어느 쪽을 고쳐야 하는지 파일 이름으로 답할 수 없다.
 *
 * **한 건이 아니라 여러 줄이다**(2026-09-10 사용자 지정). 명함 여러 장을 한 번에 정리하는
 * 자리라 한 건씩 창을 열고 닫는 것이 실제 불편이었다. 그러면서도 **CSV 업로드와는 다른
 * 길**로 남는다 — 저쪽은 파일이 목록을 정하고 여기서는 손이 정한다.
 *
 * 판정은 CSV 업로드와 **같은 함수**(`findPersonaMatches` → `buildEntries`)를 쓴다. 두 길이
 * 같은 값에 다른 답을 내면 담당자는 어느 쪽을 믿어야 할지 알 수 없고, 무엇보다 한쪽에만 있는
 * 방어(폼 안 중복 접기)가 다른 쪽에서 그대로 구멍이 된다.
 */

/** 폼 한 줄이 들고 있는 값. 원장 넷의 칸 이름 차이는 저장 훅이 흡수한다. */
export interface QuickAddDraft {
  name: string
  contactName: string
  email: string
  phone: string
}

/** 화면에 서는 한 줄 — 값 + React key. 순번을 키로 쓰면 가운데 줄을 지웠을 때 값이 밀려 붙는다. */
export interface QuickAddRow extends QuickAddDraft {
  key: string
}

export const EMPTY_DRAFT: QuickAddDraft = { name: '', contactName: '', email: '', phone: '' }

let seq = 0
const newRow = (): QuickAddRow => ({ ...EMPTY_DRAFT, key: `r${++seq}` })

/**
 * 줄들을 원장과 대조한다. 화면이 직접 부르지 않고 모달이 **저장 흐름에서** 부른다 —
 * 타이핑마다 원장을 긁으면 그 요청이 실제 저장보다 훨씬 잦다.
 *
 * 이름이 빈 줄은 대조에도 등록에도 끼지 않는다(이름 없이는 둘 다 성립하지 않는다). 그래도
 * **줄 번호는 원래 자리로** 센다 — 담당자가 화면에서 세는 줄과 알림이 가리키는 줄이 달라지면
 * 어느 줄을 고쳐야 하는지 알 수 없다.
 */
export async function checkRows(
  master: MasterTable,
  rows: readonly QuickAddRow[],
  mappedMasterIds: ReadonlySet<string>,
): Promise<BulkEntry[]> {
  const filled = rows
    .map((r, i) => ({ line: i + 1, name: r.name, contactName: r.contactName, email: r.email, phone: r.phone }))
    .filter((r) => r.name.trim() !== '')
  const matches = await findPersonaMatches(
    master,
    filled.map((r) => ({ name: r.name, email: r.email, phone: r.phone })),
  )
  return buildEntries(filled, matches, mappedMasterIds)
}

/**
 * 폼 상태 — 값과 대조 결과를 **함께** 비운다.
 *
 * 둘을 따로 비우면 지나간 대조 결과가 바뀐 값 옆에 남아, 이미 고친 줄을 두고 "이미
 * 있습니다"라고 말하게 된다. 값이 바뀌면 판정은 언제나 무효다.
 */
export function useQuickAddRows() {
  const [rows, setRows] = useState<QuickAddRow[]>([newRow()])
  /** 대조 결과. `null`이면 아직 안 돌았거나 값이 바뀌어 무효가 된 것이다. */
  const [entries, setEntries] = useState<BulkEntry[] | null>(null)

  const patch = useCallback((i: number, next: Partial<QuickAddDraft>) => {
    setRows((prev) => patchAt<QuickAddRow>(prev, i, next))
    setEntries(null)
  }, [])

  const add = useCallback(() => {
    setRows((prev) => [...prev, newRow()])
    setEntries(null)
  }, [])

  const remove = useCallback((i: number) => {
    setRows((prev) => removeAt(prev, i))
    setEntries(null)
  }, [])

  /**
   * 걸린 줄의 결정을 바꾼다(있는 행 담기 ↔ 그래도 새로 만들기).
   *
   * 길을 막지 않는 이유는 동명이인·동명 법인이 실제로 있기 때문이고, 기본값이 '있는 행
   * 담기'인 이유는 손이 저절로 가는 쪽이 정본이어야 하기 때문이다. 제외로 내려간 줄
   * (이미 담김·폼 안 중복)은 바꾸지 못한다 — 그 둘은 판단이 아니라 사실이다.
   */
  const decide = useCallback((line: number, decision: BulkDecision) => {
    setEntries((prev) =>
      prev
        ? prev.map((e) => (e.row.line === line && e.match && !e.alreadyMapped ? { ...e, decision } : e))
        : prev,
    )
  }, [])

  const reset = useCallback(() => {
    setRows([newRow()])
    setEntries(null)
  }, [])

  return { rows, entries, setEntries, patch, add, remove, decide, reset }
}
