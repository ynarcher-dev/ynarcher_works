import { supabase } from '@/lib/supabase'
import {
  GLOBAL_CATEGORY_OPTIONS,
  GLOBAL_TABLE,
  type GlobalCategory,
} from '@/features/networks/globalConfig'

/**
 * 글로벌 대용량 업로드 표준 CSV 헤더.
 * 국내 9종(bulkUpload.ts)과 달리 구분이 테이블을 가르지 않고 스칼라(기업/기관/투자자)이며,
 * 링크드인·권역·국가(이름으로 입력 → 태그로 매칭) 컬럼이 더 있다.
 */
export const GLOBAL_BULK_HEADERS = [
  'name',
  'category',
  'affiliation',
  'department',
  'position',
  'email',
  'phone',
  'linkedin',
  'region',
  'country',
] as const

/**
 * 외부 export 헤더 → 표준 필드 별칭. 키는 소문자/공백제거 후 비교한다.
 * 매칭 안 되는 컬럼은 무시한다(국내 임포터와 동일 규약 + 글로벌 전용 컬럼 추가).
 */
const HEADER_ALIASES: Record<string, string> = {
  이름: 'name', 성명: 'name', name: 'name',
  구분: 'category', category: 'category',
  회사: 'affiliation', 회사명: 'affiliation', 소속: 'affiliation', affiliation: 'affiliation', company: 'affiliation',
  부서: 'department', 부서명: 'department', department: 'department',
  직함: 'position', 직책: 'position', 직급: 'position', position: 'position', title: 'position',
  이메일: 'email', email: 'email', 'e-mail': 'email',
  휴대폰: 'phone', 휴대전화: 'phone', 핸드폰: 'phone', 전화: 'phone', 연락처: 'phone', phone: 'phone', mobile: 'phone',
  링크드인: 'linkedin', linkedin: 'linkedin', 'linkedin_url': 'linkedin', linkedinurl: 'linkedin',
  권역: 'region', region: 'region',
  국가: 'country', 나라: 'country', country: 'country',
}

export interface GlobalParsedRow {
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
  /** CSV의 권역·국가 이름 원값(태그 매칭 전). */
  region: string
  country: string
}

/** 따옴표/이스케이프를 처리하는 최소 CSV 라인 분해기. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuote = false
      } else cur += c
    } else if (c === '"') inQuote = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** CSV 텍스트를 표준 필드로 매핑해 파싱한다(헤더 별칭 자동 인식). */
export function parseGlobalBulkCsv(text: string): GlobalParsedRow[] {
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
    return {
      line: i + 2,
      name: at(cells, 'name'),
      affiliation: at(cells, 'affiliation'),
      department: at(cells, 'department'),
      position: at(cells, 'position'),
      email: at(cells, 'email'),
      phone: at(cells, 'phone'),
      linkedin: at(cells, 'linkedin'),
      category: at(cells, 'category'),
      region: at(cells, 'region'),
      country: at(cells, 'country'),
    }
  })
}

/** 다운로드용 템플릿 CSV(헤더 + 예시 2행). 구분·권역·국가는 비워도 됨을 예시로 보인다. */
export function buildGlobalTemplateCsv(): string {
  return [
    GLOBAL_BULK_HEADERS.join(','),
    'John Smith,기업,Acme Inc.,전략실,CEO,john@acme.com,+1-555-0100,https://linkedin.com/in/john,북미,미국',
    'Marie Dubois,,,,파트너,marie@example.com,,,,프랑스',
  ].join('\n')
}

/** CSV의 구분 원값을 글로벌 3값 중 하나로 정규화한다. 매칭 안 되면 빈 값(선택 안 함). */
export function normalizeGlobalCategory(raw: string): GlobalCategory | '' {
  const found = GLOBAL_CATEGORY_OPTIONS.find((c) => c === raw.trim())
  return found ?? ''
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** URL 길이 한계를 피하기 위한 in() 배치 크기. */
const IN_CHUNK = 200

/** 확실중복으로 매칭된 기존 글로벌 레코드 참조(비교·보강 대상). */
export interface GlobalExistingRef {
  id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  linkedin_url: string | null
  category: string | null
  region_tag_id: string | null
  country_tag_id: string | null
  expertise: unknown[]
  profile: Record<string, unknown>
  /** 선행 작성자(최초 기여자)명. 기여 로그에서 조회. */
  contributor: string | null
  /** 비활성(soft-delete) 상태 여부. true면 재업로드 시 '복구' 대상. */
  deleted: boolean
  /** 비활성화한 사람 이름(가장 최근 deactivated 기여). 비활성 매칭에서만 채워진다. */
  deactivatedBy: string | null
  /** 비활성화 사유(가장 최근 deactivated 기여의 note). */
  deactivateReason: string | null
}

interface GlobalExistingRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  linkedin_url: string | null
  category: string | null
  region_tag_id: string | null
  country_tag_id: string | null
  expertise: unknown[] | null
  profile: Record<string, unknown> | null
  deleted_at: string | null
}

function toRef(r: GlobalExistingRow): GlobalExistingRef {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    affiliation: r.affiliation,
    linkedin_url: r.linkedin_url,
    category: r.category,
    region_tag_id: r.region_tag_id,
    country_tag_id: r.country_tag_id,
    expertise: Array.isArray(r.expertise) ? r.expertise : [],
    profile: (r.profile ?? {}) as Record<string, unknown>,
    contributor: null,
    deleted: Boolean(r.deleted_at),
    deactivatedBy: null,
    deactivateReason: null,
  }
}

interface Candidate {
  ref: GlobalExistingRef
  nName: string
  nEmail: string
  nPhone: string
}

const normText = (v: unknown) => String(v ?? '').trim().toLowerCase()
const normPhone = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * 업로드 행별로 기존 글로벌 중복 레코드를 찾아 매칭한다.
 * 중복 기준: 이름·전화·이메일 중 **2개 이상 일치**(공용번호/공용메일 단독 일치 오탐 방지).
 * 국내 9종과 달리 단일 마스터(global_networks)만 조회한다(비활성 포함).
 */
export async function findGlobalMatches(
  rows: { line: number; name: string; email: string; phone: string }[],
): Promise<Map<number, GlobalExistingRef>> {
  const names = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))]
  const emails = [...new Set(rows.map((r) => r.email.trim()).filter(Boolean))]
  const phones = [...new Set(rows.map((r) => normPhone(r.phone)).filter(Boolean))]
  const cols =
    'id,name,email,phone,affiliation,linkedin_url,category,region_tag_id,country_tag_id,expertise,profile,deleted_at'

  const byId = new Map<string, Candidate>()
  const collect = (data: GlobalExistingRow[]) => {
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
      const { data } = await supabase.from(GLOBAL_TABLE).select(cols).in(field, batch)
      collect((data ?? []) as GlobalExistingRow[])
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

  const out = new Map<number, GlobalExistingRef>()
  for (const r of rows) {
    const rn = normText(r.name)
    const re = normText(r.email)
    const rp = normPhone(r.phone)
    const cands = new Map<string, Candidate>()
    for (const c of [...(idxName.get(rn) ?? []), ...(idxEmail.get(re) ?? []), ...(idxPhone.get(rp) ?? [])]) {
      cands.set(c.ref.id, c)
    }
    let best: { ref: GlobalExistingRef; count: number } | null = null
    for (const c of cands.values()) {
      const count =
        (rn && rn === c.nName ? 1 : 0) + (re && re === c.nEmail ? 1 : 0) + (rp && rp === c.nPhone ? 1 : 0)
      if (count < 2) continue
      if (!best || count > best.count || (count === best.count && best.ref.deleted && !c.ref.deleted)) {
        best = { ref: c.ref, count }
      }
    }
    if (best) out.set(r.line, best.ref)
  }

  // 기여 로그에서 선행 작성자와, 비활성 매칭의 비활성화자·사유(가장 최근 deactivated)를 채운다.
  const refs = [...new Set(out.values())]
  const ids = refs.map((r) => r.id)
  if (ids.length) {
    const firstBy = new Map<string, string>()
    const deactBy = new Map<string, { user: string | null; note: string | null }>()
    for (const batch of chunk(ids, IN_CHUNK)) {
      const { data } = await supabase
        .from('entity_contributions')
        .select('entity_id, user_name, action, note, created_at')
        .eq('entity_table', GLOBAL_TABLE)
        .in('entity_id', batch)
        .order('created_at', { ascending: true })
      for (const c of (data ?? []) as {
        entity_id: string
        user_name: string | null
        action: string
        note: string | null
      }[]) {
        if (c.user_name && !firstBy.has(c.entity_id)) firstBy.set(c.entity_id, c.user_name)
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

/** 권역·국가 이름(대소문자·공백 무시) → 태그 id 매핑기. 매칭 실패 시 null. */
export interface TagResolver {
  region: (name: string) => string | null
  country: (name: string) => string | null
}

/**
 * 병합(합치기) 시 기존 글로벌 레코드를 업로드 값으로 보강하는 부분 업데이트를 만든다.
 * - 연락처(이메일·전화)·링크드인·권역·국가는 비파괴 — 빈 칸만 채운다.
 * - 소속·부서·직책은 '신규를 현재로 승격' — 새 값이 있고 기존과 다르면 덮어쓴다.
 * - 구분(category)은 스칼라 컬럼이라, 업로드 구분이 있고 기존과 다르면 덮어쓴다.
 * 보강할 게 없으면 null.
 */
export function buildGlobalEnrichment(
  existing: GlobalExistingRef,
  row: GlobalParsedRow,
  category: GlobalCategory | '',
  tags: TagResolver,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  const prof = { ...existing.profile }
  let profChanged = false
  if (!existing.email && row.email) patch.email = row.email
  if (!existing.phone && row.phone) patch.phone = row.phone.replace(/\D/g, '')
  if (!existing.linkedin_url && row.linkedin) patch.linkedin_url = row.linkedin
  if (row.affiliation && row.affiliation !== (existing.affiliation ?? '')) {
    patch.affiliation = row.affiliation
  }
  if (category && category !== (existing.category ?? '')) patch.category = category
  if (!existing.region_tag_id && row.region) {
    const id = tags.region(row.region)
    if (id) patch.region_tag_id = id
  }
  if (!existing.country_tag_id && row.country) {
    const id = tags.country(row.country)
    if (id) patch.country_tag_id = id
  }
  if (row.department && row.department !== ((prof.department as string) ?? '')) {
    prof.department = row.department
    profChanged = true
  }
  if (row.position && row.position !== ((prof.position as string) ?? '')) {
    prof.position = row.position
    profChanged = true
  }
  if (profChanged) patch.profile = prof
  return Object.keys(patch).length ? patch : null
}

/** 파싱 행 + 선택 구분 → global_networks insert 페이로드. */
export function rowToGlobalPayload(
  row: GlobalParsedRow,
  category: GlobalCategory | '',
  tags: TagResolver,
): Record<string, unknown> {
  return {
    name: row.name,
    category: category || null,
    affiliation: row.affiliation || null,
    email: row.email || null,
    phone: row.phone.replace(/\D/g, '') || null,
    linkedin_url: row.linkedin || null,
    region_tag_id: row.region ? tags.region(row.region) : null,
    country_tag_id: row.country ? tags.country(row.country) : null,
    expertise: [],
    profile: {
      department: row.department || null,
      position: row.position || null,
      intro: null,
      photo: null,
      source: 'bulk_upload',
    },
  }
}
