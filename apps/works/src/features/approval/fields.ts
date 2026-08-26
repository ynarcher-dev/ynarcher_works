/**
 * 양식 필드 스키마 — 전자결재의 중심 모델.
 *
 * 양식은 HTML 한 덩어리가 아니라 **타입 있는 필드 정의 목록**이고, 문서는 그 필드의 값이다.
 * 화면의 결재 문서 표는 스키마+값을 렌더러가 그린 결과일 뿐이며, 값이 타입을 갖기 때문에
 * "이번 달 프로젝트별 지출 합계" 같은 집계가 사람 손이 아니라 쿼리로 나온다.
 *
 * 이 파일은 순수 계층이다(React·DB 의존 없음). 저장 형태의 정본은 DB 주석
 * (approval_form_versions.fields)이며, 대표 금액 해석은 서버 app.approval_primary_amount()와
 * 같은 규칙을 따른다 — 여기의 계산은 저장 전 화면 미리보기용이고 최종 판정은 언제나 DB다.
 */

export type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'RICHTEXT'
  | 'NUMBER'
  | 'MONEY'
  | 'DATE'
  | 'SELECT'
  | 'TABLE'

/** 표(TABLE) 한 열의 정의. 열도 필드와 같은 타입 축을 쓰되 TABLE 중첩은 허용하지 않는다. */
export interface FormColumn {
  key: string
  label: string
  type: Exclude<FieldType, 'TABLE' | 'RICHTEXT' | 'TEXTAREA'>
  options?: string[]
  /** 이 열의 합계가 문서 대표 금액(amount)이 된다. 양식당 한 곳만 지정한다. */
  primaryAmount?: boolean
  /** 열 폭 힌트(표 안에서만 의미). */
  wide?: boolean
}

export interface FormField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** SELECT 선택지. */
  options?: string[]
  /** 이 값이 문서 대표 금액(amount)이 된다(MONEY·NUMBER 한정). */
  primaryAmount?: boolean
  /** TABLE 열 정의. */
  columns?: FormColumn[]
  /** 입력 도움말(폼에서만 보인다). */
  help?: string
}

/** 표 한 행 — 열 key → 값. */
export type TableRow = Record<string, string>

/** 필드 값 묶음(문서의 field_values). 스칼라는 문자열, TABLE은 행 배열. */
export type FieldValues = Record<string, string | TableRow[]>

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: '한 줄 글',
  TEXTAREA: '여러 줄 글',
  RICHTEXT: '서식 있는 본문',
  NUMBER: '숫자',
  MONEY: '금액',
  DATE: '날짜',
  SELECT: '선택',
  TABLE: '표',
}

/** 표 열에 쓸 수 있는 타입(중첩 표·본문은 제외). */
export const COLUMN_TYPES: FormColumn['type'][] = ['TEXT', 'NUMBER', 'MONEY', 'DATE', 'SELECT']

/** 대표 금액을 지정할 수 있는 타입. */
export function canBePrimaryAmount(type: FieldType): boolean {
  return type === 'MONEY' || type === 'NUMBER'
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function parseColumn(raw: unknown): FormColumn | null {
  if (!isRecord(raw)) return null
  const key = str(raw.key)
  const type = str(raw.type) as FormColumn['type']
  if (!key || !COLUMN_TYPES.includes(type)) return null
  return {
    key,
    label: str(raw.label) || key,
    type,
    options: Array.isArray(raw.options) ? raw.options.map(str).filter(Boolean) : undefined,
    primaryAmount: raw.primaryAmount === true,
    wide: raw.wide === true,
  }
}

/**
 * 저장된 스키마(jsonb)를 읽어들인다. 알 수 없는 타입·키 없는 원소는 조용히 버린다 —
 * 스키마가 조금 어긋났다고 문서 전체를 못 열게 만들면 과거 문서가 인질이 된다.
 */
export function parseFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return []
  const out: FormField[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const key = str(item.key)
    const type = str(item.type) as FieldType
    if (!key || !(type in FIELD_TYPE_LABEL)) continue
    out.push({
      key,
      label: str(item.label) || key,
      type,
      required: item.required === true,
      options: Array.isArray(item.options) ? item.options.map(str).filter(Boolean) : undefined,
      primaryAmount: item.primaryAmount === true,
      columns:
        type === 'TABLE' && Array.isArray(item.columns)
          ? item.columns.map(parseColumn).filter((c): c is FormColumn => c !== null)
          : undefined,
      help: str(item.help) || undefined,
    })
  }
  return out
}

/** 값 묶음에서 스칼라 값을 안전하게 꺼낸다. */
export function scalarValue(values: FieldValues, key: string): string {
  const v = values[key]
  return typeof v === 'string' ? v : ''
}

/** 값 묶음에서 표 행을 안전하게 꺼낸다. */
export function tableRows(values: FieldValues, key: string): TableRow[] {
  const v = values[key]
  return Array.isArray(v) ? v : []
}

/** 빈 문서의 초기값(표는 빈 행 하나로 시작해 입력할 자리를 보인다). */
export function emptyValues(fields: FormField[]): FieldValues {
  const out: FieldValues = {}
  for (const f of fields) {
    if (f.type === 'TABLE') out[f.key] = [emptyRow(f)]
    else out[f.key] = ''
  }
  return out
}

export function emptyRow(field: FormField): TableRow {
  const row: TableRow = {}
  for (const c of field.columns ?? []) row[c.key] = ''
  return row
}

/** 숫자 해석 — 천단위 쉼표·공백을 걷어낸다. 해석 불가는 null(합계에서 제외). */
export function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** 표의 한 열 합계. 숫자로 읽히지 않는 칸은 0으로 세지 않고 건너뛴다. */
export function columnSum(rows: TableRow[], columnKey: string): number {
  let sum = 0
  for (const row of rows) {
    const n = toNumber(row[columnKey] ?? '')
    if (n !== null) sum += n
  }
  return sum
}

/**
 * 대표 금액 — 서버 app.approval_primary_amount()와 같은 규칙.
 * primaryAmount가 붙은 첫 MONEY/NUMBER 필드 값, 또는 표의 그 열 합계.
 */
export function primaryAmount(fields: FormField[], values: FieldValues): number | null {
  for (const f of fields) {
    if (canBePrimaryAmount(f.type) && f.primaryAmount) {
      return toNumber(scalarValue(values, f.key))
    }
    if (f.type === 'TABLE') {
      const col = (f.columns ?? []).find((c) => c.primaryAmount)
      if (col) return columnSum(tableRows(values, f.key), col.key)
    }
  }
  return null
}

/** 금액 표기(원). 값이 없으면 '-'. */
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  return `${n.toLocaleString('ko-KR')}원`
}

/** 표시용 값 문자열 — 상세·집계에서 타입에 맞는 표기로 편다. */
export function displayValue(field: FormField, values: FieldValues): string {
  const raw = scalarValue(values, field.key)
  if (!raw) return '-'
  if (field.type === 'MONEY') return formatMoney(toNumber(raw))
  if (field.type === 'NUMBER') {
    const n = toNumber(raw)
    return n === null ? raw : n.toLocaleString('ko-KR')
  }
  return raw
}

/**
 * 필수값 검증 — 채워지지 않은 필드 라벨 목록을 돌려준다.
 * 표는 "행이 하나도 없거나 모든 행이 비어 있으면" 미입력으로 본다.
 */
export function missingRequired(fields: FormField[], values: FieldValues): string[] {
  const missing: string[] = []
  for (const f of fields) {
    if (!f.required) continue
    if (f.type === 'TABLE') {
      const rows = tableRows(values, f.key)
      const filled = rows.some((r) => Object.values(r).some((v) => v.trim() !== ''))
      if (!filled) missing.push(f.label)
      continue
    }
    if (f.type === 'RICHTEXT') {
      // 빈 에디터는 <p></p> 같은 빈 태그를 남긴다 — 태그를 걷어낸 뒤 판단한다.
      if (!scalarValue(values, f.key).replace(/<[^>]*>/g, '').trim()) missing.push(f.label)
      continue
    }
    if (!scalarValue(values, f.key).trim()) missing.push(f.label)
  }
  return missing
}

/** 저장 직전 정리 — 완전히 빈 표 행은 떨어낸다(빈 행이 집계에 섞이지 않게). */
export function pruneValues(fields: FormField[], values: FieldValues): FieldValues {
  const out: FieldValues = {}
  for (const f of fields) {
    if (f.type === 'TABLE') {
      out[f.key] = tableRows(values, f.key).filter((r) =>
        Object.values(r).some((v) => v.trim() !== ''),
      )
    } else {
      out[f.key] = scalarValue(values, f.key)
    }
  }
  return out
}

/** 양식 빌더가 만든 스키마의 자체 검사 — 저장 전에 사람이 고칠 수 있게 사유를 돌려준다. */
export function validateSchema(fields: FormField[]): string[] {
  const errors: string[] = []
  if (fields.length === 0) errors.push('필드를 하나 이상 추가하세요.')

  const seen = new Set<string>()
  for (const f of fields) {
    if (!f.key.trim()) errors.push('키가 비어 있는 필드가 있습니다.')
    else if (seen.has(f.key)) errors.push(`필드 키가 중복됩니다: ${f.key}`)
    seen.add(f.key)
    if (!f.label.trim()) errors.push(`라벨이 비어 있는 필드가 있습니다: ${f.key}`)
    if (f.type === 'SELECT' && !(f.options ?? []).length)
      errors.push(`선택 필드에 선택지가 없습니다: ${f.label}`)
    if (f.type === 'TABLE') {
      if (!(f.columns ?? []).length) errors.push(`표에 열이 없습니다: ${f.label}`)
      const colKeys = new Set<string>()
      for (const c of f.columns ?? []) {
        if (!c.key.trim()) errors.push(`키가 비어 있는 열이 있습니다: ${f.label}`)
        else if (colKeys.has(c.key)) errors.push(`열 키가 중복됩니다: ${f.label} > ${c.key}`)
        colKeys.add(c.key)
      }
    }
  }

  // 대표 금액은 한 곳만 — 여럿이면 어느 값이 문서 금액인지 화면과 DB가 갈릴 수 있다.
  const marks = countPrimaryAmount(fields)
  if (marks > 1) errors.push('대표 금액은 한 곳만 지정할 수 있습니다.')

  return errors
}

export function countPrimaryAmount(fields: FormField[]): number {
  let n = 0
  for (const f of fields) {
    if (canBePrimaryAmount(f.type) && f.primaryAmount) n += 1
    n += (f.columns ?? []).filter((c) => c.primaryAmount).length
  }
  return n
}

/** 스키마에서 대표 금액이 걸린 자리의 라벨(집계 화면의 열 이름). 없으면 null. */
export function primaryAmountLabel(fields: FormField[]): string | null {
  for (const f of fields) {
    if (canBePrimaryAmount(f.type) && f.primaryAmount) return f.label
    const col = (f.columns ?? []).find((c) => c.primaryAmount)
    if (col) return `${f.label} > ${col.label}`
  }
  return null
}
