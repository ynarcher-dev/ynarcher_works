import type { LedgerMatchSpec } from '@/features/master/ledgerMatch'

/**
 * 사람·회사를 담는 원장 넷의 **정의 한 벌** — 표 이름, 읽는 컬럼, 대조가 견주는 세 칸,
 * '내려간 행'의 뜻.
 *
 * 2026-09-09에 `features/program/participantPersona`에서 여기로 내렸다. 그 파일이 이 값을
 * 갖고 있어도 됐던 것은 명단 화면 하나가 읽을 때뿐이고, **등록 폼 넷·대용량 둘·명단이 함께
 * 읽게 된 순간 그것은 참가자 자격의 값이 아니라 원장의 값이다.** 도메인 화면이 각자 적으면
 * `ma_sellers`의 이메일 칸이 `contact_email`이라는 사실이 다섯 곳에 살고, 원장이 컬럼 하나를
 * 바꾸는 날 네 곳만 고쳐진다.
 *
 * **여기 없는 것은 자격이 갖는다** — 어느 구분만 볼지(`narrow`), 무엇을 검색할지, 새 행에
 * 무엇을 박을지, 읽은 행을 어떤 이름으로 부를지는 그 원장을 *어떤 자격으로* 쓰느냐의 문제라
 * `PARTICIPANT_PERSONAS`가 얹는다.
 *
 * **넷 다 중복 병합 축을 갖는다**(2026-09-09, `20260909200000`이 M&A 둘을 마지막으로 열었다).
 * 그래서 '내려간 행'은 비활성(`deleted_at`)과 병합(`merged_into_id`) 둘의 합이다 — 병합된 행은
 * 정본으로 흡수돼 더는 스스로를 답하지 않으므로 비활성과 같은 무게로 본다.
 */

export type LedgerKey = 'startups' | 'networks' | 'ma_sellers' | 'ma_buyers'

/** 넷이 같은 규칙으로 답하는 '내려간 행' 판정 — 원장마다 다시 적지 않는다. */
const retired = (row: Record<string, unknown>): boolean =>
  Boolean(row.deleted_at || row.merged_into_id)

export const LEDGERS: Record<LedgerKey, LedgerMatchSpec> = {
  startups: {
    table: 'startups',
    columns:
      'id, name, representative, email, phone, management_status, deleted_at, merged_into_id',
    matchColumns: { name: 'name', email: 'email', phone: 'phone' },
    mergedColumn: 'merged_into_id',
    retired,
  },
  networks: {
    table: 'networks',
    columns: 'id, name, affiliation, email, phone, deleted_at, merged_into_id',
    matchColumns: { name: 'name', email: 'email', phone: 'phone' },
    mergedColumn: 'merged_into_id',
    retired,
  },
  ma_sellers: {
    table: 'ma_sellers',
    // 연락처는 20260908220000이 더했다 — 포털 계정의 초기 비밀번호가 되는 값이라
    // 계정이 아니라 원장이 갖는다.
    columns: 'id, name, contact_name, contact_email, phone, deleted_at, merged_into_id',
    matchColumns: { name: 'name', email: 'contact_email', phone: 'phone' },
    mergedColumn: 'merged_into_id',
    retired,
  },
  ma_buyers: {
    table: 'ma_buyers',
    columns: 'id, name, contact_name, contact_email, phone, deleted_at, merged_into_id',
    matchColumns: { name: 'name', email: 'contact_email', phone: 'phone' },
    mergedColumn: 'merged_into_id',
    retired,
  },
}
