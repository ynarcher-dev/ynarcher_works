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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** URL 길이 한계를 피하기 위한 in() 배치 크기. */
const IN_CHUNK = 200

/**
 * 이미 등록된 이메일/전화 집합을 조회한다(9종 네트워크 테이블, 미삭제만).
 * 확실중복(동일 이메일 또는 전화) 판정용. 없는 테이블(미적용 마이그레이션 등)은 조용히 건너뛴다.
 */
export async function findExistingContacts(
  emails: string[],
  phones: string[],
): Promise<{ emails: Set<string>; phones: Set<string> }> {
  const outEmails = new Set<string>()
  const outPhones = new Set<string>()
  const uniqEmails = [...new Set(emails.filter(Boolean))]
  const uniqPhones = [...new Set(phones.filter(Boolean))]

  await Promise.all(
    DIRECTORY_ENTITIES.flatMap((table) => [
      ...chunk(uniqEmails, IN_CHUNK).map(async (batch) => {
        const { data } = await supabase
          .from(table).select('email').is('deleted_at', null).in('email', batch)
        for (const r of (data ?? []) as { email: string | null }[]) {
          if (r.email) outEmails.add(r.email)
        }
      }),
      ...chunk(uniqPhones, IN_CHUNK).map(async (batch) => {
        const { data } = await supabase
          .from(table).select('phone').is('deleted_at', null).in('phone', batch)
        for (const r of (data ?? []) as { phone: string | null }[]) {
          if (r.phone) outPhones.add(r.phone)
        }
      }),
    ]),
  )
  return { emails: outEmails, phones: outPhones }
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
