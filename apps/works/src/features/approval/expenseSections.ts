/**
 * 결재 문서의 본문을 카드 묶음으로 가르는 순수 판정.
 *
 * 지출을 다루는 문서는 한 카드에 담기에는 성격이 다른 것을 한꺼번에 묻는다 — 무엇을 왜 쓰는가
 * (본문), 무엇에 얼마를 썼는가(지출 내역), 그 돈을 누구에게 보내는가(송금 요청). 앞의 둘은
 * 결재자가 판단하는 근거이고 마지막 하나는 승인 뒤 경영지원이 실행하는 지시라, 한 상자 안에
 * 세로로 이으면 읽는 사람이 어디서 판단이 끝나고 어디서 실행이 시작되는지 알 수 없다.
 *
 * **어느 양식인지는 묻지 않는다.** 가르는 근거는 양식의 이름이나 약칭이 아니라 그 표가 무엇을
 * 담는가이므로(예산 줄을 고르면 지출 내역, 거래처를 고르면 송금 요청), 같은 표를 가진 양식은
 * 표준 지출결의서든 법인카드·인건비 지출결의서든 ADMIN이 새로 세운 양식이든 같은 자리에 같은
 * 모양으로 선다. 약칭으로 한 양식만 골라 두면 같은 표가 양식에 따라 다르게 서서, 쓰는 사람이
 * 어느 화면에서 무엇을 기대할지 알 수 없다.
 *
 * 화면이 아니라 여기서 가르는 이유는 **같은 판정이 기안 화면과 상세 화면 두 곳에 필요하기**
 * 때문이다. 두 화면이 각자 `field.key === 'expense_items'`를 적으면 한쪽만 고쳐지는 날이 오고,
 * 그때 같은 문서가 쓸 때와 읽을 때 다른 모양으로 선다.
 *
 * 이 모듈은 React·DB 의존이 없다(fields.ts와 같은 순수 계층).
 */
import {
  amountKeys,
  columnSum,
  hasColumnValue,
  tableRows,
  type FieldValues,
  type FormColumn,
  type FormField,
} from '@/features/approval/fields'

/**
 * 하이웍스 복원 양식의 보안 등급 표식 — 이 배치에서 빠지는 유일한 양식이다.
 *
 * 복원 문서의 본문은 복원 당시 모양 그대로 읽혀야 한다. 약칭이 아니라 보안 등급으로 고르는
 * 것은 마이그레이션(양식 카탈로그·공문 템플릿)이 쓰는 것과 **같은 문장을 화면도 쓰기**
 * 위해서다 — 서버가 건드리지 않기로 한 양식을 화면만 특별 취급하면 두 규칙이 갈린다.
 */
export const HIWORKS_SECURITY_GRADE = '하이웍스 원본'

/** 지출 내역 표 필드의 key(양식 시드가 정한 값). */
export const EXPENSE_ITEMS_KEY = 'expense_items'

/** 송금 요청 표 필드의 key(양식 시드가 정한 값). */
export const REMITTANCES_KEY = 'remittances'

/** 카드 제목의 기본값 — 양식에서 라벨을 지운 경우에만 쓰인다. */
export const EXPENSE_SECTION_FALLBACK_TITLE: Record<string, string> = {
  [EXPENSE_ITEMS_KEY]: '지출 내역',
  [REMITTANCES_KEY]: '송금 요청',
}

/**
 * 카드 분리 여부를 가리는 데 필요한 양식 한 칸.
 *
 * 양식 원장 행 전체가 아니라 한 칸만 받는다 — 목록·기안(`ApprovalForm`)과 상세(`ApprovalDetail.
 * form`)의 형태가 서로 달라서, 어느 한쪽 타입에 묶으면 다른 쪽이 쓰지도 않는 열을 채워야 한다.
 */
export interface SectionFormIdentity {
  security_grade?: string | null
}

/**
 * 이 양식의 본문을 구조로 갈라도 되는가 — **복원 문서만 아니면 가른다.**
 *
 * 실제로 카드가 서는지는 여기가 아니라 `splitExpenseSections`가 답한다(가를 표가 없으면 카드도
 * 서지 않는다). 그래서 이 판정이 묻는 것은 양식의 종류가 아니라 "이 문서를 지금 규칙으로 그려도
 * 되는가" 하나뿐이다.
 *
 * 약칭(`abbrev`)·이름(`name`)·분류(`category`)로 고르지 않는다. 약칭으로 고르면 같은 표를 가진
 * 다른 지출결의서가 이유 없이 다른 모양으로 서고, 이름과 분류는 ADMIN이 고치는 값이라 고치는
 * 순간 화면 배치가 함께 달라진다.
 */
export function usesSectionCards(form: SectionFormIdentity | null | undefined): boolean {
  return form?.security_grade !== HIWORKS_SECURITY_GRADE
}

/** 세 묶음으로 가른 결과. 두 표는 양식에서 빠져 있을 수 있어 null이 될 수 있다. */
export interface ExpenseSectionSplit {
  /** 지출결의서 카드에 서는 나머지 필드 — 순서는 양식이 정한 그대로다. */
  body: FormField[]
  /** 지출 내역 표. 양식에 없으면 null이며, 그때 그 카드는 서지 않는다. */
  expenseItems: FormField | null
  /** 송금 요청 표. 양식에 없으면 null이며, 그때 그 카드는 서지 않는다. */
  remittances: FormField | null
}

/**
 * 본문 필드 목록을 세 묶음으로 가른다.
 *
 * **key가 먼저, 없으면 열이 답한다.** 시드가 만든 양식은 `expense_items`·`remittances`라는
 * key를 그대로 들고 있어 그것이 가장 싼 답이다. 그러나 ADMIN이 양식 빌더에서 같은 블록을
 * 새로 세우면 key는 `field3`처럼 새로 나고(값이 저장되는 자리라 이름을 물려줄 수 없다),
 * key만 보면 그 표가 본문 카드 안에 끼어 서서 송금 요청만 카드가 되는 어긋난 화면이 된다.
 * 그래서 두 번째 잣대로 **그 표가 가진 열**을 본다 — 예산 줄이 있으면 지출 내역, 거래처가
 * 있으면 송금 요청이다. 서버 `app.approval_spend_item_amounts`가 지출을 찾는 규칙과 같고,
 * 양식 빌더의 블록 판정(`fieldChoiceOf`)과도 같은 문장이다.
 *
 * 라벨로는 가르지 않는다 — ADMIN이 고칠 수 있는 값이라 이름을 고치는 순간 화면이 달라진다.
 *
 * 없는 칸은 없는 대로 둔다(빈 카드를 세우지 않는다). 지출 내역만 있고 송금 요청이 없는 버전으로
 * 만든 옛 문서도 그대로 읽혀야 하기 때문이다 — 문서는 저장된 버전의 스키마로 렌더된다.
 *
 * 같은 key가 두 번 있는 스키마(ADMIN 실수)에서는 **앞의 것만** 표로 가르고 뒤의 것은 본문에
 * 남긴다. 둘 다 표 카드로 세우면 같은 제목의 카드가 두 번 서서 어느 쪽에 적어야 하는지 답할 수
 * 없고, 조용히 버리면 적은 값이 화면에서 사라진다.
 */
/** 이 표가 그 열을 가졌는가. 표가 아닌 필드는 언제나 아니다. */
function hasColumn(field: FormField, type: FormColumn['type']): boolean {
  return field.type === 'TABLE' && (field.columns ?? []).some((column) => column.type === type)
}

/**
 * 송금 요청 표인가 — 거래처를 먼저 본다.
 * 송금 요청 표에 예산 줄을 더한 양식이 있을 수 있는데, 그 표의 성격을 정하는 것은 돈이 나가는
 * 상대다(지출 내역보다 먼저 판정해야 그 표가 두 자리에 걸치지 않는다).
 */
function isRemittanceTable(field: FormField): boolean {
  return field.key === REMITTANCES_KEY || hasColumn(field, 'PARTNER_REF')
}

/** 지출 내역 표인가 — 예산 줄을 고르는 표다. */
function isExpenseItemsTable(field: FormField): boolean {
  return field.key === EXPENSE_ITEMS_KEY || hasColumn(field, 'BUDGET_REF')
}

export function splitExpenseSections(fields: FormField[]): ExpenseSectionSplit {
  let expenseItems: FormField | null = null
  let remittances: FormField | null = null
  const body: FormField[] = []

  for (const field of fields) {
    if (!remittances && isRemittanceTable(field)) {
      remittances = field
      continue
    }
    if (!expenseItems && isExpenseItemsTable(field)) {
      expenseItems = field
      continue
    }
    body.push(field)
  }

  return { body, expenseItems, remittances }
}

/**
 * 표 카드로 서는 필드들 — **세우는 순서대로**, 양식에 없는 것은 빠진다.
 *
 * 순서를 화면이 아니라 여기서 정하는 이유는 그것이 문서를 읽는 순서이기 때문이다. 무엇에
 * 얼마를 썼는지(지출 내역)를 먼저 보고, 그 돈을 누구에게 보내는지(송금 요청)가 뒤따른다 —
 * 두 화면이 각자 배열을 적으면 쓸 때와 읽을 때 순서가 갈릴 수 있다.
 */
export function expenseTableSections(split: ExpenseSectionSplit): FormField[] {
  return [split.expenseItems, split.remittances].filter(
    (field): field is FormField => field !== null,
  )
}

/**
 * 한 표의 합계액 — 그 표가 "얼마"라고 말하는 값과, 그 말을 하기는 했는가.
 *
 * 어느 열이 합계액인지는 `amountKeys`가 답한다(역할 GROSS → 대표 금액 → 첫 금액 열). 부가세를
 * 쪼개 적는 표에서 공급가액을 더하면 두 표가 애초에 다른 것을 견주게 된다.
 */
function tableGrossTotal(
  field: FormField | null,
  values: FieldValues,
): { sum: number; filled: boolean } | null {
  if (!field) return null
  const keys = amountKeys(field)
  if (!keys) return null
  const rows = tableRows(values, field.key)
  return { sum: columnSum(rows, keys.grossKey), filled: hasColumnValue(rows, keys.grossKey) }
}

/**
 * 지출 내역과 송금 요청이 **같은 돈을 말하는가.** 견줄 수 없으면 null이다.
 *
 * 맞아야 하는 이유는 둘이 한 지출의 앞뒤이기 때문이다 — 앞은 무엇에 얼마를 썼는가이고 뒤는 그
 * 돈을 누구에게 보내는가라, 합이 다르면 한 문서가 자기 금액을 두 번 다르게 말하는 셈이 된다.
 *
 * 그래도 **막지는 않는다.** 선지급·분할 송금처럼 사람이 알고 어긋내는 경우가 있고 그 판단은
 * 결재자의 몫이다(예산 초과를 막지 않는 것과 같은 원칙). 화면은 어긋났다는 사실만 색으로 말한다.
 *
 * 양쪽 다 한 칸도 적히지 않았으면 견주지 않는다 — 빈 문서를 열자마자 '맞음'이 서면 그 색은
 * 맞았다는 뜻이 아니라 아직 아무것도 없다는 뜻이 되어, 정작 맞았을 때의 신호가 죽는다.
 */
export function expenseTotalsAgree(
  split: ExpenseSectionSplit,
  values: FieldValues,
): boolean | null {
  const items = tableGrossTotal(split.expenseItems, values)
  const remittances = tableGrossTotal(split.remittances, values)
  if (!items || !remittances) return null
  if (!items.filled && !remittances.filled) return null
  return items.sum === remittances.sum
}

/**
 * 표 카드의 제목 — 라벨이 곧 제목이다.
 *
 * 카드 제목이 필드 이름을 대신하므로(`ApprovalFieldsView`의 `hideSectionLabels`와 같은 규약)
 * 이름의 정본은 여전히 양식이다. 다만 라벨을 비워 둔 양식에서는 제목 없는 카드가 서므로,
 * 그때만 시드가 정한 이름으로 되돌아간다.
 */
export function expenseSectionTitle(field: FormField): string {
  const label = field.label.trim()
  if (label) return label
  return EXPENSE_SECTION_FALLBACK_TITLE[field.key] ?? ''
}

/** 본문 카드의 제목 줄 — 제목과, 있으면 그 아래 부제. */
export interface ApprovalBodyCardHeading {
  title: string
  /** `Card`의 `subtitle`(제목 하단 보조 **값**). 제목이 이미 그 값이면 비운다. */
  subtitle?: string
}

/**
 * 본문 카드의 제목 줄을 정한다.
 *
 * **카드가 여럿 설 때만 제목 자리에 양식 이름이 선다**(`지출결의서`, `법인카드 지출결의서`).
 * 카드들이 나란히 설 때 그것들은 한 장의 서식이므로 머리글도 서식의 절 이름(지출결의서 ·
 * 지출 내역 · 송금 요청)으로 읽혀야 한다 — 첫 칸만 문서 제목이면 같은 층에 성격이 다른 이름이
 * 섞이고, 기안 화면(양식 이름이 제목인 카드)과도 어긋난다.
 *
 * 그래서 묻는 것은 "어느 양식인가"가 아니라 **"카드가 갈렸는가"**다. 표가 없어 카드가 하나뿐인
 * 양식(휴가·일반결재)에서 양식 이름을 올리면, 홀로 선 카드의 제목이 문서가 아니라 서식을
 * 가리키게 되어 문서 제목이 부제로 밀려난다.
 *
 * 그러면서 **문서 제목을 화면에서 잃지 않는다.** 상세에서 문서 제목이 서는 자리는 이 카드
 * 제목뿐이므로(표준 머리표는 종류·번호·부서·금액만 든다), 제목 자리를 내주는 만큼 부제가 그
 * 값을 받는다. `Card`의 `subtitle`은 설명이 아니라 "이 카드가 지금 무엇을 보고 있는가"라는
 * **값**의 자리라, 문서 제목이 그 정의에 그대로 든다(설명이라면 `help`로 가야 한다).
 *
 * 카드가 하나뿐인 문서와 하이웍스 복원 문서는 지금까지와 같다 — 문서 제목이 곧 카드 제목이고
 * 부제는 없다.
 *
 * 양식 이름이 비어 있으면(ADMIN이 지운 경우) 제목 없는 카드를 세우지 않고 문서 제목으로
 * 되돌아간다. 둘이 같은 문구일 때 부제를 비우는 것도 같은 이유다 — 한 카드에서 같은 말이 두
 * 줄로 서면 그 둘이 서로 다른 것을 가리키는 것처럼 읽힌다.
 */
export function approvalBodyCardHeading(input: {
  /** 본문이 표 카드와 함께 여러 카드로 갈렸는가(`expenseTableSections(...).length > 0`). */
  sectioned: boolean
  /** 화면에 세울 양식 이름 — 하이웍스 접미어를 이미 걷어낸 값을 받는다. */
  formName?: string | null
  documentTitle: string
}): ApprovalBodyCardHeading {
  if (!input.sectioned) return { title: input.documentTitle }

  const formName = (input.formName ?? '').trim()
  if (!formName) return { title: input.documentTitle }

  const documentTitle = input.documentTitle.trim()
  return {
    title: formName,
    subtitle: documentTitle && documentTitle !== formName ? input.documentTitle : undefined,
  }
}
