import { cn } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { LedgerPresence } from '@/features/program/participantPersona'

/**
 * 원장 상태를 화면에 적는 낱말 — 세 화면(참가자 목록·GUEST 명부·계정 생성 창)이 같은 글자를 쓴다.
 * 여기 한 벌만 두는 이유는 낱말이 화면마다 갈리면 같은 줄이 어느 탭에서는 '비활성', 어느
 * 창에서는 '삭제됨'으로 읽혀 담당자가 두 사실로 오해하기 때문이다.
 */
export const LEDGER_RETIRED_TEXT = '※비활성화'
export const LEDGER_MISSING_TEXT = '삭제됨'

/** 붉은 상태 낱말 한 조각. */
export function LedgerPresenceMark({ presence }: { presence: LedgerPresence }) {
  if (presence === 'active') return null
  return (
    <span className="shrink-0 font-medium text-danger">
      {presence === 'retired' ? LEDGER_RETIRED_TEXT : LEDGER_MISSING_TEXT}
    </span>
  )
}

/**
 * 이름 칸 — 살아 있으면 이름, 내려갔으면 이름 옆에 `※비활성화`, 없으면 `삭제됨`만.
 *
 * 삭제된 줄에 옛 이름을 세우지 않는 것은 그 값을 이 화면이 갖고 있지 않기 때문이다(명부는
 * 값을 복제하지 않는다) — 지어내면 '미지정'처럼 아직 정하지 않은 것으로 읽힌다.
 */
export function LedgerNameCell({
  name,
  presence,
  className,
}: {
  name: ReactNode
  presence: LedgerPresence
  className?: string
}) {
  if (presence === 'missing') return <LedgerPresenceMark presence="missing" />
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className={cn('truncate', className)}>{name}</span>
      <LedgerPresenceMark presence={presence} />
    </span>
  )
}

/** 값 칸 — 행이 없으면 `삭제됨`, 있으면 원래 그리던 것. */
export function ledgerValueCell(presence: LedgerPresence, shown: () => ReactNode): ReactNode {
  return presence === 'missing' ? <LedgerPresenceMark presence="missing" /> : shown()
}
