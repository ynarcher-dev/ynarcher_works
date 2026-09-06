import { Banner } from '@ynarcher/ui'
import { StartupAiFillOutcomeBody } from '@/features/startup/StartupAiFillOutcomeBody'
import type { AiFillOutcome } from '@/features/startup/startupAiMerge'

/**
 * 편집 폼 맨 위에 서는 AI 실행 결과 안내.
 *
 * **모달을 닫은 뒤에도 남는 자리다**(2026-09-06). 실행 직후의 결과는 모달 안에서 읽지만
 * (누른 자리에서 결과를 본다), 저장은 그 창을 닫은 뒤에 하므로 근거와 경고를 저장 직전까지
 * 볼 수 있어야 한다. 그래서 두 자리 모두 남기고 **문장은 한 벌**만 둔다
 * (`StartupAiFillOutcomeBody`).
 *
 * 한 카드도 못 쓴 것이 아니라 **일부만** 못 쓴 것이라, 배너는 정보(info)로 두고 실패는
 * 문장이 말한다. 전체를 위험(danger)으로 칠하면 이미 채워진 여덟 카드까지 잘못된 것으로 읽힌다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4
 */
export function StartupAiFillNotice({ outcome }: { outcome: AiFillOutcome }) {
  return (
    <Banner tone="info">
      <StartupAiFillOutcomeBody outcome={outcome} />
    </Banner>
  )
}
