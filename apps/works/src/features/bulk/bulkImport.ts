/**
 * 원장 공용 대용량 업로드 — CSV 한 장을 원장에 넣을 행들로 바꾸고, 바꿀 수 없는 줄은 이유를 남긴다.
 *
 * 원장마다 임포터를 따로 쓰면 검증 강도와 오류 문구가 원장마다 갈라진다(NETWORKS는 중복 병합까지
 * 보는데 다른 곳은 헤더조차 안 보는 식으로). 그래서 "어떤 열을 받아 어느 컬럼에 넣는가"만 원장별
 * 명세(BulkImportSpec)로 두고, 파싱·검증·오류 표기·업로드 경로는 이 파일과 BulkImportPage가 소유한다.
 *
 * 검증의 기준선은 **등록 폼이 막는 것은 업로드도 막는다**이다. 폼에서 태그 원장에서 고르는 값을
 * 업로드에서 자유 텍스트로 받으면, 오타 하나가 조용히 저장되어 그 레코드만 목록 필터에서 사라진다.
 *
 * NETWORKS 9종은 예외다 — 그쪽은 등록이 아니라 '기존 인물과 합치기/재분류'가 본체라 전용 화면
 * (BulkUploadPanel)을 유지한다. 여기서 다루는 것은 신규 등록만 있는 원장이다.
 *
 * 저장은 항상 `upload_insert_entities` RPC를 경유한다. 원장 INSERT와 기여 로그(entity_contributions)가
 * 한 트랜잭션에 묶여야 배치 표식 없는 행이 남지 않는다. RPC는 SECURITY INVOKER라 각 원장의 RLS가
 * 그대로 걸린다(권한이 없으면 화면이 아니라 서버가 막는다).
 */
import type { ReactNode } from 'react'
import { parseCsvTable } from '@/lib/csv'

/** 값을 어떻게 읽을지. 지정하지 않으면 문자열 그대로 넣는다. */
export type BulkFieldKind = 'text' | 'number' | 'date' | 'enum' | 'tag' | 'tags' | 'phone'

/** 태그 원장(ADMIN 태그 관리) 테이블명 → 등록된 태그명 목록. */
export type BulkTagLookup = Record<string, string[]>

export interface BulkField {
  /** CSV 열 이름이자 템플릿 헤더(한국어). */
  header: string
  /**
   * 저장 대상 원장 컬럼명. 점 표기로 jsonb 안쪽을 가리킬 수 있다(`business_profile.oneLiner`) —
   * 폼이 jsonb에 모아 두는 항목까지 업로드에서 빼면 "등록 폼에는 있는데 업로드에는 없는 칸"이 생긴다.
   */
  column: string
  kind?: BulkFieldKind
  required?: boolean
  /**
   * enum 열의 코드 → 라벨 사전. 화면에서 쓰는 말('진행중')과 저장값('OPERATING') 양쪽을 받는다 —
   * 파일을 만드는 사람은 라벨을 알고, 내려받은 데이터를 그대로 올리는 사람은 코드를 갖고 있다.
   */
  labels?: Record<string, string>
  /** kind가 'tag'/'tags'일 때 값을 검증할 태그 원장 테이블명(예: 'industry_tags'). */
  tagTable?: string
  /** kind가 'tags'일 때 고를 수 있는 최대 개수(폼의 상한과 같게 둔다). */
  max?: number
  /** kind가 'tags'일 때 대표값(첫 번째)을 함께 넣을 스칼라 컬럼(하위 호환 미러). */
  mirrorColumn?: string
  /** 내려받은 파일을 손대지 않고 올릴 수 있도록 함께 받는 열 이름(영문 컬럼명 등). */
  aliases?: string[]
  /** 템플릿 예시 행에 넣을 값. */
  example?: string
  /** 열 설명(안내 문구에 쓴다). */
  hint?: string
}

/**
 * 파일과 별개로 화면에서 한 번 지정해 전 행에 적용하는 값(담당자 등).
 *
 * 담당자는 CSV 열로 받기 어렵다 — 사업의 배치는 단계(조직 버전)·부서·투입률·기간의 조합이라
 * 한 칸에 담기지 않고, 이름으로 받으면 동명이인과 오타가 그대로 오류 행이 된다. 그래서 파일이
 * 아니라 화면에서 한 번 고르고, 등록 직후 각 레코드에 같은 배정을 반영한다.
 *
 * 값 타입은 구현체 내부에만 있다(화면은 unknown으로 들고만 다닌다) — 타입 안전한 조립은
 * features/bulk/bulkAssign.tsx의 defineAssignment가 담당한다.
 */
export interface BulkAssignment {
  /** 지정 카드 머리글. */
  title: string
  /** 왜 파일이 아니라 여기서 지정하는지 한 문장. */
  hint: string
  /** 초기값. */
  initial: unknown
  render: (value: unknown, onChange: (next: unknown) => void) => ReactNode
  /** 아직 지정이 덜 됐으면 사유(업로드 버튼을 잠그는 문구), 준비됐으면 null. */
  blockedReason: (value: unknown) => string | null
  /** 등록 전 사전 점검 — 행마다 배정이 성립하는지 본다. 문제가 있으면 사유를 돌려준다. */
  precheck?: (rows: Record<string, unknown>[], value: unknown) => Promise<string | null>
  /** 등록된 id들에 배정을 반영한다(rows는 같은 순서의 등록 페이로드). */
  apply: (ids: string[], rows: Record<string, unknown>[], value: unknown) => Promise<void>
}

export interface BulkImportSpec {
  /** 화면 제목·문구에 쓰는 대상 명사(예: '스타트업', '펀드'). */
  noun: string
  /**
   * 저장 대상 원장 테이블. `app.has_contribution_trigger()`가 인정하는 표여야 한다
   * (기여 로그 트리거가 없으면 RPC가 unsupported_entity로 거절한다).
   */
  table: string
  fields: BulkField[]
  /** 모든 행에 공통으로 박아 넣을 고정값(예: 워크스페이스 구분). */
  fixedValues?: Record<string, unknown>
  /** 업로드 성공 후 무효화할 react-query 키 접두사. */
  invalidateKeys: readonly (readonly unknown[])[]
  /** 템플릿 파일명. */
  templateName: string
  /** 목록으로 돌아갈 경로. */
  backTo: string
  /** 화면 상단 안내 문구(한 문단). */
  guide: string
  /** 파일과 별개로 화면에서 지정하는 값(담당자 등). 없으면 파일만으로 등록한다. */
  assignment?: BulkAssignment
}

export interface BulkRowError {
  /** 원본 CSV 줄 번호(1 = 헤더). */
  line: number
  message: string
}

export interface BulkParseResult {
  /** 원장에 그대로 넣을 수 있는 행. */
  rows: Record<string, unknown>[]
  /** 미리보기 표에 쓰는 원본 셀 값(헤더 순서). */
  preview: { line: number; cells: string[] }[]
  errors: BulkRowError[]
}

/** 명세가 검증에 쓰는 태그 원장 테이블 목록(중복 제거). 화면이 미리 읽어 둘 대상이다. */
export function specTagTables(spec: BulkImportSpec): string[] {
  return [...new Set(spec.fields.map((f) => f.tagTable).filter((t): t is string => Boolean(t)))]
}

/** 헤더 비교용 정규화 — 공백과 대소문자 차이로 열을 못 찾는 일을 막는다. */
function normalizeHeader(raw: string): string {
  return raw.replace(/\s/g, '').toLowerCase()
}

/**
 * 점 표기 컬럼을 페이로드에 넣는다. `a.b`는 `{ a: { b: 값 } }`으로, 같은 부모를 쓰는 항목은 합친다.
 * jsonb 컬럼은 통째로 덮이므로, 한 부모에 여러 열이 들어와도 한 객체로 모여야 한다.
 */
function setColumn(payload: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  if (parts.length === 1) {
    payload[path] = value
    return
  }
  let cursor = payload
  for (const key of parts.slice(0, -1)) {
    const next = cursor[key]
    if (typeof next !== 'object' || next === null) cursor[key] = {}
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[parts[parts.length - 1]!] = value
}

/** 라벨/코드 어느 쪽으로 적혀 있어도 저장 코드로 되돌린다. 모르는 값이면 null. */
function codeOf(raw: string, labels: Record<string, string>): string | null {
  const v = raw.trim()
  if (!v) return ''
  const codes = Object.keys(labels)
  const byCode = codes.find((c) => c.toLowerCase() === v.toLowerCase())
  if (byCode) return byCode
  const byLabel = codes.find((c) => labels[c] === v)
  return byLabel ?? null
}

/**
 * 날짜는 YYYY-MM-DD로 맞춘다. 엑셀이 흔히 쓰는 점·슬래시 구분자는 하이픈으로 바꾼다.
 *
 * 형식만 보고 통과시키면 2026-13-99 같은 값이 그대로 서버로 나가 date 캐스팅에서 터진다.
 * 그때는 에러에 줄 번호가 없어 어느 줄이 문제인지 알 수 없다 — 임포터가 막으려던 바로 그 상황이라
 * 달력에 실제로 있는 날인지까지 여기서 확인한다.
 */
function dateOf(raw: string): string | null {
  const v = raw.trim().replace(/[./]/g, '-')
  if (!v) return ''
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const iso = `${m[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // UTC로 되짚어 같은 날이 나오는지 본다(2월 30일은 3월 2일로 굴러가므로 어긋난다).
  const parsed = new Date(`${iso}T00:00:00Z`)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }
  return iso
}

/** 금액·연도는 콤마와 단위 표기를 걷어내고 숫자로 읽는다. */
function numberOf(raw: string): number | null | '' {
  const v = raw.trim().replace(/[,\s원]/g, '')
  if (!v) return ''
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 다중 태그 열 구분자 — 콤마는 CSV 구분자와 겹쳐 따옴표가 필요하므로 세미콜론·슬래시도 받는다. */
function splitTags(raw: string): string[] {
  return raw
    .split(/[,;/|]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** 템플릿 CSV(헤더 + 예시 한 줄). 예시가 없는 열은 빈 칸으로 둔다. */
export function buildTemplateCsv(spec: BulkImportSpec): string {
  const headers = spec.fields.map((f) => f.header)
  const example = spec.fields.map((f) => {
    const v = f.example ?? ''
    // 예시에 콤마가 있으면 CSV가 열을 잘못 나눈다.
    return v.includes(',') ? `"${v}"` : v
  })
  return [headers.join(','), example.join(',')].join('\n')
}

/**
 * CSV 텍스트 → 저장 입력. 문제가 있는 줄만 errors로 빠지고 나머지는 rows에 남지만,
 * 실제 저장은 오류가 하나도 없을 때만 하도록 호출부(BulkImportPage)가 잠근다 —
 * 절반만 들어간 원장을 정리하는 일이 파일을 고쳐 다시 올리는 일보다 훨씬 번거롭다.
 *
 * `tags`는 태그 열 검증에 쓰는 원장 스냅숏이다. 비어 있으면 그 열은 검증 없이 통과하므로,
 * 화면은 태그를 다 읽은 뒤에 파싱한다.
 */
export function parseBulkCsv(
  text: string,
  spec: BulkImportSpec,
  tags: BulkTagLookup = {},
): BulkParseResult {
  const table = parseCsvTable(text)
  const empty: BulkParseResult = { rows: [], preview: [], errors: [] }
  // 아직 아무것도 올리지 않은 상태 — 오류로 다루면 화면을 열기만 해도 빨간 글씨가 뜬다.
  if (!table.headers.length) return empty

  // 파일의 각 열이 명세의 어느 필드인지 찾는다(헤더명 또는 별칭 일치).
  const fieldByColumnIndex = table.headers.map((h) => {
    const key = normalizeHeader(h)
    return (
      spec.fields.find(
        (f) =>
          normalizeHeader(f.header) === key ||
          (f.aliases ?? []).some((a) => normalizeHeader(a) === key),
      ) ?? null
    )
  })

  const requiredMissing = spec.fields
    .filter((f) => f.required && !fieldByColumnIndex.includes(f))
    .map((f) => f.header)
  if (requiredMissing.length > 0) {
    return {
      ...empty,
      errors: [
        {
          line: 1,
          message: `헤더에 ${requiredMissing.join('·')} 열이 필요합니다. 템플릿을 내려받아 쓰세요.`,
        },
      ],
    }
  }

  /** 태그 원장에 등록된 이름인지(대소문자·공백 무시). 원장을 못 읽었으면 검증하지 않는다. */
  const knownTag = (field: BulkField, value: string): string | null => {
    const known = tags[field.tagTable ?? '']
    if (!known || known.length === 0) return value
    return known.find((n) => normalizeHeader(n) === normalizeHeader(value)) ?? null
  }

  const rows: Record<string, unknown>[] = []
  const preview: BulkParseResult['preview'] = []
  const errors: BulkRowError[] = []

  for (const { line, cells } of table.rows) {
    const cellOf = (field: BulkField) => {
      const idx = fieldByColumnIndex.indexOf(field)
      return idx >= 0 ? (cells[idx] ?? '').trim() : ''
    }

    const payload: Record<string, unknown> = { ...spec.fixedValues }
    let rowError: BulkRowError | null = null

    for (const field of spec.fields) {
      const raw = cellOf(field)
      if (field.required && !raw) {
        rowError = { line, message: `${field.header}은(는) 비워 둘 수 없습니다.` }
        break
      }
      // 빈 칸은 컬럼을 아예 넣지 않는다 — DB 기본값이 그대로 살아야 한다.
      if (!raw) continue

      if (field.kind === 'enum') {
        const code = codeOf(raw, field.labels ?? {})
        if (code === null) {
          const allowed = Object.values(field.labels ?? {}).join('/')
          rowError = { line, message: `${field.header} '${raw}'을(를) 알 수 없습니다(${allowed}).` }
          break
        }
        setColumn(payload, field.column, code)
        continue
      }
      if (field.kind === 'tag') {
        const name = knownTag(field, raw)
        if (name === null) {
          rowError = {
            line,
            message: `${field.header} '${raw}'은(는) 등록된 항목이 아닙니다. ADMIN 태그 관리에 먼저 추가하세요.`,
          }
          break
        }
        setColumn(payload, field.column, name)
        continue
      }
      if (field.kind === 'tags') {
        const names = splitTags(raw)
        if (field.max && names.length > field.max) {
          rowError = { line, message: `${field.header}은(는) 최대 ${field.max}개까지 적을 수 있습니다.` }
          break
        }
        const resolved = names.map((n) => knownTag(field, n))
        const unknownAt = resolved.indexOf(null)
        if (unknownAt >= 0) {
          rowError = {
            line,
            message: `${field.header} '${names[unknownAt]}'은(는) 등록된 항목이 아닙니다. ADMIN 태그 관리에 먼저 추가하세요.`,
          }
          break
        }
        const list = resolved as string[]
        setColumn(payload, field.column, list)
        // 대표값 미러(하위 호환 스칼라). 목록·필터는 배열을 읽지만 옛 화면이 스칼라를 본다.
        if (field.mirrorColumn) setColumn(payload, field.mirrorColumn, list[0] ?? null)
        continue
      }
      if (field.kind === 'date') {
        const d = dateOf(raw)
        if (d === null) {
          rowError = {
            line,
            message: `${field.header} '${raw}'은(는) 날짜가 아닙니다. YYYY-MM-DD 형식으로 적으세요.`,
          }
          break
        }
        setColumn(payload, field.column, d)
        continue
      }
      if (field.kind === 'number') {
        const n = numberOf(raw)
        if (n === null) {
          rowError = { line, message: `${field.header} '${raw}'을(를) 숫자로 읽을 수 없습니다.` }
          break
        }
        setColumn(payload, field.column, n)
        continue
      }
      if (field.kind === 'phone') {
        // 연락처는 숫자만 저장한다(NETWORKS·STARTUP 폼과 같은 규칙 — 표기 차이로 중복 판정이 갈린다).
        const digits = raw.replace(/\D/g, '')
        if (!digits) {
          rowError = { line, message: `${field.header} '${raw}'에 숫자가 없습니다.` }
          break
        }
        setColumn(payload, field.column, digits)
        continue
      }
      setColumn(payload, field.column, raw)
    }

    preview.push({ line, cells: spec.fields.map((f) => cellOf(f)) })
    if (rowError) {
      errors.push(rowError)
      continue
    }
    rows.push(payload)
  }

  return { rows, preview, errors }
}
