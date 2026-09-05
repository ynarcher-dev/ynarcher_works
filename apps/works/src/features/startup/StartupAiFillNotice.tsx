import { Banner, Tooltip, cardText } from '@ynarcher/ui'
import { AI_CARD_LABEL } from '@/features/startup/startupAiCards'
import { outcomeSummary, type AiFillOutcome } from '@/features/startup/startupAiMerge'

/**
 * 편집 폼 맨 위에 서는 AI 실행 결과 안내.
 *
 * **개별 칸에 표식을 달지 않는다.** 표식을 달려면 입력 컴포넌트 다섯 벌에 전달 인자를 하나씩
 * 더해야 하는데, 그 대가로 얻는 것은 이 줄이 이미 말하는 사실("어느 카드를 채웠는가")이다.
 * 담당자가 확인해야 할 단위도 칸이 아니라 카드다 — 저장이 카드 단위 통째 교체이므로, 한 칸만
 * 골라 되돌린다는 선택지가 애초에 없다.
 *
 * 경고(notes)는 접지 않고 펼친다 — 지분율 합계가 안 맞는다거나 단위를 확인하지 못했다는 말은
 * 설명이 아니라 **입력값 되읽기**라, 저장 전에 눈에 걸려야 한다. 근거 위치(evidence)는 반대로
 * 접는다(확인하고 싶을 때만 찾는 값이다).
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4
 */
export function StartupAiFillNotice({ outcome }: { outcome: AiFillOutcome }) {
  const warned = outcome.filled.filter((k) => (outcome.notes[k]?.length ?? 0) > 0)
  const evidenced = outcome.filled.filter((k) => (outcome.evidence[k]?.length ?? 0) > 0)

  return (
    <Banner tone="info">
      <div className="space-y-2">
        <p>{outcomeSummary(outcome)}</p>

        {warned.length > 0 && (
          <ul className="space-y-1">
            {warned.map((key) => (
              <li key={key}>
                <span className={cardText.label}>{AI_CARD_LABEL[key]}</span>
                <ul className="ml-3 list-disc pl-3">
                  {(outcome.notes[key] ?? []).map((line, i) => (
                    <li key={i} className={cardText.value}>
                      {line}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {evidenced.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cardText.meta}>근거 위치</span>
            {evidenced.map((key) => (
              <Tooltip
                key={key}
                label={`${AI_CARD_LABEL[key]} 근거 위치`}
                content={(outcome.evidence[key] ?? []).join(' / ')}
              >
                <span className={cardText.meta}>{AI_CARD_LABEL[key]}</span>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </Banner>
  )
}
