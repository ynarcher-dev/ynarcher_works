import type { ReactNode } from 'react'

/**
 * 견본 페이지의 묶음 하나 — 제목과 그 묶음이 말하려는 규칙(`lede`)을 함께 세운다.
 *
 * 카드만 늘어놓으면 견본이 카탈로그가 된다. 카탈로그는 "무엇이 있는가"에는 답하지만
 * "왜 그렇게 정했는가"에는 답하지 못하고, 그래서 다음에 보는 사람이 규격을 배우지 못한다.
 */
export function GuideSection({
  id,
  title,
  lede,
  children,
}: {
  id: string
  title: string
  lede: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="border-b border-gray-200 pb-3">
        <h2 className="text-title-md font-bold text-gray-900">{title}</h2>
        <p className="mt-1 text-body text-gray-600">{lede}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** 견본 안에서 예시에 붙이는 꼬리표(토큰명·맥락명). */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-radius-sm bg-gray-100 px-1.5 py-0.5 font-numeric text-caption text-gray-600">
      {children}
    </span>
  )
}
