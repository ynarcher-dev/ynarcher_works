import { useState } from 'react'
import type { UseFormGetValues, UseFormReset } from 'react-hook-form'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'
import type { AiCardKey } from '@/features/startup/startupAiCards'
import { applyAiDraft, type AiFillEnvelope, type AiFillOutcome } from '@/features/startup/startupAiMerge'
import {
  buildCardSnapshot,
  toCardState,
  toFormValues,
  type AiCardState,
} from '@/features/startup/startupAiSnapshot'

/**
 * 편집 폼의 'AI 작성하기' 상태 — 초안을 지금 값 위에 얹고 그 결과를 기억한다.
 *
 * 폼에서 떼어 낸 이유는 줄 수가 아니라 소유다. 폼은 "무엇을 저장하는가"를 알고, 이 훅은
 * "초안이 어디로 가는가"를 안다. 카드가 늘면 여기만 는다.
 *
 * ## 왜 원장이 아니라 폼 값 위에 얹는가
 *
 * "AI가 못 찾은 칸은 기존 값을 유지한다"의 **기존 값**은 저장된 것이 아니라 화면에 보이는
 * 것이어야 한다. 편집 중에 누르는 버튼이므로 담당자가 방금 적어 아직 저장하지 않은 줄이
 * 있고, 원장을 기준으로 합치면 그 줄이 조용히 사라진다.
 *
 * ## 왜 reset인가
 *
 * 팀원·자문단이 `useFieldArray`로 자식 컴포넌트에 살아 있다. 배열 이름에 `setValue`를 쏘면
 * 그 목록의 내부 키가 따라오지 못해 행이 어긋날 수 있다. `reset`은 필드 배열까지 확실히
 * 다시 세운다. `useForm`의 `values`가 다시 덮어쓰지 않는 이유는 그 비교 대상이 **직전에
 * 적용한 `values`**이지 현재 폼 상태가 아니기 때문이다 — `initial`이 그대로인 한 재설정은
 * 일어나지 않는다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4·§4.5
 */
export function useStartupAiDraft({
  getValues,
  reset,
  state,
  setCapabilities,
  setIp,
  setGrowth,
  setBusinessStatus,
  setShareholders,
}: {
  getValues: UseFormGetValues<StartupDetailFormValues>
  reset: UseFormReset<StartupDetailFormValues>
  /** 폼이 상태로 들고 있는 카드 값(폼 값이 아닌 것들). */
  state: AiCardState
  setCapabilities: (v: string[]) => void
  setIp: (v: AiCardState['ip']) => void
  setGrowth: (v: AiCardState['growth']) => void
  setBusinessStatus: (v: AiCardState['businessStatus']) => void
  setShareholders: (v: AiCardState['shareholders']) => void
}) {
  const [outcome, setOutcome] = useState<AiFillOutcome | null>(null)

  /** 모달과 기본 체크 규칙이 기준으로 삼는, 지금 폼에 적힌 값. */
  const snapshot = buildCardSnapshot(getValues(), state)

  const applyDraft = (envelope: AiFillEnvelope, cards: AiCardKey[]) => {
    const values = getValues()
    const merged = applyAiDraft(buildCardSnapshot(values, state), envelope, cards)
    reset(toFormValues(merged.record, values))
    const next = toCardState(merged.record, state)
    setCapabilities(next.capabilities)
    setIp(next.ip)
    setGrowth(next.growth)
    setBusinessStatus(next.businessStatus)
    setShareholders(next.shareholders)
    setOutcome(merged.outcome)
  }

  return { outcome, snapshot, applyDraft }
}
