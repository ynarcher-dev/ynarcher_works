import { cardText } from '@ynarcher/ui'
import { AI_CARD_LABEL } from '@/features/startup/startupAiCards'
import { StartupAiFillEvidence } from '@/features/startup/StartupAiFillEvidence'
import { outcomeSummary, type AiFillOutcome } from '@/features/startup/startupAiMerge'

/**
 * AI 실행 결과의 **알맹이** — 요약 한 줄 · 못 읽은 자료 · 카드별 경고 · 근거.
 *
 * 이 사실이 서는 자리는 **창 안 결과 패널 하나**다(2026-09-06 사용자 지정). 한동안 폼 맨 위
 * 배너에도 같은 내용을 세웠는데, 창이 닫히지 않고 결과를 그 자리에서 보여 주게 된 뒤로는 같은
 * 말을 두 곳에서 하는 층이 됐다 — 뒤편 화면의 파란 상자가 창을 열 때마다 결과보다 먼저 눈에
 * 걸렸다. 상자에서 떼어 둔 모양은 그대로 둔다(담는 상자가 바뀔 수 있고, 문장은 한 벌이어야
 * 한다).
 *
 * **개별 칸에 표식을 달지 않는다.** 표식을 달려면 입력 컴포넌트 다섯 벌에 전달 인자를 하나씩
 * 더해야 하는데, 그 대가로 얻는 것은 이 줄이 이미 말하는 사실("어느 카드를 채웠는가")이다.
 * 담당자가 확인해야 할 단위도 칸이 아니라 카드다 — 저장이 카드 단위 통째 교체이므로, 한 칸만
 * 골라 되돌린다는 선택지가 애초에 없다.
 *
 * 경고(notes)와 근거(evidence)는 **둘 다 접지 않고 펼친다.** 경고는 지분율 합계가 안 맞는다거나
 * 단위를 확인하지 못했다는 말이라 설명이 아니라 **입력값 되읽기**이고, 근거는 서버가 원문과
 * 대조해 확인한 값이라 저장 전에 훑어야 할 것이다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4
 */
export function StartupAiFillOutcomeBody({ outcome }: { outcome: AiFillOutcome }) {
  const warned = outcome.filled.filter((k) => (outcome.notes[k]?.length ?? 0) > 0)

  return (
    <div className="space-y-2">
      <p>{outcomeSummary(outcome)}</p>

      {/* 실패한 카드는 접지 않는다 — 다시 누르면 채워질 수 있다는 것이 다음 행동이다. */}
      {outcome.failed.length > 0 && (
        <p className={cardText.value}>
          작성하지 못한 카드는 그 줄만 남기고 다시 실행하면 됩니다. 이미 채워진 카드는 그대로
          있습니다.
        </p>
      )}

      {/* 못 읽은 자료는 접지 않는다 — 대부분 담당자가 고칠 수 있는 것(공유 설정·죽은 주소)이라
          이유를 봐야 다음 행동이 정해지고, 초안이 왜 부실한지도 여기서 답한다. */}
      {outcome.skippedSources.length > 0 && (
        <ul className="ml-3 list-disc pl-3">
          {outcome.skippedSources.map((line, i) => (
            <li key={i} className={cardText.value}>
              {line}
            </li>
          ))}
        </ul>
      )}

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

      <StartupAiFillEvidence cards={outcome.filled} evidence={outcome.evidence} />
    </div>
  )
}
