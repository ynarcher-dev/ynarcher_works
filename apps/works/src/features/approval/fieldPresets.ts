/**
 * 양식 빌더의 **선택지** — 필드 종류 그대로이거나, 종류와 열 한 벌을 함께 세우는 블록이다.
 *
 * 종류 목록(`FIELD_TYPES`)은 저장 형태의 축이라 `표`까지만 말할 수 있다. 그런데 담당자가
 * 지출결의서를 짜며 실제로 고르는 것은 '표'가 아니라 **"예산 줄을 고르는 지출 내역"**이나
 * **"거래처로 보내는 송금 요청"**이다. 그 둘은 `표` 하나를 고른 뒤 열을 여섯 개 손으로
 * 맞춰야 나오는 물건이고, 한 열이라도 빠지면 예산이 깎이지 않거나 계좌가 따라오지 않는다.
 * 그래서 고르는 자리에서는 블록으로 말하고, 저장은 지금까지와 같이 `TABLE` + 열로 한다.
 *
 * **저장 형태를 바꾸지 않는다.** 새 `FieldType`을 만들면 DB 주석·서버 금액 판정·문서 렌더러가
 * 모두 그 값을 알아야 하고, 그 순간 "이 표가 지출 내역인가"를 답하는 곳이 두 군데가 된다
 * (이미 서버 `app.approval_spend_item_amounts`는 **예산 줄 열의 존재**로 그것을 판정한다).
 * 여기서도 같은 문장을 쓴다 — 블록의 정체는 이름표가 아니라 **그 표가 가진 열**이다.
 *
 * 이 모듈은 순수 계층이다(React·DB 의존 없음).
 */
import {
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  withFieldType,
  type FieldType,
  type FormColumn,
  type FormField,
} from '@/features/approval/fields'

/** 종류 그대로가 아닌 블록 선택지. 값은 `FieldType`과 겹치지 않는다. */
export type FieldPreset = 'EXPENSE_ITEMS' | 'REMITTANCE'

/** 양식 빌더 드롭다운의 한 값. */
export type FieldChoice = FieldType | FieldPreset

/**
 * 지출 내역 표의 열 한 벌.
 *
 * 예산 줄이 **맨 앞**인 이유는 그것이 이 표가 묻는 첫 물음이기 때문이다 — 무엇을 샀는지보다
 * 어느 예산에서 나가는지가 먼저 정해져야 금액 칸의 뜻이 선다. 부가세 열(공급가액·부가세·
 * 과세 유형)은 기본으로 세우지 않는다: 필요한 양식에서 표 설정으로 더하면 되고, 처음부터
 * 여섯 열을 세우면 한 줄짜리 지출을 적는 양식이 읽기 어려워진다.
 */
const EXPENSE_ITEM_COLUMNS: FormColumn[] = [
  { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
  { key: 'item', label: '항목', type: 'TEXT' },
  { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
]

/**
 * 송금 요청 표의 열 한 벌 — 표준 지출결의서(`지결`)가 실제로 든 것과 같다.
 * (정본은 마이그레이션 `20260915041117_approval_expense_remittance_partner_snapshot.sql`이며,
 *  여기는 **새로 세우는 표의 기본값**이다. 이미 쓰이고 있는 양식을 이 목록으로 되돌리지 않는다.)
 *
 * 거래처 뒤의 다섯 열은 사람이 고치지 않는 사본(`source`)이다. 값의 주인은 거래처 원장이고,
 * 이 표에는 결재가 찍힌 시점의 계좌가 그대로 남는다 — 나중에 원장의 계좌가 바뀌어도 그때
 * 무엇을 승인했는지가 달라지지 않는다.
 */
const REMITTANCE_COLUMNS: FormColumn[] = [
  { key: 'partner', label: '거래처명', type: 'PARTNER_REF' },
  { key: 'partnerName', label: '거래처명', type: 'TEXT', source: { from: 'partner', field: 'NAME' } },
  { key: 'partnerType', label: '구분', type: 'TEXT', source: { from: 'partner', field: 'PARTNER_TYPE' } },
  { key: 'bankCode', label: '은행', type: 'TEXT', source: { from: 'partner', field: 'BANK' } },
  { key: 'accountNo', label: '계좌번호', type: 'TEXT', source: { from: 'partner', field: 'ACCOUNT_NO' } },
  {
    key: 'accountHolder',
    label: '예금주',
    type: 'TEXT',
    source: { from: 'partner', field: 'ACCOUNT_HOLDER' },
  },
  { key: 'amount', label: '송금액', type: 'MONEY' },
  { key: 'requestOn', label: '송금 요청일', type: 'DATE' },
]

/** 블록의 정체를 가리는 열 — 이 열이 있으면 그 블록이고, 없으면 그냥 표다. */
const PRESET_MARKER: Record<FieldPreset, FormColumn['type']> = {
  EXPENSE_ITEMS: 'BUDGET_REF',
  REMITTANCE: 'PARTNER_REF',
}

const PRESET_COLUMNS: Record<FieldPreset, FormColumn[]> = {
  EXPENSE_ITEMS: EXPENSE_ITEM_COLUMNS,
  REMITTANCE: REMITTANCE_COLUMNS,
}

/** 블록을 처음 세울 때 들고 오는 이름. 담당자가 고쳐 쓰는 값이라 **비어 있을 때만** 채운다. */
const PRESET_DEFAULT_LABEL: Record<FieldPreset, string> = {
  EXPENSE_ITEMS: '지출 내역',
  REMITTANCE: '송금 요청',
}

export const FIELD_CHOICE_LABEL: Record<FieldChoice, string> = {
  ...FIELD_TYPE_LABEL,
  EXPENSE_ITEMS: '지출 내역 (예산 줄 선택)',
  REMITTANCE: '송금 요청 (거래처·계좌)',
}

/**
 * 먼저 보이는 선택지 — 지출결의서 한 장이 본문 아래에 갖는 것 전부다.
 * 순서는 문서에 서는 순서와 같다: 얼마를 배정했는가(예산표) → 무엇에 썼는가(지출 내역) →
 * 누구에게 보내는가(송금 요청).
 */
export const PRIMARY_FIELD_CHOICES: FieldChoice[] = ['BUDGET_TREE', 'EXPENSE_ITEMS', 'REMITTANCE']

/**
 * 나머지 종류. 지우지 않고 아래로 내린다 — 휴가신청서·품의서처럼 이 세 블록과 무관한 양식이
 * 계속 만들어지고, 옛 양식이 이미 든 종류를 목록에서 빼면 그 양식을 열었을 때 고른 값이 없는
 * 드롭다운이 선다.
 */
export const OTHER_FIELD_CHOICES: FieldChoice[] = FIELD_TYPES.filter(
  (type) => !PRIMARY_FIELD_CHOICES.includes(type),
)

/**
 * 이 필드가 드롭다운의 어느 값으로 서는가 — **열이 답한다.**
 * 표에 예산 줄이 있으면 지출 내역, 거래처가 있으면 송금 요청, 둘 다 없으면 그냥 표다.
 * 거래처를 먼저 보는 이유는 송금 요청 표에 예산 줄을 더한 양식이 있을 수 있어서다(그 표의
 * 성격을 정하는 것은 돈이 나가는 상대다).
 */
export function fieldChoiceOf(field: FormField): FieldChoice {
  if (field.type !== 'TABLE') return field.type
  const columns = field.columns ?? []
  if (columns.some((c) => c.type === 'PARTNER_REF')) return 'REMITTANCE'
  if (columns.some((c) => c.type === 'BUDGET_REF')) return 'EXPENSE_ITEMS'
  return 'TABLE'
}

function isPreset(choice: FieldChoice): choice is FieldPreset {
  return choice === 'EXPENSE_ITEMS' || choice === 'REMITTANCE'
}

/**
 * 선택지를 적용한 필드.
 *
 * 종류만 고른 경우는 지금까지와 같다(`withFieldType`). 블록을 고른 경우에는 **그 블록을 그
 * 블록이게 하는 열이 반드시 서게** 한다 — 없으면 앞에 붙이고, 이미 짜 둔 열은 지우지 않는다.
 * 잘못 골랐다 되돌리는 사이에 손으로 맞춘 열이 사라지면 안 되기 때문이다.
 *
 * 붙이려는 열의 key를 그 표가 이미 다른 뜻으로 쓰고 있으면 그 열은 건너뛴다. 그 경우 표시 열이
 * 서지 않아 드롭다운은 `표`로 되돌아오는데, 이는 **거짓말하지 않는 결과**다 — 값이 갈 곳을
 * 덮어써서 고른 대로 보이게 만드는 쪽이 훨씬 나쁘다.
 */
export function withFieldChoice(field: FormField, choice: FieldChoice): FormField {
  if (!isPreset(choice)) return withFieldType(field, choice)

  const current = field.columns ?? []
  const label = field.label.trim() === '' ? PRESET_DEFAULT_LABEL[choice] : field.label
  const base = { ...withFieldType(field, 'TABLE'), label }

  if (current.length === 0) return { ...base, columns: PRESET_COLUMNS[choice] }
  if (current.some((c) => c.type === PRESET_MARKER[choice])) return { ...base, columns: current }

  const taken = new Set(current.map((c) => c.key))
  const added = PRESET_COLUMNS[choice].filter((c) => !taken.has(c.key))
  return { ...base, columns: [...added, ...current] }
}
