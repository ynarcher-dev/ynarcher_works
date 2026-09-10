import { Button, cardText } from '@ynarcher/ui'
import { useState } from 'react'
import {
  PersonLinkModal,
  type PersonLinkResult,
  type PersonLinkTarget,
} from '@/features/networks/PersonLinkModal'

/**
 * AI 초안이 데려온 사람 중 **원장에 이어지지 않은 사람**을 잇는 자리.
 *
 * 'AI 작성하기' 버튼 바로 아래에 선다 — 이 일이 그 실행의 결과이므로 원인 옆이 자리다.
 * 초안을 얹기 전에는 서지 않고, 다 이으면 사라진다. 상시로 서는 줄이 아닌 이유는 **미연결이
 * 정상 상태**이기 때문이다(원장에 없는 사람은 미연결이 맞다). 매번 서 있으면 그것은 상태가
 * 아니라 잔소리가 되고, 잔소리는 곧 아무도 읽지 않는다.
 *
 * 창을 따로 여는 이유는 AI 창이 결과를 든 채 열려 있기 때문이다(실행 후 닫히지 않는다).
 * 그 위에 창을 겹치면 어느 창의 버튼이 무엇을 확정하는지 화면이 답하지 못한다.
 */
export function StartupAiPersonLink({
  pending,
  affiliation,
  onLinked,
  onDismiss,
}: {
  pending: PersonLinkTarget[]
  /** 새로 만들 사람의 소속으로 채울 값(그 기업의 이름). */
  affiliation?: string
  onLinked: (links: PersonLinkResult[]) => void
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)
  if (pending.length === 0) return null
  return (
    <div className="mt-2 space-y-1.5">
      {/* 다음 행동을 지시하는 안내라 접지 않는다. */}
      <p className={cardText.meta}>
        초안이 데려온 사람 {pending.length}명이 원장에 연결되지 않았습니다.
      </p>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        원장에 연결하기
      </Button>
      <PersonLinkModal
        open={open}
        onClose={() => setOpen(false)}
        targets={pending}
        defaultAffiliation={affiliation}
        createCategory="startup"
        onConfirm={(links) => {
          onLinked(links)
          // 고르지 않고 넘긴 사람이 있어도 줄은 걷는다 — 담당자가 창에서 이미 그 사람들을
          // 보고 '연결하지 않음'으로 둔 것이라, 같은 말을 다시 세우면 그 판단을 부정한다.
          onDismiss()
        }}
      />
    </div>
  )
}
