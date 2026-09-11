import { useState } from 'react'
import { LEDGERS } from '@/features/master/ledgers'
import {
  findOneLedgerMatch,
  type LedgerMatch,
  type LedgerProbe,
} from '@/features/master/ledgerMatch'

/**
 * M&A 거래상대(셀러·바이어)의 **스타트업 연결 요구**(2026-09-11, 3_3_8 §4).
 *
 * 미연결 행을 저장하기 직전에 스타트업 원장을 되묻는다 — 사업자등록번호가 같거나 이름·이메일·
 * 전화 중 두 칸이 같은 살아있는 기업이 있으면 **연결 없이 저장하지 않는다.** 그 기업은 이미
 * 원장에 있고, 연결 없이 저장하면 자료 참조(셀러 → 스타트업 자료)와 퀵 리뷰가 그 기업을
 * 모른 채로 자료를 한 벌 더 올리게 된다. DB `app.ma_party_identity_gate`가 같은 규칙으로
 * 마지막에 막는다(hint `startup_link_required:<id>`).
 *
 * 되돌릴 길은 하나뿐이다 — 찾은 행을 연결하는 것(`link.applyId`). "다른 기업이다"라는 선택지를
 * 두지 않는 이유는, 두지 않아도 되기 때문이다: 정말 다른 기업이면 번호가 다르고 이름·연락처
 * 두 칸이 같을 일이 없다.
 *
 * 내려간 행(비활성·병합)은 요구하지 않는다 — DB 판정도 살아있는 행만 본다.
 */
export function useStartupLinkGuard(linkedStartupId: string | null) {
  const [hit, setHit] = useState<LedgerMatch | null>(null)
  const [checking, setChecking] = useState(false)

  /** 저장 직전에 부른다. `true`면 멈춘다(연결을 요구했다). 이미 연결돼 있으면 묻지 않는다. */
  const shouldStop = async (probe: LedgerProbe): Promise<boolean> => {
    if (linkedStartupId) return false
    setChecking(true)
    try {
      const found = await findOneLedgerMatch(LEDGERS.startups, probe)
      if (!found || found.retired) {
        setHit(null)
        return false
      }
      setHit(found)
      return true
    } finally {
      setChecking(false)
    }
  }

  return { hit, checking, shouldStop, clear: () => setHit(null) }
}
