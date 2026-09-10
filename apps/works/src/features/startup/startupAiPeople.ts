import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'
import type { AiCardKey } from '@/features/startup/startupAiCards'
import type { PersonLinkTarget } from '@/features/networks/PersonLinkModal'

/**
 * 초안이 데려온 사람이 **폼의 어느 자리에 사는가**.
 *
 * 훅에서 떼어 낸 것은 줄 수가 아니라 성질 때문이다 — 이 둘은 폼 값 하나를 보고 답하는 순수
 * 함수라 화면도 상태도 필요 없고, 그래서 시험도 훅을 세우지 않고 값만으로 할 수 있다.
 */
/** 대표자가 폼에서 사는 자리. 팀원은 순번이 자리다. */
export const REP_KEY = 'rep'
export const memberKey = (i: number) => `member:${i}`

/**
 * 초안을 얹은 뒤 **원장에 이어지지 않은 사람**을 모은다.
 *
 * 체크한 카드만 본다 — 팀 카드를 고르지 않았으면 팀원은 손대지 않은 값이고, 손대지 않은 값을
 * 두고 "연결하라"고 말하는 것은 초안의 결과가 아니라 잔소리다. 옛 데이터의 미연결은 그 칸이
 * 사는 화면(피커)이 답할 일이지 이 창이 매번 들출 일이 아니다.
 */
export function unlinkedPeople(v: StartupDetailFormValues, cards: AiCardKey[]): PersonLinkTarget[] {
  const out: PersonLinkTarget[] = []
  if (cards.includes('basics') && v.representative.trim() && !v.representative_network_id) {
    out.push({ key: REP_KEY, name: v.representative.trim(), title: '대표' })
  }
  if (cards.includes('team')) {
    v.members.forEach((m, i) => {
      if (m.name.trim() && !m.networkId) {
        out.push({ key: memberKey(i), name: m.name.trim(), title: m.role.trim() })
      }
    })
  }
  return out
}

