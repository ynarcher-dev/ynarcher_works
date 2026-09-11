import {
  findLedgerMatches as findMatches,
  type LedgerMatchSpec,
  type LedgerProbe,
} from '@/features/master/ledgerMatch'
import {
  PARTICIPANT_PERSONAS,
  type LedgerFacts,
  type MasterTable,
} from '@/features/program/participantPersona'

/**
 * 자격(persona)으로 부르는 원장 대조 — 판정 자체는 `features/master/ledgerMatch`가 갖는다.
 *
 * 여기 남는 것은 **번역 한 겹**뿐이다. 공용 매처는 어느 원장이든 다루려고 이름·이메일·전화와
 * 원본 행만 돌려주는데, 명단 화면은 그 위에 자격이 읽어 주는 사실(대표자·소속·구분)을 함께
 * 세운다 — 그 읽는 법은 자격 설정이 소유하므로 여기서 한 번 태워 넘긴다.
 *
 * 매처를 자격 키로 부르지 않고 **설정을 넘겨 부르는** 이유는, 같은 원장을 다른 범위로 봐야
 * 하는 자리가 있어서다: 명단은 NETWORKS를 전문가로 좁혀 보지만 네트워크 등록 폼은 구분을
 * 가리지 않고 표 전체를 본다(좁혀 보면 투자사로 이미 있는 사람을 전문가로 또 넣게 된다).
 */

export type { LedgerProbe }

/** 명단 화면이 쓰는 대조 결과 — 공용 결과에 자격이 읽어 준 사실을 얹은 것. */
export interface PersonaMatch extends LedgerFacts {
  id: string
  hits: number
}

/** 자격의 원장 설정을 공용 매처가 아는 모양으로 옮긴다. */
export function personaMatchSpec(master: MasterTable): LedgerMatchSpec {
  const { ledger } = PARTICIPANT_PERSONAS[master]
  return {
    table: ledger.table,
    columns: ledger.columns,
    narrow: ledger.narrow,
    matchColumns: ledger.matchColumns,
    hardKey: ledger.hardKey,
    // 무엇이 '내려감'인지는 원장마다 다르다 — 자격 설정의 `map`이 이미 그 판정을 갖고 있다.
    retired: (row) => ledger.map(row).retired,
  }
}

/** 여러 줄을 한 번에 대조한다(대용량). 첨자 → 걸린 원장 행. */
export async function findPersonaMatches(
  master: MasterTable,
  probes: LedgerProbe[],
): Promise<Map<number, PersonaMatch>> {
  const { ledger } = PARTICIPANT_PERSONAS[master]
  const found = await findMatches(personaMatchSpec(master), probes)
  const out = new Map<number, PersonaMatch>()
  for (const [i, m] of found) {
    out.set(i, { ...ledger.map(m.raw), id: m.id, hits: m.hits })
  }
  return out
}
