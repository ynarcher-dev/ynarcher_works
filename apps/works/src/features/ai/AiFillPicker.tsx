import { cardText, cn } from '@ynarcher/ui'
import type { AiSource } from '@/features/ai/aiFillClient'
import { AI_SUPPORTED_HINT } from '@/features/ai/aiFormats'

/**
 * 'AI 작성하기' 모달에서 **고를 수 없는 자료**를 알리는 목록.
 *
 * 종전에는 이 파일이 세 목록(읽을 자료 · 작성할 카드 · 읽을 수 없는 자료)을 가졌다. 앞의 둘은
 * 2026-09-06에 카드 × 자료 격자(`AiFillGrid`)로 합쳐졌다 — 두 목록은 "무엇을 읽는가"와
 * "무엇을 쓰는가"를 따로 물었을 뿐, 그 둘을 잇는 답(어느 자료가 어느 카드의 근거인가)은
 * 어디서도 묻지 않았기 때문이다.
 *
 * 이 목록만 남은 이유는 **성격이 다르기** 때문이다. 격자는 고르는 자리이고 여기는 고를 수
 * 없는 것을 알리는 자리라, 격자 안에 열로 세우면 눌리지 않는 칸이 한 줄 생긴다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */
export function AiBlockedList({ sources }: { sources: AiSource[] }) {
  if (sources.length === 0) return null
  return (
    <div className="space-y-1">
      <p className={cardText.subhead}>읽을 수 없는 자료 [{sources.length}]</p>
      <div className="max-h-28 overflow-auto rounded-radius-md border border-gray-200 bg-gray-50">
        <ul>
          {sources.map((s) => (
            <li key={s.key} className="border-b border-gray-100 px-3 py-1.5 last:border-b-0">
              <span className={cn('block truncate', cardText.meta)}>{s.name}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* 막힌 이유는 접지 않는다 — 왜 못 고르는지는 다음 행동을 지시하는 안내다.
          지원 형식은 **줄마다가 아니라 목록에 한 번** 적는다(줄마다 적으면 같은 문장이 열 번
          서서, 정작 어느 파일이 걸렸는지가 그 문장에 묻힌다). */}
      <p className={cardText.meta}>지원 형식: {AI_SUPPORTED_HINT}</p>
    </div>
  )
}
