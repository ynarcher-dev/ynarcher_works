import { supabase } from '@/lib/supabase'

/**
 * 원장 중복 대조 — **"없는 줄 알고 새로 넣었는데 있는 경우"의 주 방어선**.
 *
 * 2026-09-09에 `features/program`에서 여기로 올렸다. 명단 하나가 쓸 때는 그쪽에 있어도 됐지만
 * 등록 폼 넷·대용량 둘이 함께 쓰게 된 순간 **그것은 어느 도메인의 것도 아니다** — 복제했으면
 * 판정 기준이 화면마다 갈리고, 같은 회사를 어느 창에서 넣었느냐에 따라 중복이 되기도 안
 * 되기도 한다(AI 격자 부품을 `features/ai`로 승격한 것과 같은 판단).
 *
 * **판정은 두 층이다**(2026-09-11, 3_3_8).
 *  · 확실한 키(`hardKey`) — 있으면 같은 대상이라 확정할 수 있는 값(스타트업·M&A의 사업자등록번호).
 *    한 칸만 같아도 걸린다. 무엇을 막을지는 원장별 정책(`identityPolicy`)이 답하고 DB가 마지막으로
 *    막는다.
 *  · 의심 조합 — 이름·이메일·전화 중 둘 이상 일치. 하나만으로 판정하지 않는 이유는 공용 대표번호와
 *    공용 메일(`info@`) 때문이다 — 그 한 칸으로 묶으면 같은 회사의 서로 다른 사람이 한 사람이 된다.
 *    반대로 셋 다 요구하면 연락처 한 칸이 빈 원장 행은 영원히 안 걸린다.
 *
 * **이름 완전일치를 대신한다.** 종전 `checkDuplicateName`은 `.eq('name', name)` 한 줄이라
 * `딜챗`과 `주식회사 딜챗`, `(주)딜챗`이 서로 남남이었다 — 실무에서 중복이 들어오는 가장 흔한
 * 통로가 그 한 글자 차이였다. 이름은 공백·대소문자·법인 형태 표기를 걷고 견준다
 * (`normEntityName` — DB `app.norm_entity_name`과 같은 규칙).
 *
 * **후보는 이름·이메일·확실한 키로 긁는다**(전화로 긁지 않는다). 2개 이상 일치라는 규칙 아래에서
 * 성립하는 짝은 (이름·이메일)·(이름·전화)·(이메일·전화) 셋인데 **모두 이름이나 이메일을
 * 포함**하므로, 두 축으로 긁으면 놓치는 짝이 없다. 전화만 같은 행은 애초에 한 칸 일치라
 * 기준에 못 미친다. 이렇게 두는 실익은 **전화번호 표기 차이에 판정이 흔들리지 않는 것**이다
 * — 원장마다 하이픈 유무가 다르고, 그 차이로 후보를 못 긁으면 대조가 조용히 헛돈다.
 * 전화는 후보를 모은 뒤 숫자만 남겨 비교한다. 이름은 정규화 값으로 긁을 수 없어(원장에는
 * 원문이 있다) 원문으로 긁되, 법인 표기가 다른 행은 이메일·확실한 키 축이 받쳐 준다.
 */

/** 대조에 넣는 한 줄. 세 칸 중 빈 것이 있어도 된다(빈 칸은 일치로 세지 않는다). */
export interface LedgerProbe {
  name: string
  email: string
  phone: string
  /** 확실한 키의 원문(사업자등록번호). 원장에 `hardKey`가 없으면 무시된다. */
  hard?: string
}

/** 어느 칸이 같았는가. 화면이 "무엇이 같아서 걸렸는지"와 정책이 "막을 것인지"를 이걸로 답한다. */
export type HitField = 'hard' | 'name' | 'email' | 'phone'

/**
 * 어느 원장을 어떻게 대조하는가. **도메인이 자기 것을 들고 온다** — 여기에 표 목록을 두면
 * 원장이 하나 늘 때 이 파일이 그 사실을 알아야 하고, 그때부터 공용 부품이 도메인을 안다.
 */
export interface LedgerMatchSpec {
  table: string
  /** PostgREST select 문자열. `id`와 `matchColumns` 셋(있으면 `hardKey.column`)을 반드시 포함한다. */
  columns: string
  /**
   * 한 원장 안의 일부만 대조 대상일 때 좁히는 조건(NETWORKS 명단은 전문가만 본다).
   *
   * **등록 폼에서는 대개 주지 않는다** — 네트워크 원장 등록은 구분을 가리지 않고 한 표에
   * 넣는 일이라, 좁혀서 보면 투자사로 이미 등록된 사람을 전문가로 또 넣게 된다.
   */
  narrow?: { column: string; value: string }
  /** 대조가 견주는 세 칸의 실제 이름. 원장마다 다르다(M&A는 `contact_email`). */
  matchColumns: { name: string; email: string; phone: string }
  /**
   * 확실한 키(있는 원장만). `normalize`는 견줄 값(숫자만), `stored`는 원장에 저장된 모양
   * (`XXX-XX-XXXXX`) — 후보를 긁을 때는 저장 모양으로 묻고, 판정은 정규화 값으로 한다.
   */
  hardKey?: {
    column: string
    normalize: (v: unknown) => string
    stored: (norm: string) => string
  }
  /** 이메일 또는 전화 하나만 같아도 중복으로 확정하는 기업 원장. */
  singleContactIsHard?: boolean
  /**
   * 이 행이 원장에서 내려갔는가(비활성·병합). 주지 않으면 전부 살아 있는 것으로 본다.
   *
   * 내려간 행도 **대조에는 걸린다** — 빼면 "이미 있는데 없다고 답하는" 결과가 되어 담당자가
   * 같은 대상을 한 번 더 만들고, 원장에 죽은 행과 산 행이 나란히 남는다. 되살릴지 새로
   * 만들지는 사람이 정할 일이므로 그 사실을 화면에 함께 올린다.
   */
  retired?: (row: Record<string, unknown>) => boolean
  /**
   * 중복을 흡수당한 행을 가리키는 컬럼(있는 원장만).
   *
   * `retired`와 같은 사실을 가리키지만 쓰임이 다르다 — 저쪽은 **읽어 온 행**을 보고 판정하고,
   * 이쪽은 **조회에 조건을 건다**(`.is(col, null)`). 컬럼이 없는 원장에 그 조건을 걸면 조회
   * 전체가 거절되므로, 있는지 여부를 이 칸이 답한다.
   */
  mergedColumn?: string
}

/** 대조에 걸린 원장 행 하나. */
export interface LedgerMatch {
  id: string
  name: string
  email: string | null
  phone: string | null
  retired: boolean
  /** 몇 칸이 일치했는가(확실한 키 포함). 화면이 "무엇이 같아서 걸렸는지"를 말할 때 쓴다. */
  hits: number
  /** 어느 칸이 같았는가. 정책이 막을지 멈출지를 이걸로 가른다. */
  hitFields: HitField[]
  /** 원본 행 — 화면이 더 보여 줄 값(대표자·소속…)을 자기 규칙으로 꺼내 쓴다. */
  raw: Record<string, unknown>
}

/** `in()` 한 번에 싣는 값 수 — 넘으면 URL 길이 한계에 걸린다. */
const IN_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 이름 대조용 정규화 — 소문자, 공백 제거, 법인 형태 표기 제거. DB `app.norm_entity_name`과
 * 같은 규칙이어야 화면이 경고한 것과 DB가 막는 것이 같은 행이다.
 */
export function normEntityName(v: unknown): string {
  return String(v ?? '')
    .replace(/주식회사|유한회사|유한책임회사|합자회사|합명회사|\(주\)|㈜|\(유\)|\(합\)/g, '')
    .toLowerCase()
    .replace(/\s/g, '')
}

const normEmail = (v: unknown): string => String(v ?? '').trim().toLowerCase()
const normPhone = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

/** 대조 후보 하나(정규화 값을 미리 들고 있다). 테스트가 직접 세울 수 있도록 열어 둔다. */
export interface LedgerCandidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  retired: boolean
  raw: Record<string, unknown>
  nName: string
  nEmail: string
  nPhone: string
  /** 확실한 키의 정규화 값. 원장에 키가 없으면 빈 문자열. */
  nHard?: string
}

/**
 * 후보 중 이 줄에 맞는 하나를 고른다 — **판정 규칙 전부가 여기 있다**(조회와 갈라 둔 이유).
 *
 * 빈 칸은 일치로 세지 않는다. 그러지 않으면 이메일이 둘 다 비었다는 사실이 '이메일이 같다'가
 * 되어, 연락처 없는 행 둘이 이름 하나만으로 같은 대상이 된다.
 *
 * `normalizeHard`는 확실한 키를 어떻게 접는지(스타트업은 숫자만). 주지 않으면 그 축은 없다.
 */
export function bestMatchFor(
  probe: LedgerProbe,
  candidates: LedgerCandidate[],
  normalizeHard?: (v: unknown) => string,
  singleContactIsHard = false,
): LedgerMatch | null {
  const pn = normEntityName(probe.name)
  const pe = normEmail(probe.email)
  const pp = normPhone(probe.phone)
  const ph = normalizeHard ? normalizeHard(probe.hard) : ''

  let best: LedgerMatch | null = null
  for (const c of candidates) {
    const fields: HitField[] = []
    if (ph && ph === (c.nHard ?? '')) fields.push('hard')
    if (pn && pn === c.nName) fields.push('name')
    if (pe && pe === c.nEmail) fields.push('email')
    if (pp && pp === c.nPhone) fields.push('phone')
    const hard = fields.includes('hard')
    const soft = fields.length - (hard ? 1 : 0)
    const contactHard = singleContactIsHard && (fields.includes('email') || fields.includes('phone'))
    if (!hard && !contactHard && soft < 2) continue
    const hits = fields.length
    // 확실한 키가 같은 쪽 → 일치 수가 많은 쪽 → 살아 있는 행 순으로 앞세운다. 되살릴 대상보다
    // 지금 쓰는 행을 가리키는 편이 담당자의 다음 행동을 줄인다.
    const bestHard = best?.hitFields.includes('hard') ?? false
    if (
      !best ||
      (hard && !bestHard) ||
      (hard === bestHard && hits > best.hits) ||
      (hard === bestHard && hits === best.hits && best.retired && !c.retired)
    ) {
      best = {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        retired: c.retired,
        hits,
        hitFields: fields,
        raw: c.raw,
      }
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
 * `excludeId`는 수정 중인 자기 행이다 — 빼지 않으면 자기 자신이 중복으로 걸린다.
 */
export async function findLedgerMatches(
  spec: LedgerMatchSpec,
  probes: LedgerProbe[],
  excludeId?: string,
): Promise<Map<number, LedgerMatch>> {
  const cols = spec.matchColumns
  const hardKey = spec.hardKey

  const names = [...new Set(probes.map((p) => p.name.trim()).filter(Boolean))]
  const emails = [...new Set(probes.map((p) => p.email.trim()).filter(Boolean))]
  const phones = [
    ...new Set(probes.flatMap((p) => [p.phone.trim(), normPhone(p.phone)]).filter(Boolean)),
  ]
  const hards = hardKey
    ? [...new Set(probes.map((p) => hardKey.normalize(p.hard)).filter(Boolean))]
    : []
  if (names.length === 0 && emails.length === 0 && phones.length === 0 && hards.length === 0) {
    return new Map()
  }

  const base = () => {
    let q = supabase.from(spec.table).select(spec.columns)
    if (spec.narrow) q = q.eq(spec.narrow.column, spec.narrow.value)
    return q
  }

  const byId = new Map<string, LedgerCandidate>()
  const collect = (rows: Record<string, unknown>[]) => {
    for (const raw of rows) {
      const id = String(raw.id)
      if (byId.has(id) || id === excludeId) continue
      const name = String(raw[cols.name] ?? '')
      const email = raw[cols.email] == null ? null : String(raw[cols.email])
      const phone = raw[cols.phone] == null ? null : String(raw[cols.phone])
      byId.set(id, {
        id,
        name,
        email,
        phone,
        retired: spec.retired?.(raw) ?? false,
        raw,
        nName: normEntityName(name),
        nEmail: normEmail(email),
        nPhone: normPhone(phone),
        nHard: hardKey ? hardKey.normalize(raw[hardKey.column]) : '',
      })
    }
  }

  const run = async (column: string, batch: string[]) => {
    const { data, error } = await base().in(column, batch)
    // 대조 실패를 삼키지 않는다 — 삼키면 "중복이 없다"와 "확인하지 못했다"가 같아지고,
    // 그 침묵이 그대로 중복 등록이 된다.
    if (error) throw error
    collect((data ?? []) as unknown as Record<string, unknown>[])
  }

  await Promise.all([
    ...chunk(names, IN_CHUNK).map((batch) => run(cols.name, batch)),
    ...chunk(emails, IN_CHUNK).map((batch) => run(cols.email, batch)),
    ...(spec.singleContactIsHard
      ? chunk(phones, IN_CHUNK).map((batch) => run(cols.phone, batch))
      : []),
    ...(hardKey
      ? chunk(hards.map((h) => hardKey.stored(h)), IN_CHUNK).map((batch) =>
          run(hardKey.column, batch),
        )
      : []),
  ])

  const idxName = new Map<string, LedgerCandidate[]>()
  const idxEmail = new Map<string, LedgerCandidate[]>()
  const idxPhone = new Map<string, LedgerCandidate[]>()
  const idxHard = new Map<string, LedgerCandidate[]>()
  const push = (m: Map<string, LedgerCandidate[]>, k: string, c: LedgerCandidate) => {
    if (!k) return
    const arr = m.get(k)
    if (arr) arr.push(c)
    else m.set(k, [c])
  }
  for (const c of byId.values()) {
    push(idxName, c.nName, c)
    push(idxEmail, c.nEmail, c)
    push(idxPhone, c.nPhone, c)
    push(idxHard, c.nHard ?? '', c)
  }

  const out = new Map<number, LedgerMatch>()
  probes.forEach((probe, i) => {
    // 이 줄과 한 칸이라도 겹치는 후보만 모아 판정에 넘긴다.
    const cands = new Map<string, LedgerCandidate>()
    for (const c of [
      ...(idxName.get(normEntityName(probe.name)) ?? []),
      ...(idxEmail.get(normEmail(probe.email)) ?? []),
      ...(idxPhone.get(normPhone(probe.phone)) ?? []),
      ...(hardKey ? (idxHard.get(hardKey.normalize(probe.hard)) ?? []) : []),
    ]) {
      cands.set(c.id, c)
    }
    const best = bestMatchFor(
      probe,
      [...cands.values()],
      hardKey?.normalize,
      spec.singleContactIsHard,
    )
    if (best) out.set(i, best)
  })

  return out
}

/**
 * 원장 행(또는 업로드 페이로드)에서 대조에 견줄 값을 꺼낸다. 칸 이름은 원장마다 다르므로
 * 명세(`matchColumns`·`hardKey`)를 그대로 받는다.
 */
export function probeOf(
  row: Record<string, unknown>,
  spec: Pick<LedgerMatchSpec, 'matchColumns' | 'hardKey'>,
): LedgerProbe {
  const at = (key: string) => (row[key] == null ? '' : String(row[key]))
  const cols = spec.matchColumns
  return {
    name: at(cols.name),
    email: at(cols.email),
    phone: at(cols.phone),
    ...(spec.hardKey ? { hard: at(spec.hardKey.column) } : {}),
  }
}

/**
 * **파일 안에서** 서로 같은 줄을 찾는다 — 첨자 → 그것이 처음 나온 첨자.
 *
 * 원장 대조(`findLedgerMatches`)와 다른 물음이다. 저쪽은 "이미 원장에 있는가"를 서버에 묻고,
 * 이쪽은 "이 파일이 같은 대상을 두 번 적었는가"를 파일만 보고 답한다 — **빈 원장에 넣을 때는
 * 저쪽이 전 줄을 통과시키므로 이쪽이 유일한 방어선이다.** 초기 데이터 이관이 정확히 그
 * 상황이고, 파일 안 중복이 가장 많은 자리이기도 하다.
 *
 * 판정 규칙은 하나뿐이다(`bestMatchFor`) — 파일 안과 원장을 다른 잣대로 보면, 같은 두 줄이
 * 파일에서는 남남이고 원장에서는 같은 대상이 된다.
 */
export function findDuplicateProbes(
  probes: LedgerProbe[],
  normalizeHard?: (v: unknown) => string,
  singleContactIsHard = false,
): Map<number, number> {
  const idxName = new Map<string, LedgerCandidate[]>()
  const idxEmail = new Map<string, LedgerCandidate[]>()
  const idxPhone = new Map<string, LedgerCandidate[]>()
  const idxHard = new Map<string, LedgerCandidate[]>()
  const push = (m: Map<string, LedgerCandidate[]>, k: string, c: LedgerCandidate) => {
    if (!k) return
    const arr = m.get(k)
    if (arr) arr.push(c)
    else m.set(k, [c])
  }

  const out = new Map<number, number>()
  probes.forEach((probe, i) => {
    const nName = normEntityName(probe.name)
    const nEmail = normEmail(probe.email)
    const nPhone = normPhone(probe.phone)
    const nHard = normalizeHard ? normalizeHard(probe.hard) : ''

    // **앞선 줄만** 후보다 — 뒤엣줄이 접히고 앞엣줄이 남아야, 같은 파일을 두 번 올려도
    // 접히는 줄이 같다(뒤를 보면 어느 쪽이 남을지가 순회 순서에 따라 달라진다).
    const cands = new Map<string, LedgerCandidate>()
    for (const c of [
      ...(idxName.get(nName) ?? []),
      ...(idxEmail.get(nEmail) ?? []),
      ...(idxPhone.get(nPhone) ?? []),
      ...(idxHard.get(nHard) ?? []),
    ]) {
      cands.set(c.id, c)
    }
    const hit = bestMatchFor(probe, [...cands.values()], normalizeHard, singleContactIsHard)
    if (hit) out.set(i, Number(hit.id))

    const self: LedgerCandidate = {
      id: String(i),
      name: probe.name,
      email: probe.email,
      phone: probe.phone,
      retired: false,
      raw: {},
      nName,
      nEmail,
      nPhone,
      nHard,
    }
    push(idxName, nName, self)
    push(idxEmail, nEmail, self)
    push(idxPhone, nPhone, self)
    push(idxHard, nHard, self)
  })
  return out
}

/** 한 건만 대조한다 — 등록·수정 폼이 저장 직전에 부르는 자리. 수정이면 자기 행을 뺀다. */
export async function findOneLedgerMatch(
  spec: LedgerMatchSpec,
  probe: LedgerProbe,
  excludeId?: string,
): Promise<LedgerMatch | null> {
  const found = await findLedgerMatches(spec, [probe], excludeId)
  return found.get(0) ?? null
}
