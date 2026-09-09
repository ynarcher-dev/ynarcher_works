import { useState } from 'react'
import {
  findOneLedgerMatch,
  type LedgerMatch,
  type LedgerMatchSpec,
  type LedgerProbe,
} from '@/features/master/ledgerMatch'

/**
 * 등록 폼의 중복 가드 — **저장 직전에 원장을 되묻고, 걸리면 한 번 멈춘다**(2026-09-09).
 *
 * 종전 `checkDuplicateName`을 대신한다. 그쪽은 `.eq('name', name)` 한 줄이라 `딜챗`과
 * `주식회사 딜챗`, `(주)딜챗`이 서로 남남이었고, 실무에서 중복이 들어오는 가장 흔한 통로가
 * 그 한 글자 차이였다. 여기서는 이름을 정규화해 견주고 이메일·전화가 두 번째 근거로 받쳐
 * 준다(판정 규칙은 `ledgerMatch`가 소유한다 — 등록 폼·명단·대용량이 같은 답을 내야 한다).
 *
 * **막지 않고 멈춘다.** 첫 저장에서 걸리면 무엇이 걸렸는지 세우고 그 자리에 멈추며, 담당자가
 * 한 번 더 누르면 진행한다. 완전히 막지 않는 이유는 두 칸 일치가 **강한 근거이지 증명은
 * 아니어서**다 — 대표번호를 함께 쓰는 계열사, 같은 이름의 다른 법인이 실제로 있다. 그렇다고
 * 경고만 띄우고 지나가게 두면 아무도 읽지 않는다. 손이 한 번 더 가야 하는 것이 요점이다.
 *
 * **값이 바뀌면 통과권도 사라진다**(`clear`). 그러지 않으면 한 번 확인한 뒤 이름을 고쳐도
 * 대조 없이 저장되어, 정작 새로 적은 이름의 중복은 아무도 보지 않는다.
 */
export function useDuplicateGuard(spec: LedgerMatchSpec) {
  const [match, setMatch] = useState<LedgerMatch | null>(null)
  const [checking, setChecking] = useState(false)

  /**
   * 저장 직전에 부른다. `true`면 **멈춘다**(경고를 세웠다), `false`면 진행한다.
   *
   * 대조에 실패하면 진행하지 않는다 — 확인하지 못한 것을 '중복 없음'으로 읽으면 그 침묵이
   * 그대로 중복 등록이 된다. 호출자가 사유를 알 수 있도록 오류를 그대로 던진다.
   */
  const shouldStop = async (probe: LedgerProbe): Promise<boolean> => {
    // 이미 보여 준 뒤의 두 번째 누름은 담당자의 확인이다.
    if (match) return false
    setChecking(true)
    try {
      const found = await findOneLedgerMatch(spec, probe)
      if (!found) return false
      setMatch(found)
      return true
    } finally {
      setChecking(false)
    }
  }

  return { match, checking, shouldStop, clear: () => setMatch(null) }
}
