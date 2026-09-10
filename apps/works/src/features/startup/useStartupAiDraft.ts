import { useState } from 'react'
import type { UseFormGetValues, UseFormReset } from 'react-hook-form'
import type { PersonLinkResult, PersonLinkTarget } from '@/features/networks/PersonLinkModal'
import { REP_KEY, memberKey, unlinkedPeople } from '@/features/startup/startupAiPeople'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'
import type { AiCardKey } from '@/features/startup/startupAiCards'
import { applyAiDraft } from '@/features/startup/startupAiMerge'
import type { AiFillEnvelope, AiFillOutcome } from '@/features/ai/aiTypes'
import {
  buildCardSnapshot,
  toCardState,
  toFormValues,
  type AiCardState,
} from '@/features/startup/startupAiSnapshot'

/**
 * 편집 폼의 'AI 작성하기' 배선 — 초안을 지금 값 위에 얹고 그 결과를 돌려준다.
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
  setSummary,
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
  /** 요약 3축. 2026-09-06에 AI가 쓰는 카드가 되면서 되돌릴 자리가 생겼다. */
  setSummary: (v: AiCardState['summary']) => void
}) {
  /**
   * 이번 초안이 남긴 **미연결 사람들**. 창이 아니라 여기 있는 이유는 초안을 얹은 자리가
   * 여기이기 때문이다 — 연결이 끊기거나 새로 생기는 것은 병합의 결과이고, 그 사실을 아는
   * 것은 병합을 부른 쪽뿐이다.
   */
  const [pending, setPending] = useState<PersonLinkTarget[]>([])

  /** 모달과 기본 체크 규칙이 기준으로 삼는, 지금 폼에 적힌 값. */
  const snapshot = buildCardSnapshot(getValues(), state)

  /**
   * 초안을 지금 값 위에 얹고 **이번 실행의 결과**를 돌려준다.
   *
   * 결과를 여기 담아 두지 않는 이유는 그것을 읽는 자리가 **창 하나**이기 때문이다(2026-09-06
   * 사용자 지정). 폼이 들고 있으면 창을 닫은 뒤에도 남는데, 그때는 이미 값이 폼에 들어가
   * 있어 같은 사실을 두 번 말하는 층이 된다.
   */
  const applyDraft = (envelope: AiFillEnvelope<AiCardKey>, cards: AiCardKey[]): AiFillOutcome<AiCardKey> => {
    const values = getValues()
    const merged = applyAiDraft(buildCardSnapshot(values, state), envelope, cards)
    const next = toFormValues(merged.record, values)
    reset(next)
    setPending(unlinkedPeople(next, cards))
    const cardState = toCardState(merged.record, state)
    setCapabilities(cardState.capabilities)
    setIp(cardState.ip)
    setGrowth(cardState.growth)
    setBusinessStatus(cardState.businessStatus)
    setShareholders(cardState.shareholders)
    setSummary(cardState.summary)
    return merged.outcome
  }

  /**
   * 확정된 연결을 폼에 되돌린다. **원장은 이미 창이 썼고 여기서 쓰는 것은 폼뿐**이다 —
   * 스타트업 행에 남는 것은 저장 버튼을 눌러야 반영된다(AI는 원장을 쓰지 않는다는 규칙이
   * 여기서도 그대로다. 창이 만드는 것은 사람 원장의 행이지 이 기업의 값이 아니다).
   *
   * `setValue`가 아니라 `reset`인 이유는 위와 같다 — 팀원이 `useFieldArray`로 살아 있다.
   */
  const applyLinks = (links: PersonLinkResult[]) => {
    const map = new Map(links.map((l) => [l.key, l]))
    // 자리(순번)만으로 되돌리지 않는다 — 창이 열려 있는 동안 담당자가 팀원 줄을 더하거나
    // 지우면 순번이 밀려 **다른 사람에게 남의 연결이 붙는다**. 창에 세울 때의 이름이 그
    // 자리에 그대로 있을 때만 얹고, 어긋나면 그 줄은 미연결로 남긴다(잘못 잇는 것보다 낫다).
    const origin = new Map(pending.map((t) => [t.key, t.name]))
    const takes = (key: string, current: string) => {
      const hit = map.get(key)
      if (!hit) return null
      return origin.get(key) === current.trim() ? hit : null
    }
    const v = getValues()
    const rep = takes(REP_KEY, v.representative)
    reset({
      ...v,
      representative: rep ? rep.name : v.representative,
      representative_network_id: rep ? rep.networkId : v.representative_network_id,
      members: v.members.map((m, i) => {
        const hit = takes(memberKey(i), m.name)
        return hit ? { ...m, name: hit.name, networkId: hit.networkId } : m
      }),
    })
    setPending([])
  }

  return { snapshot, applyDraft, pending, applyLinks, clearPending: () => setPending([]) }
}
