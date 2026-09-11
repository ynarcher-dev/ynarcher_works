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
import {
  DEFAULT_BUDGET_LEVELS,
  budgetTotal,
  parseBudget,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import { emptyBudget } from '@/features/approval/budgetEdit'
import { formatMoney, toNumber } from '@/features/approval/numeric'

// 수치 해석·표기는 numeric.ts가 소유한다. 여기서 다시 내보내는 것은 이 모듈을 통해 읽던
// 화면들이 계속 그대로 동작하게 하기 위해서다(규칙은 한 곳에만 있다).
export { formatMoney, formatRate, toNumber } from '@/features/approval/numeric'
export type { BudgetRow, BudgetTreeValue } from '@/features/approval/budget'

export type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'RICHTEXT'
  | 'HTML_TEMPLATE'
  | 'NUMBER'
  | 'MONEY'
  | 'DATE'
  | 'SELECT'
  | 'TABLE'
  | 'BUDGET_TREE'

/**
 * 표 한 열의 종류.
 *
 * 필드 종류와 대부분 겹치지만 **같은 축이 아니다** — 표 안에만 있는 종류(예산 줄·거래처)가
 * 있고, 필드에만 있는 종류(본문·표·예산표)가 있다. 한 목록으로 두면 양식 빌더의 열 선택에
 * '표 안의 표'처럼 고를 수 없는 값이 서고, 고를 수 있다고 말하는 선택지가 곧 오선택의 자리다.
 */
export type ColumnType =
  | 'TEXT'
  | 'NUMBER'
  | 'MONEY'
  | 'DATE'
  | 'SELECT'
  /** 근거 품의의 예산 줄을 가리킨다 — 이 줄에서 쓰는 돈이라는 뜻이다. */
  | 'BUDGET_REF'
  /** 거래처 원장의 행을 가리킨다 — 은행·계좌·예금주가 그 행에서 따라온다. */
  | 'PARTNER_REF'

/** 표(TABLE) 한 열의 정의. TABLE 중첩은 허용하지 않는다. */
export interface FormColumn {
  key: string
  label: string
  type: ColumnType
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
  /** TABLE·BUDGET_TREE 열 정의. */
  columns?: FormColumn[]
  /**
   * BUDGET_TREE의 층 이름 **기본값**(`['세목','비목','세세목']`).
   * 최종 값은 문서가 갖는다 — 사업마다 층 이름과 층 수가 달라 양식이 못 박으면 그 목록에
   * 없는 사업은 예산을 적을 수 없다.
   */
  levels?: string[]
  /**
   * 새 문서가 들고 시작하는 값(RICHTEXT 본문 또는 HTML_TEMPLATE 원문).
   * 옛 결재의 본문 틀(`1. 행사명 : …`)을 매번 손으로 적지 않게 한다.
   */
  defaultValue?: string
  /** HTML 원문의 이미지 src → approval-form-assets 오브젝트 경로. */
  htmlAssets?: Record<string, string>
  /** 입력 도움말(폼에서만 보인다). */
  help?: string
}

export interface HtmlTemplateValue {
  /** 양식 원문을 복사해 문서에서 직접 편집한 전체 HTML. */
  html: string
}

/** 표 한 행 — 열 key → 값. */
export type TableRow = Record<string, string>

/** 한 필드에 담기는 값. 스칼라는 문자열, TABLE은 행 배열, BUDGET_TREE는 층 있는 표. */
export type FieldValue = string | TableRow[] | BudgetTreeValue | HtmlTemplateValue

/** 필드 값 묶음(문서의 field_values). */
export type FieldValues = Record<string, FieldValue>

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  TEXT: '한 줄 글',
  TEXTAREA: '여러 줄 글',
  RICHTEXT: '서식 있는 본문',
  HTML_TEMPLATE: 'HTML 양식',
  NUMBER: '숫자',
  MONEY: '금액',
  DATE: '날짜',
  SELECT: '선택',
  TABLE: '표',
  BUDGET_TREE: '예산표',
}

/** 필드 종류. 순서가 곧 양식 빌더 선택 목록의 순서다. */
export const FIELD_TYPES: FieldType[] = [
  'TEXT',
  'TEXTAREA',
  'RICHTEXT',
  'HTML_TEMPLATE',
  'NUMBER',
  'MONEY',
  'DATE',
  'SELECT',
  'TABLE',
  'BUDGET_TREE',
]

/** 표 열에 쓸 수 있는 종류. 순서가 곧 양식 빌더 선택 목록의 순서다. */
export const COLUMN_TYPES: ColumnType[] = [
  'TEXT',
  'NUMBER',
  'MONEY',
  'DATE',
  'SELECT',
  'BUDGET_REF',
  'PARTNER_REF',
]

export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  TEXT: '한 줄 글',
  NUMBER: '숫자',
  MONEY: '금액',
  DATE: '날짜',
  SELECT: '선택',
  BUDGET_REF: '예산 줄',
  PARTNER_REF: '거래처',
}

/**
 * 수치인가 — 합계가 붙고 우측 정렬되는 자리.
 * 필드와 열을 함께 받는다: "이 값이 수치인가"는 놓이는 자리와 무관하게 같은 물음이다.
 */
export function isNumericColumn(type: FieldType | ColumnType): boolean {
  return type === 'MONEY' || type === 'NUMBER'
}

/** 대표 금액을 지정할 수 있는 타입. */
export function canBePrimaryAmount(type: FieldType | ColumnType): boolean {
  return type === 'MONEY' || type === 'NUMBER'
}

/**
 * 새 필드·열의 키. 키는 **값이 저장되는 자리**라 라벨과 분리되어야 한다 — 라벨을 고칠 때마다
 * 키가 바뀌면 이미 쌓인 문서의 값이 갈 곳을 잃는다.
 */
export function nextKey(prefix: string, taken: string[]): string {
  let n = taken.length + 1
  while (taken.includes(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

/** 표의 기본 열 — 항목과 금액 둘이면 표 하나가 성립한다. */
const DEFAULT_TABLE_COLUMNS: FormColumn[] = [
  { key: 'col1', label: '항목', type: 'TEXT' },
  { key: 'col2', label: '금액', type: 'MONEY', primaryAmount: true },
]

/**
 * 예산표의 기본 숫자 열 넷. **항목 이름 열은 두지 않는다** — 층을 이루는 왼쪽 칸이 곧 항목이라
 * 열로 두면 같은 것이 두 번 선다.
 */
const DEFAULT_BUDGET_COLUMNS: FormColumn[] = [
  { key: 'qty', label: '수량', type: 'NUMBER' },
  { key: 'unitPrice', label: '단가', type: 'MONEY' },
  { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
  { key: 'note', label: '산출내역/비고', type: 'TEXT', wide: true },
]

/**
 * 종류를 바꾼 필드.
 *
 * 종류가 바뀌면 **그 종류에서만 뜻이 있던 값이 함께 정리된다** — 금액이 아니게 된 필드에
 * '대표 금액' 표시가 남으면 그 양식의 문서 금액이 사라진 칸을 가리킨다. 반대로 표·예산표는
 * 열이 없으면 성립하지 않는 물건이라 기본 열을 들려 보낸다. 다만 **이미 짜 둔 열은 건드리지
 * 않는다** — 종류를 잘못 골랐다 되돌리는 사이에 열이 지워지면 안 된다.
 */
export function withFieldType(field: FormField, type: FieldType): FormField {
  return {
    ...field,
    type,
    primaryAmount: canBePrimaryAmount(type) ? field.primaryAmount : false,
    options: type === 'SELECT' ? field.options : undefined,
    columns:
      type === 'TABLE'
        ? (field.columns ?? DEFAULT_TABLE_COLUMNS)
        : type === 'BUDGET_TREE'
          ? (field.columns ?? DEFAULT_BUDGET_COLUMNS)
          : undefined,
    levels: type === 'BUDGET_TREE' ? (field.levels ?? DEFAULT_BUDGET_LEVELS) : undefined,
    defaultValue:
      type === 'RICHTEXT' || type === 'HTML_TEMPLATE' ? field.defaultValue : undefined,
    htmlAssets: type === 'HTML_TEMPLATE' ? field.htmlAssets : undefined,
  }
}

/**
 * 예산표에서 금액을 담는 열 — 대표 금액 표시가 붙은 열, 없으면 첫 금액 열.
 * 이 한 열이 차감·이익률·합계가 모두 보는 자리다.
 */
export function budgetAmountColumn(field: FormField): FormColumn | null {
  const columns = field.columns ?? []
  return columns.find((c) => c.primaryAmount) ?? columns.find((c) => c.type === 'MONEY') ?? null
}

/** 이 양식의 예산표 필드(있다면 하나). 품의서인지 아닌지를 이 값이 답한다. */
export function budgetField(fields: FormField[]): FormField | null {
  return fields.find((f) => f.type === 'BUDGET_TREE') ?? null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function parseHtmlAssets(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined
  const entries = Object.entries(raw).filter(
    (entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === 'string' && Boolean(entry[1]),
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function parseColumn(raw: unknown): FormColumn | null {
  if (!isRecord(raw)) return null
  const key = str(raw.key)
  const type = str(raw.type) as ColumnType
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
        (type === 'TABLE' || type === 'BUDGET_TREE') && Array.isArray(item.columns)
          ? item.columns.map(parseColumn).filter((c): c is FormColumn => c !== null)
          : undefined,
      levels:
        type === 'BUDGET_TREE' && Array.isArray(item.levels)
          ? item.levels.map(str).filter(Boolean)
          : undefined,
      defaultValue: str(item.defaultValue) || undefined,
      htmlAssets: type === 'HTML_TEMPLATE' ? parseHtmlAssets(item.htmlAssets) : undefined,
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

/** 값 묶음에서 예산표를 안전하게 꺼낸다. */
export function budgetValue(values: FieldValues, key: string): BudgetTreeValue {
  return parseBudget(values[key])
}

/** `{{# 이름}}` 표식을 처음 나온 차례대로, 중복 없이 찾는다. */
export function htmlTemplateTokens(html: string): string[] {
  const tokens: string[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/{{#\s*([^{}]+?)\s*}}/g)) {
    const token = match[1]?.trim()
    if (!token || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

/** HTML 원문이 참조하는 이미지 주소. 상대 경로도 남겨 ADMIN이 우리 Storage 파일과 연결한다. */
export function htmlTemplateImageSources(html: string): string[] {
  const sources: string[] = []
  const seen = new Set<string>()
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  for (const match of html.matchAll(pattern)) {
    const source = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (!source || seen.has(source) || /^data:image\//i.test(source)) continue
    seen.add(source)
    sources.push(source)
  }
  return sources
}

const SYSTEM_HTML_TOKENS = new Set(['문서 번호', '문서번호', '문서 제목', '문서제목'])

export function isSystemHtmlToken(token: string): boolean {
  return SYSTEM_HTML_TOKENS.has(token.trim())
}

/** HTML 양식 값은 과거·잘못된 JSON이 와도 문자열 원문 하나로 읽는다. */
export function htmlTemplateValue(values: FieldValues, key: string): HtmlTemplateValue {
  const value = values[key]
  if (!isRecord(value)) return { html: '' }
  return { html: str(value.html) }
}

/** 에디터가 남기는 빈 태그·공백 엔티티는 비어 있고, 이미지 한 장만 있는 본문은 내용이다. */
export function hasRichTextContent(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .trim()
  return text.length > 0 || /<img\b/i.test(html)
}

/**
 * 빈 문서의 초기값(표는 빈 행 하나로 시작해 입력할 자리를 보인다).
 * 본문에 기본 문구가 정의된 양식은 그 문구를 들고 시작한다.
 */
export function emptyValues(fields: FormField[]): FieldValues {
  const out: FieldValues = {}
  for (const f of fields) {
    if (f.type === 'TABLE') out[f.key] = [emptyRow(f)]
    else if (f.type === 'BUDGET_TREE') out[f.key] = emptyBudgetValue(f)
    else if (f.type === 'HTML_TEMPLATE') {
      out[f.key] = { html: f.defaultValue ?? '' }
    }
    else out[f.key] = f.defaultValue ?? ''
  }
  return out
}

/** 양식이 정한 층 이름을 들고 맨 위층 한 줄로 시작하는 예산표(무엇을 적는 자리인지 보이도록). */
export function emptyBudgetValue(field: FormField): BudgetTreeValue {
  return emptyBudget(field.levels ?? [])
}

export function emptyRow(field: FormField): TableRow {
  const row: TableRow = {}
  for (const c of field.columns ?? []) row[c.key] = ''
  return row
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
    // 예산표의 대표 금액은 맨 아래 줄들의 합이다 — 위층은 그 합의 표시라 함께 세면 두 번 센다.
    if (f.type === 'BUDGET_TREE') {
      const col = budgetAmountColumn(f)
      if (col?.primaryAmount) return budgetTotal(budgetValue(values, f.key).rows, col.key)
    }
    if (f.type === 'TABLE') {
      const col = (f.columns ?? []).find((c) => c.primaryAmount)
      if (col) return columnSum(tableRows(values, f.key), col.key)
    }
  }
  return null
}

/** 표시용 값 문자열 — 상세·집계에서 타입에 맞는 표기로 편다. */
export function displayValue(field: FormField, values: FieldValues): string {
  if (field.type === 'HTML_TEMPLATE') {
    return htmlTemplateValue(values, field.key).html.replace(/<[^>]*>/g, '').trim() || '-'
  }
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
    if (f.type === 'BUDGET_TREE') {
      // 이름이 적힌 줄이 하나도 없으면 아직 예산을 짜지 않은 것이다.
      if (!budgetValue(values, f.key).rows.some((r) => r.name.trim() !== '')) missing.push(f.label)
      continue
    }
    if (f.type === 'HTML_TEMPLATE') {
      if (!hasRichTextContent(htmlTemplateValue(values, f.key).html)) missing.push(f.label)
      continue
    }
    if (f.type === 'RICHTEXT') {
      // 빈 에디터는 <p></p> 같은 빈 태그를 남긴다 — 태그를 걷어낸 뒤 판단한다.
      if (!hasRichTextContent(scalarValue(values, f.key))) missing.push(f.label)
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
    } else if (f.type === 'BUDGET_TREE') {
      // **줄을 떨어내지 않는다.** 이름이 빈 줄도 아래에 자식이 딸려 있을 수 있고, 떨어내면
      // 그 자식들이 부모를 잃는다. 그리고 지출이 가리키는 자리가 저장 때마다 달라지면
      // 차감이 어느 줄의 것이었는지 되짚을 근거가 사라진다.
      out[f.key] = budgetValue(values, f.key)
    } else if (f.type === 'HTML_TEMPLATE') {
      out[f.key] = htmlTemplateValue(values, f.key)
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
    if (f.type === 'TABLE' || f.type === 'BUDGET_TREE') {
      if (!(f.columns ?? []).length) errors.push(`표에 열이 없습니다: ${f.label}`)
      const colKeys = new Set<string>()
      for (const c of f.columns ?? []) {
        if (!c.key.trim()) errors.push(`키가 비어 있는 열이 있습니다: ${f.label}`)
        else if (colKeys.has(c.key)) errors.push(`열 키가 중복됩니다: ${f.label} > ${c.key}`)
        colKeys.add(c.key)
      }
    }
    // 예산표에는 금액을 담을 자리가 반드시 있어야 한다 — 없으면 차감도 이익률도 설 곳이 없다.
    if (f.type === 'BUDGET_TREE' && !budgetAmountColumn(f))
      errors.push(`예산표에 금액 열이 없습니다: ${f.label}`)
  }

  // 예산표는 양식당 하나다. 둘이면 "이 품의의 예산"이 무엇인지 문서가 스스로 답하지 못하고,
  // 지출결의가 어느 표의 줄을 가리키는지도 갈린다.
  if (fields.filter((f) => f.type === 'BUDGET_TREE').length > 1)
    errors.push('예산표는 양식당 하나만 둘 수 있습니다.')

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
