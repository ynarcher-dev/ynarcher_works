import { useState } from 'react'
import { isHardDuplicate } from '@/features/master/identityPolicy'
import {
  findOneLedgerMatch,
  type LedgerMatch,
  type LedgerMatchSpec,
  type LedgerProbe,
} from '@/features/master/ledgerMatch'
import type { LedgerKey } from '@/features/master/ledgers'

/**
 * 등록·수정 폼의 중복 가드 — **저장 직전에 원장을 되묻고, 걸리면 막거나 한 번 멈춘다**.
 *
 * 종전 `checkDuplicateName`을 대신한다. 그쪽은 `.eq('name', name)` 한 줄이라 `딜챗`과
 * `주식회사 딜챗`, `(주)딜챗`이 서로 남남이었고, 실무에서 중복이 들어오는 가장 흔한 통로가
 * 그 한 글자 차이였다. 판정 규칙은 `ledgerMatch`가, 막을지 멈출지는 `identityPolicy`가
 * 소유한다 — 등록 폼·명단·대용량이 같은 답을 내야 한다.
 *
 * **두 층이다**(2026-09-11, 3_3_8 §3).
 *  · 확실한 키가 같으면 **막는다**(`blocked`). 몇 번을 눌러도 진행하지 않는다 — DB도 같은
 *    규칙으로 거절하므로 통과시켜 봐야 오류 토스트가 될 뿐이고, 여기서 막으면 갈 곳(기존 행)을
 *    함께 보여 줄 수 있다.
 *  · 의심 조합이면 **한 번 멈춘다**. 첫 저장에서 걸리면 무엇이 걸렸는지 세우고 그 자리에
 *    멈추며, 담당자가 한 번 더 누르면 진행한다. 완전히 막지 않는 이유는 두 칸 일치가 **강한
 *    근거이지 증명은 아니어서**다 — 대표번호를 함께 쓰는 계열사, 같은 이름의 다른 법인이 실제로
 *    있다. 그렇다고 경고만 띄우고 지나가게 두면 아무도 읽지 않는다. 손이 한 번 더 가야 하는
 *    것이 요점이다.
 *
 * **값이 바뀌면 통과권도 사라진다**(`clear`, `useGuardReset`). 그러지 않으면 한 번 확인한 뒤
 * 이름을 고쳐도 대조 없이 저장되어, 정작 새로 적은 이름의 중복은 아무도 보지 않는다.
 */
export function useDuplicateGuard(spec: LedgerMatchSpec, key: LedgerKey) {
  const [match, setMatch] = useState<LedgerMatch | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [checking, setChecking] = useState(false)

  /**
   * 저장 직전에 부른다. `true`면 **멈춘다**(경고를 세웠거나 막혔다), `false`면 진행한다.
   * 수정이면 `excludeId`로 자기 행을 뺀다 — 빼지 않으면 자기 자신이 중복으로 걸린다.
   *
   * 대조에 실패하면 진행하지 않는다 — 확인하지 못한 것을 '중복 없음'으로 읽으면 그 침묵이
   * 그대로 중복 등록이 된다. 호출자가 사유를 알 수 있도록 오류를 그대로 던진다.
   */
  const shouldStop = async (probe: LedgerProbe, excludeId?: string): Promise<boolean> => {
    // 이미 보여 준 뒤의 두 번째 누름은 담당자의 확인이다 — 막힌 것이 아닐 때만.
    if (match && !blocked) return false
    setChecking(true)
    try {
      const found = await findOneLedgerMatch(spec, probe, excludeId)
      if (!found) {
        setMatch(null)
        setBlocked(false)
        return false
      }
      setMatch(found)
      setBlocked(isHardDuplicate(key, probe, found))
      return true
    } finally {
      setChecking(false)
    }
  }

  const clear = () => {
    setMatch(null)
    setBlocked(false)
  }

  return { match, blocked, checking, shouldStop, clear }
}

/**
 * 대조에 쓰인 칸이 바뀌면 통과권을 지운다. 폼이 `watch`로 만든 키 문자열을 넘긴다 —
 * 렌더 중에 상태를 바꾸는 패턴이라 폼마다 여섯 줄이 반복되던 것을 한 줄로 접는다.
 */
export function useGuardReset(guard: { clear: () => void }, probeKey: string) {
  const [lastKey, setLastKey] = useState(probeKey)
  if (probeKey !== lastKey) {
    setLastKey(probeKey)
    guard.clear()
  }
}
