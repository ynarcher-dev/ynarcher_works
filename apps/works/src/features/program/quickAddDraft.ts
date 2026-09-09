import { useState } from 'react'
import { findPersonaMatches, type PersonaMatch } from '@/features/program/ledgerMatch'
import type { MasterTable } from '@/features/program/participantPersona'

/**
 * 원장 신규 등록 폼의 값과 대조 상태 — 화면(`LedgerQuickAdd`)에서 갈라 둔다.
 *
 * 가르는 이유는 재사용이 아니라 **한 파일이 컴포넌트와 함수를 함께 내보내지 않는다**는
 * 규칙이다(react-refresh). 값과 판정이 컴포넌트 옆에 있으면 그 파일이 화면이면서 동시에
 * 부품이 되고, 다음 사람이 어느 쪽을 고쳐야 하는지 파일 이름으로 답할 수 없다.
 */

/** 폼이 들고 있는 값. 원장 넷의 칸 이름 차이는 저장 훅(`useCreateLedgerEntry`)이 흡수한다. */
export interface QuickAddDraft {
  name: string
  contactName: string
  email: string
  phone: string
}

export const EMPTY_DRAFT: QuickAddDraft = { name: '', contactName: '', email: '', phone: '' }

/**
 * 폼 값으로 원장을 대조한다. 화면이 직접 부르지 않고 모달이 **저장 흐름에서** 부른다 —
 * 타이핑마다 원장을 긁으면 그 요청이 실제 저장보다 훨씬 잦다.
 */
export async function checkDraft(
  master: MasterTable,
  draft: QuickAddDraft,
): Promise<PersonaMatch | null> {
  const found = await findPersonaMatches(master, [
    { name: draft.name, email: draft.email, phone: draft.phone },
  ])
  return found.get(0) ?? null
}

/**
 * 폼 상태 — 모달이 두 모드를 오갈 때 값과 대조 결과를 **함께** 비운다.
 *
 * 둘을 따로 비우면 지나간 대조 결과가 빈 폼 옆에 남아, 아무것도 적지 않은 화면이
 * "이미 있습니다"라고 말하게 된다.
 */
export function useQuickAddDraft() {
  const [draft, setDraft] = useState<QuickAddDraft>(EMPTY_DRAFT)
  const [match, setMatch] = useState<PersonaMatch | null>(null)
  const reset = () => {
    setDraft(EMPTY_DRAFT)
    setMatch(null)
  }
  return { draft, setDraft, match, setMatch, reset }
}
