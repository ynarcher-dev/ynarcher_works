import { splitCsvLine } from '@/lib/csv'
import { supabase } from '@/lib/supabase'
import {
  isCompactCategory,
  NETWORK_TABLE,
  resolveCategory,
  type NetworkCategory,
} from '@/features/networks/config'

/**
 * 대용량 업로드 표준 CSV 헤더.
 *
 * 원장 통합(2026-09-04)으로 국내·글로벌 양식이 한 벌이 되었다 — 종전에는 글로벌만
 * 권역·국가·링크드인을 갖는 별도 임포터였다. 국가는 이 파일이 답하는 유일한 지역 값이며
 * (권역은 국가가 안다), 비우면 국가 미확인으로 들어가 목록에서 채운다.
 */
export const BULK_HEADERS = [
  'name',
  'category',
  'country',
  'expertise',
  'affiliation',
  'department',
  'position',
  'email',
  'phone',
  'linkedin',
] as const

/**
 * 외부 export(리멤버 등) 헤더 → 표준 필드 별칭.
 * 키는 소문자/공백제거 후 비교한다. 매칭 안 되는 컬럼은 무시한다.
 */
const HEADER_ALIASES: Record<string, string> = {
  이름: 'name', 성명: 'name', name: 'name',
  구분: 'category', category: 'category',
  국가: 'country', 나라: 'country', 국적: 'country', country: 'country',
  // 영역이 현행 표기이고 분야·전문분야는 2026-08-03 이전 표기다 — 그때 내려받은 파일이
  // 그대로 올라와도 열이 유실되지 않도록 옛 이름을 별칭으로 남겨 둔다.
  영역: 'expertise', 전문영역: 'expertise', 분야: 'expertise', 전문분야: 'expertise', expertise: 'expertise',
  회사: 'affiliation', 회사명: 'affiliation', 소속: 'affiliation', affiliation: 'affiliation', company: 'affiliation',
  부서: 'department', 부서명: 'department', department: 'department',
  직함: 'position', 직책: 'position', 직급: 'position', position: 'position', title: 'position',
  // 리멤버 명함첩은 이 열을 '전자 메일 주소'로 내보낸다(별칭 비교는 공백 제거 후라 붙여 적는다).
  // 이 한 줄이 없던 동안 명함첩 업로드는 이메일을 통째로 잃었고, 이메일이 없으면 구분 추천·
  // 중복 대조·자사 판별이 함께 약해진다 — 세 가지가 모두 도메인에 기대기 때문이다.
  이메일: 'email', 이메일주소: 'email', 전자메일주소: 'email', 메일: 'email', 메일주소: 'email',
  email: 'email', 'e-mail': 'email', emailaddress: 'email',
  휴대폰: 'phone', 휴대전화: 'phone', 핸드폰: 'phone', 전화: 'phone', 연락처: 'phone', phone: 'phone', mobile: 'phone',
  링크드인: 'linkedin', linkedin: 'linkedin', linkedinurl: 'linkedin',
}

export interface ParsedRow {
  /** 원본 CSV 행 번호(1=헤더, 데이터는 2부터). */
  line: number
  name: string
  affiliation: string
  department: string
  position: string
  email: string
  phone: string
  linkedin: string
  /** CSV의 '구분' 원값(비어 있을 수 있음). */
  category: string
  /** CSV의 '국가' 원값(이름). 태그 원장과 대조해 id로 바꾼다. */
  country: string
  /**
   * 영역(expertise) — 세미콜론·슬래시로 나눈 태그명. 목록 열이자 필터 축이라,
   * 비운 채 등록하면 그 인물만 영역 필터에 걸리지 않는다(등록 폼은 태그에서 고르게 한다).
   */
  expertise: string[]
  /**
   * 엑셀이 망가뜨린 번호(`8.41646E+11`)인가. 원본 CSV를 엑셀로 한 번 열어 저장하면 긴 번호가
   * 지수 표기로 바뀌어 되돌릴 수 없다 — 그런 값은 저장하지 않고(연락처를 비운다) 사실만 알린다.
   * 잘못된 번호를 넣는 것보다 비어 있는 편이 낫다. 비면 채우러 가지만, 틀린 번호는 걸어 봐야 안다.
   */
  phoneCorrupt: boolean
  /** 이 행에 접어 넣은 **같은 파일 안** 중복 행의 원본 줄 번호. 비어 있으면 접힌 것이 없다. */
  foldedLines: number[]
}

/** 다중 값 열 구분자 — 콤마는 CSV 구분자와 겹쳐 따옴표가 필요하므로 세미콜론·슬래시도 받는다. */
function splitMulti(raw: string): string[] {
  return raw
    .split(/[,;/|]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** CSV 텍스트를 표준 필드로 매핑해 파싱한다(헤더 별칭 자동 인식). */
export function parseBulkCsv(text: string): ParsedRow[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const headerFields = splitCsvLine(lines[0] ?? '').map((h) => {
    const key = h.trim().toLowerCase()
    return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s/g, '')] ?? ''
  })
  const at = (cells: string[], field: string): string => {
    const idx = headerFields.indexOf(field)
    return idx >= 0 ? (cells[idx] ?? '').trim() : ''
  }
  return lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line)
    const rawPhone = at(cells, 'phone')
    const phoneCorrupt = SCI_NOTATION.test(rawPhone.replace(/\s/g, ''))
    return {
      line: i + 2,
      name: at(cells, 'name'),
      affiliation: at(cells, 'affiliation'),
      department: at(cells, 'department'),
      position: at(cells, 'position'),
      email: at(cells, 'email'),
      phone: phoneCorrupt ? '' : rawPhone,
      phoneCorrupt,
      foldedLines: [],
      linkedin: at(cells, 'linkedin'),
      category: at(cells, 'category'),
      country: at(cells, 'country'),
      expertise: splitMulti(at(cells, 'expertise')),
    }
  })
}

/** 비교용 정규화 — 표기 흔들림(대소문자·공백·구분기호)을 걷고 값만 남긴다. */
const normText = (v: unknown) => String(v ?? '').trim().toLowerCase()
const normPhone = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * 지수 표기로 망가진 숫자(`8.41646E+11`). 엑셀이 12자리 넘는 번호를 그렇게 저장한다.
 * 자릿수가 이미 잘려 나가 복원할 길이 없으므로 판정만 하고 값은 버린다.
 */
const SCI_NOTATION = /^\d(\.\d+)?e\+?\d+$/i

/** 행에 담긴 알맹이 수 — 파일 안 중복에서 어느 줄을 남길지 정한다. */
function density(r: ParsedRow): number {
  const cells = [r.affiliation, r.department, r.position, r.email, r.phone, r.linkedin, r.category, r.country]
  return cells.filter((v) => v.trim()).length + r.expertise.length
}

/** 빈 칸만 채운다 — 남기기로 한 줄의 값은 덮지 않는다. */
function fillGaps(winner: ParsedRow, loser: ParsedRow): ParsedRow {
  const pick = (a: string, b: string) => (a.trim() ? a : b)
  return {
    ...winner,
    affiliation: pick(winner.affiliation, loser.affiliation),
    department: pick(winner.department, loser.department),
    position: pick(winner.position, loser.position),
    email: pick(winner.email, loser.email),
    phone: pick(winner.phone, loser.phone),
    linkedin: pick(winner.linkedin, loser.linkedin),
    category: pick(winner.category, loser.category),
    country: pick(winner.country, loser.country),
    expertise: winner.expertise.length ? winner.expertise : loser.expertise,
    phoneCorrupt: winner.phoneCorrupt && loser.phoneCorrupt,
  }
}

/**
 * **같은 파일 안**의 중복을 한 줄로 접는다.
 *
 * 중복 대조(`findExistingMatches`)는 원장과만 맞추므로, 한 사람의 명함을 두 번 받아 두 줄로
 * 실린 파일은 그대로 두 행이 등록된다 — 그리고 두 번째 행은 첫 번째가 방금 만든 행과
 * 중복이지만 그 사실을 아무도 모른다(대조는 업로드 **전에** 한 번 돌았다).
 *
 * 접는 기준은 **이름이 같고 연락처(휴대폰 또는 이메일)가 같을 때**다. 이름을 함께 보는 것이
 * 요점이다 — 회사 대표 메일(`info@`)을 명함에 적는 곳이 있어 이메일만으로 접으면 같은 회사
 * 동료 둘이 한 사람이 된다. 반대로 이름만으로 접으면 동명이인이 합쳐진다.
 *
 * 남기는 줄은 값이 더 많이 찬 쪽이고, 진 줄의 값은 **빈 칸만** 메운다. 접힌 줄 번호는
 * 남은 행이 들고 다녀 화면이 "무엇을 접었는지"를 말할 수 있게 한다(조용히 지우지 않는다).
 */
export function foldFileDuplicates(rows: ParsedRow[]): ParsedRow[] {
  const out: ParsedRow[] = []
  const seatByKey = new Map<string, number>()
  const keysOf = (r: ParsedRow): string[] => {
    const name = normText(r.name)
    if (!name) return []
    const keys: string[] = []
    const phone = normPhone(r.phone)
    const email = normText(r.email)
    if (phone) keys.push(`p|${name}|${phone}`)
    if (email) keys.push(`e|${name}|${email}`)
    return keys
  }
  for (const row of rows) {
    const keys = keysOf(row)
    let seat = -1
    for (const k of keys) {
      const hit = seatByKey.get(k)
      if (hit !== undefined) { seat = hit; break }
    }
    if (seat < 0) {
      seat = out.length
      out.push({ ...row })
    } else {
      const kept = out[seat]!
      const [winner, loser] = density(row) > density(kept) ? [row, kept] : [kept, row]
      const folded = [...kept.foldedLines, ...row.foldedLines, kept.line, row.line]
      out[seat] = {
        ...fillGaps(winner, loser),
        line: winner.line,
        foldedLines: [...new Set(folded)].filter((l) => l !== winner.line).sort((a, b) => a - b),
      }
    }
    // 접은 뒤에 생긴 키(진 줄이 들고 온 이메일 등)도 같은 자리를 가리켜야 세 줄이 이어 접힌다.
    for (const k of keysOf(out[seat]!)) seatByKey.set(k, seat)
  }
  return out
}

/**
 * 국가번호 → 국가 태그 이름. 자릿수가 긴 것부터 본다(`+370`이 `+37`보다 먼저 걸려야 한다).
 * 이름은 `country_tags` 시드 표기 그대로여서 화면이 그대로 대조한다.
 */
const DIAL_CODES: [string, string][] = [
  ['370', '리투아니아'], ['358', '핀란드'], ['886', '대만'], ['852', '홍콩'],
  ['971', '아랍에미리트'], ['966', '사우디아라비아'], ['84', '베트남'], ['82', '한국'],
  ['81', '일본'], ['86', '중국'], ['66', '태국'], ['65', '싱가포르'], ['63', '필리핀'],
  ['62', '인도네시아'], ['61', '호주'], ['60', '말레이시아'], ['49', '독일'], ['48', '폴란드'],
  ['46', '스웨덴'], ['44', '영국'], ['33', '프랑스'], ['31', '네덜란드'], ['91', '인도'], ['1', '미국'],
]

/** 국내 번호 꼴(`010-…` · `02-…` · `070-…`). 앞에 0이 서는 것이 국내 번호의 표시다. */
const DOMESTIC_PHONE = /^0(1[016789]|2|[3-7]\d)/

/**
 * 연락처에서 국가를 짐작한다. 명함첩에는 국가 열이 없어 그냥 올리면 **전 행이 미확인**이 되고,
 * 국가는 이 원장에서 구분과 나란한 축이라 그 상태로는 목록의 권역 카드가 답을 못 한다.
 *
 * **근무처 전화는 보지 않는다**(2026-09-10 사용자 결정: 대표전화는 쓰지 않는다) — 함께 보면
 * 서른 줄쯤 더 맞히지만, 저장하지 않기로 한 열을 판정에만 몰래 쓰는 자리가 생긴다.
 *
 * 짐작이지 확정이 아니다 — 한국 번호를 그대로 쓰는 해외 체류자는 한국으로 선다. 화면에서
 * 사람이 고쳐 쓰는 출발점이며, 짐작할 근거가 없으면 빈 문자열로 두어 '미확인'이 된다.
 */
export function guessCountryName(phone: string): string {
  const raw = (phone ?? '').trim()
  if (!raw || SCI_NOTATION.test(raw.replace(/\s/g, ''))) return ''
  if (raw.startsWith('+') || raw.startsWith('00')) {
    const digits = raw.replace(/\D/g, '').replace(/^00/, '')
    for (const [code, name] of DIAL_CODES) if (digits.startsWith(code)) return name
    return ''
  }
  return DOMESTIC_PHONE.test(raw.replace(/\D/g, '')) ? '한국' : ''
}

/** 다운로드용 템플릿 CSV(헤더 + 예시 2행). 구분·영역은 비워도 됨을 예시로 보인다. */
export function buildTemplateCsv(): string {
  return [
    BULK_HEADERS.join(','),
    '홍길동,전문가,한국,투자;마케팅,와이앤아처,전략실,대표,hong@example.com,010-1234-5678,',
    'John Doe,투자사,미국,,Acme Ventures,,Partner,john@example.com,,https://linkedin.com/in/johndoe',
  ].join('\n')
}

// CSV 라인 분해·파일 다운로드는 화면과 무관한 문자열 처리라 lib/csv가 소유한다(자산 임포터와 공유).
// 기존 호출부(BulkUploadPanel 등)가 이 모듈에서 가져다 쓰므로 이름은 여기서도 유지한다.
export { downloadCsv } from '@/lib/csv'

/** 파일 콘텐츠 SHA-256 해시(hex). 동일 파일 재업로드 경고용. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** URL 길이 한계를 피하기 위한 in() 배치 크기. */
const IN_CHUNK = 200

/** 확실중복으로 매칭된 기존 레코드 참조(비교·보강·병합 대상). */
export interface ExistingRef {
  id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  expertise: unknown[]
  profile: Record<string, unknown>
  /** 기존 레코드의 현재 구분 코드. null이면 구분 미지정. */
  category: NetworkCategory | null
  /** 기존 레코드의 현재 국가 태그. null이면 국가 미확인. */
  countryTagId: string | null
  /** 선행 생성자(최초 기여자)명. 기여 로그에서 조회. */
  contributor: string | null
  /** 비활성(soft-delete) 상태 여부. true면 재업로드 시 '복구' 대상. */
  deleted: boolean
  /** 비활성화한 사람 이름(가장 최근 deactivated 기여). 비활성 매칭에서만 채워진다. */
  deactivatedBy: string | null
  /** 비활성화 사유(가장 최근 deactivated 기여의 note). */
  deactivateReason: string | null
}

interface ExistingRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  expertise: unknown[] | null
  profile: Record<string, unknown> | null
  category: string | null
  country_tag_id: string | null
  deleted_at: string | null
}

function toRef(r: ExistingRow): ExistingRef {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    affiliation: r.affiliation,
    expertise: Array.isArray(r.expertise) ? r.expertise : [],
    profile: (r.profile ?? {}) as Record<string, unknown>,
    category: (r.category as NetworkCategory | null) ?? null,
    countryTagId: r.country_tag_id,
    contributor: null,
    deleted: Boolean(r.deleted_at),
    deactivatedBy: null,
    deactivateReason: null,
  }
}

/** 매칭 후보(정규화 필드 포함). 이름/이메일/전화의 정규화 값을 미리 계산해 교차 비교에 쓴다. */
interface Candidate {
  ref: ExistingRef
  nName: string
  nEmail: string
  nPhone: string
}


/**
 * 업로드 행별로 기존 중복 레코드를 찾아 매칭한다.
 * 중복 기준: 이름·전화·이메일 중 **2개 이상 일치**(공용번호/공용메일 단독 일치 오탐 방지).
 * 비활성 행까지 함께 조회한다(재업로드 복구 판정).
 *
 * 원장 통합(2026-09-04) 전에는 표 9종을 각각 훑고 결과를 합쳤다 — 그래서 같은 사람이
 * 두 원장에 있으면 어느 쪽과 맞출지부터 정해야 했다. 지금은 한 원장이라 그 물음이 없다.
 */
export async function findExistingMatches(
  rows: { line: number; name: string; email: string; phone: string }[],
): Promise<Map<number, ExistingRef>> {
  // 후보 조회 키(원값 기준 IN 조회 — DB 저장 형태와 그대로 비교). 정규화는 카운팅 단계에서 수행한다.
  const names = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))]
  const emails = [...new Set(rows.map((r) => r.email.trim()).filter(Boolean))]
  const phones = [...new Set(rows.map((r) => normPhone(r.phone)).filter(Boolean))]
  const cols =
    'id,name,email,phone,affiliation,expertise,profile,category,country_tag_id,deleted_at'

  // 이름/이메일/전화 중 하나라도 걸리는 후보를 id로 중복 없이 모은다.
  const byId = new Map<string, Candidate>()
  const collect = (data: ExistingRow[]) => {
    for (const r of data) {
      if (byId.has(r.id)) continue
      byId.set(r.id, {
        ref: toRef(r),
        nName: normText(r.name),
        nEmail: normText(r.email),
        nPhone: normPhone(r.phone),
      })
    }
  }
  const queryBy = (field: 'name' | 'email' | 'phone', values: string[]) =>
    chunk(values, IN_CHUNK).map(async (batch) => {
      const { data } = await supabase.from(NETWORK_TABLE).select(cols).in(field, batch)
      collect((data ?? []) as unknown as ExistingRow[])
    })

  await Promise.all([
    ...queryBy('name', names),
    ...queryBy('email', emails),
    ...queryBy('phone', phones),
  ])

  // 후보를 정규화 값으로 색인한다(행별로 관련 후보만 빠르게 추린다).
  const idxName = new Map<string, Candidate[]>()
  const idxEmail = new Map<string, Candidate[]>()
  const idxPhone = new Map<string, Candidate[]>()
  const push = (m: Map<string, Candidate[]>, k: string, c: Candidate) => {
    if (!k) return
    const arr = m.get(k)
    if (arr) arr.push(c)
    else m.set(k, [c])
  }
  for (const c of byId.values()) {
    push(idxName, c.nName, c)
    push(idxEmail, c.nEmail, c)
    push(idxPhone, c.nPhone, c)
  }

  const out = new Map<number, ExistingRef>()
  for (const r of rows) {
    const rn = normText(r.name)
    const re = normText(r.email)
    const rp = normPhone(r.phone)
    // 이 행과 필드 하나라도 겹치는 후보만 모아 2개 이상 일치를 판정한다.
    const cands = new Map<string, Candidate>()
    for (const c of [...(idxName.get(rn) ?? []), ...(idxEmail.get(re) ?? []), ...(idxPhone.get(rp) ?? [])]) {
      cands.set(c.ref.id, c)
    }
    let best: { ref: ExistingRef; count: number } | null = null
    for (const c of cands.values()) {
      const count =
        (rn && rn === c.nName ? 1 : 0) + (re && re === c.nEmail ? 1 : 0) + (rp && rp === c.nPhone ? 1 : 0)
      if (count < 2) continue
      // 일치 수가 많은 후보 우선, 동률이면 활성 레코드를 우선한다.
      if (!best || count > best.count || (count === best.count && best.ref.deleted && !c.ref.deleted)) {
        best = { ref: c.ref, count }
      }
    }
    if (best) out.set(r.line, best.ref)
  }

  // 기여 로그에서 선행 생성자(최초 기여자)와, 비활성 매칭의 비활성화자·사유(가장 최근 deactivated)를 채운다.
  const refs = [...new Set(out.values())]
  const ids = refs.map((r) => r.id)
  if (ids.length) {
    const firstBy = new Map<string, string>()
    const deactBy = new Map<string, { user: string | null; note: string | null }>()
    for (const batch of chunk(ids, IN_CHUNK)) {
      const { data } = await supabase
        .from('entity_contributions')
        .select('entity_id, user_name, action, note, created_at')
        .in('entity_id', batch)
        .order('created_at', { ascending: true })
      for (const c of (data ?? []) as {
        entity_id: string
        user_name: string | null
        action: string
        note: string | null
      }[]) {
        if (c.user_name && !firstBy.has(c.entity_id)) firstBy.set(c.entity_id, c.user_name)
        // 오름차순 조회라 마지막으로 덮인 값이 가장 최근 deactivated가 된다.
        if (c.action === 'deactivated') deactBy.set(c.entity_id, { user: c.user_name, note: c.note })
      }
    }
    for (const ref of refs) {
      ref.contributor = firstBy.get(ref.id) ?? null
      const d = deactBy.get(ref.id)
      if (d) {
        ref.deactivatedBy = d.user
        ref.deactivateReason = d.note
      }
    }
  }
  return out
}

/**
 * 병합(합치기) 시 기존 레코드를 업로드 값으로 보강하는 부분 업데이트를 만든다. 보강할 게 없으면 null.
 * - 연락처(이메일·전화·링크드인)는 비파괴 — 기존 값이 있으면 건드리지 않고 빈 칸만 채운다.
 * - 소속·부서·직책은 '신규를 현재로 승격' — 새 값이 있고 기존과 다르면 덮어쓴다.
 *   덮인 직전 조합은 원장 트리거(app.track_affiliation_history)가 profile.affiliation_history에
 *   보존하므로, 여기서 이력을 직접 만들지 않는다(트리거가 배열의 단일 소유자).
 * - 영역(expertise)는 비파괴 — 기존에 지정된 영역이 있으면 파일 값으로 덮지 않는다.
 *   상세 화면에서 고른 영역이 명함 한 장 때문에 밀려나면 안 된다.
 * - 구분·국가는 리뷰 화면에서 사람이 확정한 값이므로 다르면 바꾼다. 통합 원장에서는 이것이
 *   행 이동이 아니라 한 칸 수정이라, 종전의 '재분류 이관'(삭제 + 재등록)이 사라졌다.
 */
export function buildEnrichment(
  existing: ExistingRef,
  row: ParsedRow,
  target?: { category: NetworkCategory | null; countryTagId: string | null },
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  const prof = { ...existing.profile }
  let profChanged = false
  if (!existing.email && row.email) patch.email = row.email
  if (!existing.phone && row.phone) patch.phone = row.phone.replace(/\D/g, '')
  if (!existing.profile.linkedin_url && row.linkedin) patch.linkedin_url = row.linkedin
  if (existing.expertise.length === 0 && row.expertise.length > 0) patch.expertise = row.expertise
  if (row.affiliation && row.affiliation !== (existing.affiliation ?? '')) {
    patch.affiliation = row.affiliation
  }
  if (row.department && row.department !== ((prof.department as string) ?? '')) {
    prof.department = row.department
    profChanged = true
  }
  if (row.position && row.position !== ((prof.position as string) ?? '')) {
    prof.position = row.position
    profChanged = true
  }
  if (target) {
    if (target.category !== existing.category) patch.category = target.category
    // 국가는 비파괴다 — 파일에 없으면(null) 기존 국가를 지우지 않는다.
    if (target.countryTagId && target.countryTagId !== existing.countryTagId) {
      patch.country_tag_id = target.countryTagId
    }
  }
  if (profChanged) patch.profile = prof
  return Object.keys(patch).length ? patch : null
}

/** 파싱 행 + 확정 구분·국가 → 통일 스키마 페이로드. */
export function rowToPayload(
  row: ParsedRow,
  category: NetworkCategory | null,
  countryTagId: string | null,
): Record<string, unknown> {
  const compact = isCompactCategory(category)
  return {
    name: row.name,
    email: row.email || null,
    phone: row.phone.replace(/\D/g, '') || null,
    affiliation: row.affiliation || null,
    linkedin_url: row.linkedin || null,
    category,
    country_tag_id: countryTagId,
    // 조직형(축약)은 영역을 쓰지 않는다 — 폼·상세에서도 감춰 두는 축이라 값을 만들지 않는다.
    expertise: compact ? [] : row.expertise,
    profile: {
      department: row.department || null,
      position: row.position || null,
      match_available: compact ? null : true,
      source: 'bulk_upload',
    },
  }
}

/** CSV의 구분 원값 → 코드. 알 수 없으면 null(리뷰 화면에서 사람이 채운다). */
export function csvCategory(raw: string): NetworkCategory | null {
  return resolveCategory(raw)
}
