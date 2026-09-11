import type { LedgerMatch, LedgerProbe } from '@/features/master/ledgerMatch'
import type { LedgerKey } from '@/features/master/ledgers'
import { failureText } from '@/lib/failureText'

/**
 * 원장별 **막을 것과 멈출 것**의 경계(2026-09-11, 3_3_8 §3).
 *
 * 대조 엔진(`ledgerMatch`)은 "무엇이 같은가"만 답한다. 그 결과를 두고 **막을지**(확실한 키 —
 * 같은 대상이라 확정할 수 있다) **한 번 멈출지**(의심 조합 — 강한 근거이지 증명은 아니다)는
 * 원장의 성격이 정하므로 여기 한 곳에 모은다. 화면마다 적으면 같은 회사를 어느 창에서
 * 넣었느냐에 따라 막히기도 통과하기도 한다.
 *
 * DB가 같은 규칙으로 마지막에 막는다(`app.startups_identity_gate`·`app.networks_identity_gate`·
 * `app.ma_party_identity_gate`·유일 인덱스). 여기서 막는 것은 담당자에게 **미리** 이유와 갈
 * 곳을 보여 주기 위해서이지 보안이 아니다.
 *
 *  · startups     사업자등록번호가 같다 → 막음. 내 번호가 비었는데 번호 있는 행과 이름 +
 *                 (이메일|전화)가 같다 → 막음(그 기업은 이미 번호를 갖고 있다). 둘 다 번호가
 *                 없으면 → 멈춤(확정 근거가 없다).
 *  · networks     이름 + (이메일|전화)가 같다 → 막음(사람에게는 단일 확실 키가 없어 조합으로
 *                 본다). 이메일 + 전화만 같다 → 멈춤(공용 대표번호·팀 메일).
 *  · ma_*         사업자등록번호가 같다 → 막음. 나머지 → 멈춤.
 *
 * 내려간 행(비활성·병합)은 막지 않는다 — DB 유일 인덱스도 살아있는 행만 보고, 되살릴지는
 * 사람이 정한다(화면은 '되살릴 행'이라고 안내한다).
 */
export function isHardDuplicate(key: LedgerKey, probe: LedgerProbe, match: LedgerMatch): boolean {
  if (match.retired) return false
  const has = (f: 'hard' | 'name' | 'email' | 'phone') => match.hitFields.includes(f)
  const nameAndContact = has('name') && (has('email') || has('phone'))
  switch (key) {
    case 'startups': {
      if (has('hard')) return true
      const probeHasBiz = String(probe.hard ?? '').replace(/\D/g, '').length > 0
      const matchHasBiz = String(match.raw.biz_reg_no ?? '').replace(/\D/g, '').length > 0
      return !probeHasBiz && matchHasBiz && nameAndContact
    }
    case 'networks':
      return nameAndContact
    case 'ma_sellers':
    case 'ma_buyers':
      return has('hard')
  }
}

/**
 * 저장이 거절됐을 때 담당자에게 보일 문구. DB가 던진 우리말 사유는 그대로 옮기고(`failureText`),
 * 유일 인덱스 위반(영문 23505)만 어느 키였는지 우리말로 바꾼다.
 */
export function ledgerSaveFailureText(e: unknown, fallback: string): string {
  const err = (e ?? {}) as { code?: string; message?: string; hint?: string }
  const msg = err.message ?? ''
  if (err.code === '23505') {
    if (msg.includes('uq_startups_biz_reg_no_live')) {
      return '같은 사업자등록번호의 기업이 이미 있습니다. 새로 만들지 말고 그 행을 고치세요.'
    }
    if (msg.includes('uq_ma_sellers_startup_live') || msg.includes('uq_ma_buyers_startup_live')) {
      return '이 스타트업에 연결된 행이 이미 있습니다. 그 행을 고치세요.'
    }
    if (msg.includes('uq_ma_sellers_biz_reg_no_live') || msg.includes('uq_ma_buyers_biz_reg_no_live')) {
      return '같은 사업자등록번호의 행이 이미 있습니다. 새로 만들지 말고 그 행을 고치세요.'
    }
    if (msg.includes('uq_users_internal_email') || msg.includes('uq_users_guest_email')) {
      return '같은 이메일의 계정이 이미 있습니다.'
    }
  }
  return failureText(e, fallback)
}
