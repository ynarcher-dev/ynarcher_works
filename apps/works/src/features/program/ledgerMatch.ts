import { supabase } from '@/lib/supabase'
import {
  PARTICIPANT_PERSONAS,
  type LedgerFacts,
  type MasterTable,
} from '@/features/program/participantPersona'

/**
 * 원장 중복 대조 — **"없는 줄 알고 새로 넣었는데 있는 경우"의 주 방어선**(2026-09-09).
 *
 * 명단에 담을 대상이 원장에 없어 새로 등록하려 할 때, 그 등록이 진짜 신규인지를 저장 전에
 * 되묻는다. NETWORKS 대용량 업로드가 쓰던 판정(`findExistingMatches`)과 **같은 규칙**이며,
 * 그 규칙이 원장 하나에 박혀 있던 것을 자격 설정으로 끌어올린 것이다 — 판정을 화면마다
 * 새로 쓰면 등록 창과 업로드 화면이 같은 파일을 두고 다른 답을 낸다.
 *
 * **기준은 이름·이메일·전화 중 둘 이상 일치**다. 하나만으로 판정하지 않는 이유는 공용
 * 대표번호와 공용 메일(`info@`) 때문이다 — 그 한 칸으로 묶으면 같은 회사의 서로 다른 사람이
 * 한 사람이 된다. 반대로 셋 다 요구하면 연락처 한 칸이 빈 원장 행은 영원히 안 걸린다.
 *
 * **후보는 이름과 이메일로만 긁는다**(전화로 긁지 않는다). 2개 이상 일치라는 규칙 아래에서
 * 성립하는 짝은 (이름·이메일)·(이름·전화)·(이메일·전화) 셋인데 **모두 이름이나 이메일을
 * 포함**하므로, 두 축으로 긁으면 놓치는 짝이 없다. 전화만 같은 행은 애초에 한 칸 일치라
 * 기준에 못 미친다. 이렇게 두는 실익은 **전화번호 표기 차이에 판정이 흔들리지 않는 것**이다
 * — 원장마다 하이픈 유무가 다르고, 그 차이로 후보를 못 긁으면 대조가 조용히 헛돈다.
 * 전화는 후보를 모은 뒤 숫자만 남겨 비교한다.
 */

/** 대조에 넣는 한 줄. 세 칸 중 빈 것이 있어도 된다(빈 칸은 일치로 세지 않는다). */
export interface LedgerProbe {
  name: string
  email: string
  phone: string
}

/** 대조에 걸린 원장 행 하나. */
export interface LedgerMatch extends LedgerFacts {
  id: string
  /** 몇 칸이 일치했는가(2 또는 3). 화면이 "무엇이 같아서 걸렸는지"를 말할 때 쓴다. */
  hits: number
}

/** `in()` 한 번에 싣는 값 수 — 넘으면 URL 길이 한계에 걸린다. */
const IN_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const normText = (v: unknown): string => String(v ?? '').trim().toLowerCase()
const normPhone = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

/** 대조 후보 하나(정규화 값을 미리 들고 있다). 테스트가 직접 세울 수 있도록 열어 둔다. */
export interface LedgerCandidate {
  id: string
  facts: LedgerFacts
  nName: string
  nEmail: string
  nPhone: string
}

/**
 * 후보 중 이 줄에 맞는 하나를 고른다 — **판정 규칙 전부가 여기 있다**(조회와 갈라 둔 이유).
 *
 * 빈 칸은 일치로 세지 않는다. 그러지 않으면 이메일이 둘 다 비었다는 사실이 '이메일이 같다'가
 * 되어, 연락처 없는 행 둘이 이름 하나만으로 같은 대상이 된다.
 */
export function bestMatchFor(
  probe: LedgerProbe,
  candidates: LedgerCandidate[],
): LedgerMatch | null {
  const pn = normText(probe.name)
  const pe = normText(probe.email)
  const pp = normPhone(probe.phone)

  let best: LedgerMatch | null = null
  for (const c of candidates) {
    const hits =
      (pn && pn === c.nName ? 1 : 0) +
      (pe && pe === c.nEmail ? 1 : 0) +
      (pp && pp === c.nPhone ? 1 : 0)
    if (hits < 2) continue
    // 일치 수가 많은 쪽 우선, 같으면 살아 있는 행을 앞세운다 — 되살릴 대상보다 지금 쓰는
    // 행을 가리키는 편이 담당자의 다음 행동을 줄인다.
    if (!best || hits > best.hits || (hits === best.hits && best.retired && !c.facts.retired)) {
      best = { ...c.facts, id: c.id, hits }
    }
  }
  return best
}

/**
 * 여러 줄을 한 번에 대조한다 — 돌려주는 것은 `probes` 배열의 첨자 → 걸린 원장 행이다.
 *
 * 걸리지 않은 줄은 키가 없다(빈 값을 넣지 않는다 — '안 걸렸다'와 '빈 행이 걸렸다'는 다르다).
 * 등록 창은 한 줄만 넣고, 대용량 업로드는 파일 전체를 한 번에 넣는다.
 *
 * **비활성·병합된 행도 걸린다.** 빼면 "이미 있는데 없다고 답하는" 결과가 되어 담당자가 같은
 * 대상을 한 번 더 만들고, 원장에 죽은 행과 산 행이 나란히 남는다 — 되살릴지 새로 만들지는
 * 사람이 정할 일이므로 화면에 그 사실(`retired`)을 함께 올린다.
 */
export async function findLedgerMatches(
  master: MasterTable,
  probes: LedgerProbe[],
): Promise<Map<number, LedgerMatch>> {
  const { ledger } = PARTICIPANT_PERSONAS[master]
  const cols = ledger.matchColumns

  const names = [...new Set(probes.map((p) => p.name.trim()).filter(Boolean))]
  const emails = [...new Set(probes.map((p) => p.email.trim()).filter(Boolean))]
  if (names.length === 0 && emails.length === 0) return new Map()

  // 자격이 원장 안의 한 구분만 쓰는 경우(NETWORKS 전문가) 그 밖의 행과 대조하지 않는다 —
  // 투자사 행과 이름이 같다는 이유로 전문가 등록이 막히면 담당자가 이유를 알 수 없다.
  const base = () => {
    let q = supabase.from(ledger.table).select(ledger.columns)
    if (ledger.narrow) q = q.eq(ledger.narrow.column, ledger.narrow.value)
    return q
  }

  const byId = new Map<string, LedgerCandidate>()
  const collect = (rows: Record<string, unknown>[]) => {
    for (const raw of rows) {
      const id = String(raw.id)
      if (byId.has(id)) continue
      const facts = ledger.map(raw)
      byId.set(id, {
        id,
        facts,
        nName: normText(facts.name),
        nEmail: normText(facts.email),
        nPhone: normPhone(facts.phone),
      })
    }
  }

  await Promise.all([
    ...chunk(names, IN_CHUNK).map(async (batch) => {
      const { data, error } = await base().in(cols.name, batch)
      // 대조 실패를 삼키지 않는다 — 삼키면 "중복이 없다"와 "확인하지 못했다"가 같아지고,
      // 그 침묵이 그대로 중복 등록이 된다.
      if (error) throw error
      collect((data ?? []) as unknown as Record<string, unknown>[])
    }),
    ...chunk(emails, IN_CHUNK).map(async (batch) => {
      const { data, error } = await base().in(cols.email, batch)
      if (error) throw error
      collect((data ?? []) as unknown as Record<string, unknown>[])
    }),
  ])

  const idxName = new Map<string, LedgerCandidate[]>()
  const idxEmail = new Map<string, LedgerCandidate[]>()
  const push = (m: Map<string, LedgerCandidate[]>, k: string, c: LedgerCandidate) => {
    if (!k) return
    const arr = m.get(k)
    if (arr) arr.push(c)
    else m.set(k, [c])
  }
  for (const c of byId.values()) {
    push(idxName, c.nName, c)
    push(idxEmail, c.nEmail, c)
  }

  const out = new Map<number, LedgerMatch>()
  probes.forEach((probe, i) => {
    // 이 줄과 한 칸이라도 겹치는 후보만 모아 판정에 넘긴다.
    const cands = new Map<string, LedgerCandidate>()
    for (const c of [
      ...(idxName.get(normText(probe.name)) ?? []),
      ...(idxEmail.get(normText(probe.email)) ?? []),
    ]) {
      cands.set(c.id, c)
    }
    const best = bestMatchFor(probe, [...cands.values()])
    if (best) out.set(i, best)
  })

  return out
}
