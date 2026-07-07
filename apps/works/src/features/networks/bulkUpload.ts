import { supabase } from '@/lib/supabase'
import {
  DIRECTORY_ENTITIES,
  ENTITIES,
  isCompactEntity,
  resolveEntityFromCategory,
  type EntityKey,
} from '@/features/networks/config'

/** 대용량 업로드 표준 CSV 헤더. */
export const BULK_HEADERS = [
  'name',
  'category',
  'affiliation',
  'department',
  'position',
  'email',
  'phone',
] as const

/**
 * 외부 export(리멤버 등) 헤더 → 표준 필드 별칭.
 * 키는 소문자/공백제거 후 비교한다. 매칭 안 되는 컬럼은 무시한다.
 */
const HEADER_ALIASES: Record<string, string> = {
  이름: 'name', 성명: 'name', name: 'name',
  구분: 'category', category: 'category',
  회사: 'affiliation', 회사명: 'affiliation', 소속: 'affiliation', affiliation: 'affiliation', company: 'affiliation',
  부서: 'department', 부서명: 'department', department: 'department',
  직함: 'position', 직책: 'position', 직급: 'position', position: 'position', title: 'position',
  이메일: 'email', email: 'email', 'e-mail': 'email',
  휴대폰: 'phone', 휴대전화: 'phone', 핸드폰: 'phone', 전화: 'phone', 연락처: 'phone', phone: 'phone', mobile: 'phone',
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
  /** CSV의 '구분' 원값(비어 있을 수 있음). */
  category: string
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
    return {
      line: i + 2,
      name: at(cells, 'name'),
      affiliation: at(cells, 'affiliation'),
      department: at(cells, 'department'),
      position: at(cells, 'position'),
      email: at(cells, 'email'),
      phone: at(cells, 'phone'),
      category: at(cells, 'category'),
    }
  })
}

/** 다운로드용 템플릿 CSV(헤더 + 예시 2행). 구분은 비워도 됨을 예시로 보인다. */
export function buildTemplateCsv(): string {
  return [
    BULK_HEADERS.join(','),
    '홍길동,전문가,와이앤아처,전략실,대표,hong@example.com,010-1234-5678',
    '김미분,,수집처 회사명,,팀장,kim@example.com,010-0000-0000',
  ].join('\n')
}

/** 텍스트를 CSV 파일로 다운로드(Excel 한글 대응 BOM 포함). */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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
  table: EntityKey
  id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  expertise: unknown[]
  profile: Record<string, unknown>
  /** 기존 레코드의 현재 구분 라벨(profile.category 우선, 없으면 테이블 라벨). */
  category: string
  /** 선행 작성자(최초 기여자)명. 기여 로그에서 조회. */
  contributor: string | null
  /** 비활성(soft-delete) 상태 여부. true면 재업로드 시 '복구' 대상. */
  deleted: boolean
}

interface ExistingRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  affiliation: string | null
  expertise: unknown[] | null
  profile: Record<string, unknown> | null
  deleted_at: string | null
}

function toRef(table: EntityKey, r: ExistingRow): ExistingRef {
  const profile = (r.profile ?? {}) as Record<string, unknown>
  return {
    table,
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    affiliation: r.affiliation,
    expertise: Array.isArray(r.expertise) ? r.expertise : [],
    profile,
    category: (profile.category as string) || ENTITIES[table].label,
    contributor: null,
    deleted: Boolean(r.deleted_at),
  }
}

/** 매칭 후보(정규화 필드 포함). 이름/이메일/전화의 정규화 값을 미리 계산해 교차 비교에 쓴다. */
interface Candidate {
  ref: ExistingRef
  nName: string
  nEmail: string
  nPhone: string
}

const normText = (v: unknown) => String(v ?? '').trim().toLowerCase()
const normPhone = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * 업로드 행별로 기존 중복 레코드를 찾아 매칭한다.
 * 중복 기준: 이름·전화·이메일 중 **2개 이상 일치**(공용번호/공용메일 단독 일치 오탐 방지).
 * 9종 네트워크 테이블(비활성 포함)을 조회하며, 없는 테이블은 조용히 건너뛴다.
 */
export async function findExistingMatches(
  rows: { line: number; name: string; email: string; phone: string }[],
): Promise<Map<number, ExistingRef>> {
  // 후보 조회 키(원값 기준 IN 조회 — DB 저장 형태와 그대로 비교). 정규화는 카운팅 단계에서 수행한다.
  const names = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))]
  const emails = [...new Set(rows.map((r) => r.email.trim()).filter(Boolean))]
  const phones = [...new Set(rows.map((r) => normPhone(r.phone)).filter(Boolean))]
  const cols = 'id,name,email,phone,affiliation,expertise,profile,deleted_at'

  // 이름/이메일/전화 중 하나라도 걸리는 후보를 테이블+id로 중복 없이 모은다.
  const byId = new Map<string, Candidate>()
  const collect = (table: EntityKey, data: ExistingRow[]) => {
    for (const r of data) {
      const key = `${table}:${r.id}`
      if (byId.has(key)) continue
      byId.set(key, {
        ref: toRef(table, r),
        nName: normText(r.name),
        nEmail: normText(r.email),
        nPhone: normPhone(r.phone),
      })
    }
  }
  const queryBy = (field: 'name' | 'email' | 'phone', values: string[]) =>
    DIRECTORY_ENTITIES.flatMap((table) =>
      chunk(values, IN_CHUNK).map(async (batch) => {
        const { data } = await supabase.from(table).select(cols).in(field, batch)
        collect(table, (data ?? []) as ExistingRow[])
      }),
    )

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
      cands.set(`${c.ref.table}:${c.ref.id}`, c)
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

  // 선행 작성자(최초 기여자)명을 기여 로그에서 일괄 조회해 매칭에 채운다.
  const refs = [...new Set(out.values())]
  const ids = refs.map((r) => r.id)
  if (ids.length) {
    const firstBy = new Map<string, string>()
    for (const batch of chunk(ids, IN_CHUNK)) {
      const { data } = await supabase
        .from('entity_contributions')
        .select('entity_id, user_name, created_at')
        .in('entity_id', batch)
        .order('created_at', { ascending: true })
      for (const c of (data ?? []) as { entity_id: string; user_name: string | null }[]) {
        if (c.user_name && !firstBy.has(c.entity_id)) firstBy.set(c.entity_id, c.user_name)
      }
    }
    for (const ref of refs) ref.contributor = firstBy.get(ref.id) ?? null
  }
  return out
}

/**
 * 병합(합치기) 시 기존 레코드의 빈 필드를 업로드 값으로 보강하는 부분 업데이트를 만든다.
 * 비파괴 원칙: 기존 값이 있는 필드는 건드리지 않는다. 보강할 게 없으면 null.
 */
export function buildEnrichment(
  existing: ExistingRef,
  row: ParsedRow,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  const prof = { ...existing.profile }
  let profChanged = false
  if (!existing.email && row.email) patch.email = row.email
  if (!existing.phone && row.phone) patch.phone = row.phone.replace(/\D/g, '')
  if (!existing.affiliation && row.affiliation) patch.affiliation = row.affiliation
  if (!prof.department && row.department) {
    prof.department = row.department
    profChanged = true
  }
  if (!prof.position && row.position) {
    prof.position = row.position
    profChanged = true
  }
  if (profChanged) patch.profile = prof
  return Object.keys(patch).length ? patch : null
}

/**
 * 합치기+재분류 시 대상 테이블에 insert할 병합 완성 페이로드.
 * 기존 레코드 값을 기준으로 업로드 값이 빈 필드를 보강하고, 구분(profile.category)을 대상 라벨로 바꾼다.
 */
export function buildReclassifyValues(
  existing: ExistingRef,
  row: ParsedRow,
  targetLabel: string,
): Record<string, unknown> {
  const patch = buildEnrichment(existing, row) ?? {}
  const profile = {
    ...existing.profile,
    ...((patch.profile as Record<string, unknown>) ?? {}),
    category: targetLabel,
  }
  return {
    name: existing.name,
    email: (patch.email as string) ?? existing.email ?? null,
    phone: (patch.phone as string) ?? existing.phone ?? null,
    affiliation: (patch.affiliation as string) ?? existing.affiliation ?? null,
    expertise: existing.expertise,
    profile,
  }
}

/** 파싱 행 + 선택 구분 라벨 → 통일 스키마 페이로드와 저장 대상 테이블. */
export function rowToPayload(
  row: ParsedRow,
  categoryLabel: string,
): { target: EntityKey; payload: Record<string, unknown> } {
  const target = resolveEntityFromCategory(categoryLabel)
  const compact = isCompactEntity(target)
  return {
    target,
    payload: {
      name: row.name,
      email: row.email || null,
      phone: row.phone.replace(/\D/g, '') || null,
      affiliation: row.affiliation || null,
      expertise: [],
      profile: {
        department: row.department || null,
        position: row.position || null,
        category: ENTITIES[target].label,
        match_available: compact ? null : true,
        background: [],
        source: 'bulk_upload',
      },
    },
  }
}
