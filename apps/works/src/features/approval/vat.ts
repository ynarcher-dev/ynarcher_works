/**
 * 부가세 — 항목 한 줄의 공급가액·부가세·합계액.
 *
 * **모든 예산·예약·차감은 부가세 포함 합계액 기준이다**(2026-09-13 사용자 확정). 그래서 이
 * 모듈이 답하는 것은 "얼마를 깎는가"가 아니라 "그 합계액이 어떻게 쪼개지는가"뿐이다.
 * 차감·잔액은 여전히 합계액 한 열만 보고, 그 판정은 서버(app.approval_budget_lines)가 한다.
 *
 * **세 값을 모두 저장한다.** 둘을 저장하고 하나를 계산하지 않는 이유는 증빙에 적힌 세액이
 * 산식과 원 단위로 어긋나는 일이 실제로 있기 때문이다(수수료·간이과세·해외 결제). 계산으로
 * 대신하면 그런 항목은 영원히 증빙과 다른 숫자를 보이게 된다. 대신 `합계액 = 공급가액 + 부가세`는
 * 화면과 서버가 함께 검증한다(app.assert_approval_amounts).
 *
 * 순수 계층(React·DB 의존 없음).
 */
import { isBadNumberText, toNumber } from '@/features/approval/numeric'

/**
 * 과세 유형 넷.
 *
 * 셋을 '부가세 0원' 하나로 뭉치지 않는 이유는 **0원인 사유가 서로 다르기 때문**이다 —
 * 면세는 재화 자체가 면세 대상이고, 영세율은 과세 대상이지만 세율이 0이며, 과세대상 아님은
 * 애초에 부가세 체계 밖이다(인건비·손해배상·해외 송금). 뭉치면 이 원장에서 부가세 신고
 * 자료를 다시 만들 수 없다.
 */
export type VatKind = 'TAXABLE' | 'EXEMPT' | 'ZERO_RATED' | 'NOT_TAXABLE'

/** 선택 목록의 순서이기도 하다(가장 흔한 것이 맨 앞). */
export const VAT_KINDS: VatKind[] = ['TAXABLE', 'EXEMPT', 'ZERO_RATED', 'NOT_TAXABLE']

export const VAT_KIND_LABEL: Record<VatKind, string> = {
  TAXABLE: '과세',
  EXEMPT: '면세',
  ZERO_RATED: '영세율',
  NOT_TAXABLE: '과세대상 아님',
}

/** 기본 세율. 값의 SSOT는 여기 하나이며 서버 app.approval_vat_rate가 같은 표를 갖는다. */
const VAT_RATE: Record<VatKind, number> = {
  TAXABLE: 0.1,
  EXEMPT: 0,
  ZERO_RATED: 0,
  NOT_TAXABLE: 0,
}

/**
 * 저장된 글자를 과세 유형으로 읽는다. **모르는 값과 빈 값은 null이다** — '과세'로 되돌리지
 * 않는다. 되돌리면 유형을 적은 적 없는 옛 항목이 오늘 갑자기 과세 항목으로 집계된다.
 */
export function parseVatKind(raw: string | null | undefined): VatKind | null {
  const key = (raw ?? '').trim().toUpperCase()
  return (VAT_KINDS as string[]).includes(key) ? (key as VatKind) : null
}

/** 읽기 화면의 표기. 모르는 값은 null이라 화면이 '-'를 세운다(과세로 되돌리지 않는다). */
export function vatKindLabel(raw: string | null | undefined): string | null {
  const kind = parseVatKind(raw)
  return kind === null ? null : VAT_KIND_LABEL[kind]
}

/** 세율. 유형을 모르면 null이며, 그때는 세액을 계산하지 않고 적힌 값을 그대로 둔다. */
export function vatRate(kind: VatKind | null): number | null {
  return kind === null ? null : VAT_RATE[kind]
}

/** 한 항목의 세 값. 적히지 않은 칸은 null이다(0원과 미입력은 다르다). */
export interface VatAmounts {
  net: number | null
  vat: number | null
  gross: number | null
  /** 적혀 있는데 숫자로 읽을 수 없는 칸이 있는가. 빈 칸(null)과 구분하려고 따로 든다. */
  bad?: boolean
}

/** 원 단위로 끊는다 — 세 값 모두 원 단위 정수이며 표시 단계에서 반올림하지 않는다. */
const won = (n: number): number => Math.round(n)

/**
 * 합계액에서 되짚기(총액 기준 입력).
 *
 * 담당자가 손에 쥔 숫자는 대개 **세금계산서에 적힌 합계액**이다. 그 값에서 세액을 떼는 것이
 * 자연스러운 방향이므로 `부가세 = 합계액 / 11`(반올림), `공급가액 = 합계액 − 부가세`로 센다.
 * 공급가액을 먼저 세면 반올림 오차가 합계액을 1원 흔들어, 담당자가 적은 숫자가 화면에서
 * 달라 보인다.
 */
export function splitFromGross(gross: number, kind: VatKind | null): VatAmounts {
  const rate = vatRate(kind)
  if (rate === null) return { net: null, vat: null, gross }
  if (rate === 0) return { net: gross, vat: 0, gross }
  const vat = won((gross * rate) / (1 + rate))
  return { net: gross - vat, vat, gross }
}

/** 공급가액에서 쌓기 — 견적서가 공급가액으로 올 때. `부가세 = 공급가액 × 세율`(반올림). */
export function splitFromNet(net: number, kind: VatKind | null): VatAmounts {
  const rate = vatRate(kind)
  if (rate === null) return { net, vat: null, gross: null }
  const vat = won(net * rate)
  return { net, vat, gross: net + vat }
}

/** 세액을 증빙대로 고쳤을 때 — 공급가액은 그대로 두고 합계액만 다시 맞춘다. */
export function withVat(net: number, vat: number): VatAmounts {
  return { net, vat, gross: net + vat }
}

/** 항목 한 줄이 어느 칸에 값을 담는가. 서버 app.approval_amount_keys와 같은 축이다. */
export interface AmountKeys {
  grossKey: string
  netKey?: string
  vatKey?: string
  kindKey?: string
}

/** 저장된 문자열 칸에서 세 값과 과세 유형을 읽는다. */
export function readAmounts(
  values: Record<string, string>,
  keys: AmountKeys,
): VatAmounts & { kind: VatKind | null } {
  const raw = [keys.grossKey, keys.netKey, keys.vatKey].filter((k): k is string => Boolean(k))
  return {
    net: keys.netKey ? toNumber(values[keys.netKey] ?? '') : null,
    vat: keys.vatKey ? toNumber(values[keys.vatKey] ?? '') : null,
    gross: toNumber(values[keys.grossKey] ?? ''),
    kind: keys.kindKey ? parseVatKind(values[keys.kindKey]) : null,
    bad: raw.some((k) => isBadNumberText(values[k])),
  }
}

/** 무엇을 손댔는가 — 그 칸을 붙잡고 나머지를 다시 센다. */
export type AmountEdit = 'NET' | 'VAT' | 'GROSS' | 'KIND'

/**
 * 한 칸을 고쳤을 때 나머지 칸이 따라가는 규칙.
 *
 * 붙잡는 값이 무엇인지가 전부다 — 공급가액을 고치면 공급가액을, 합계액을 고치면 합계액을,
 * 과세 유형을 고치면 **합계액을** 붙잡는다. 유형을 바꿨다고 담당자가 적은 총액이 흔들리면
 * 예산에서 깎이는 금액이 조용히 달라지고, 그것은 유형을 고른 사람의 의도가 아니다.
 *
 * 세액을 직접 고친 경우에는 아무것도 다시 세지 않고 합계액만 맞춘다 — 증빙에 따른 수정을
 * 허용한다는 것이 곧 산식이 그 값을 덮어쓰지 않는다는 뜻이다.
 */
export function deriveAmounts(
  current: VatAmounts,
  kind: VatKind | null,
  edited: AmountEdit,
): VatAmounts {
  if (edited === 'VAT') {
    if (current.net === null || current.vat === null) return current
    return withVat(current.net, current.vat)
  }
  if (edited === 'NET') {
    if (current.net === null) return { net: null, vat: current.vat, gross: current.gross }
    return splitFromNet(current.net, kind)
  }
  // GROSS와 KIND는 둘 다 합계액을 붙잡는다.
  if (current.gross === null) return { net: current.net, vat: current.vat, gross: null }
  return splitFromGross(current.gross, kind)
}

/** 고친 칸이 세 값 중 무엇인가. 부가세 칸이 없는 옛 양식이면 null(따라 셀 것이 없다). */
export function amountEditOf(keys: AmountKeys, editedKey: string): AmountEdit | null {
  if (!keys.netKey || !keys.vatKey) return null
  if (editedKey === keys.grossKey) return 'GROSS'
  if (editedKey === keys.netKey) return 'NET'
  if (editedKey === keys.vatKey) return 'VAT'
  if (keys.kindKey && editedKey === keys.kindKey) return 'KIND'
  return null
}

/**
 * 한 칸을 고친 뒤의 값 묶음 — 예산표와 지출 내역 표가 **같은 함수**를 쓴다.
 *
 * 두 화면이 각자 계산하면 같은 합계액이 표마다 다르게 쪼개지고, 그 차이는 상신 직전 서버
 * 검증에서야 드러난다. 쓸 값이 없으면(유형을 모름) 그 칸은 **건드리지 않는다** — 빈 칸으로
 * 덮으면 유형을 적은 적 없는 옛 문서를 열어 보기만 해도 금액이 지워진다.
 */
export function applyAmountEdit(
  values: Record<string, string>,
  keys: AmountKeys,
  editedKey: string,
): Record<string, string> {
  const edited = amountEditOf(keys, editedKey)
  if (!edited) return values
  const current = readAmounts(values, keys)
  const next = deriveAmounts(current, current.kind, edited)
  const out = { ...values }
  const write = (key: string | undefined, v: number | null) => {
    if (key && v !== null) out[key] = String(v)
  }
  write(keys.netKey, next.net)
  write(keys.vatKey, next.vat)
  write(keys.grossKey, next.gross)
  return out
}

/** 여러 항목의 합. 적히지 않은 칸은 세지 않는다(0원으로 세면 미입력이 0원으로 굳는다). */
export function sumAmounts(items: VatAmounts[]): VatAmounts {
  const total = { net: null, vat: null, gross: null } as VatAmounts
  for (const item of items) {
    if (item.net !== null) total.net = (total.net ?? 0) + item.net
    if (item.vat !== null) total.vat = (total.vat ?? 0) + item.vat
    if (item.gross !== null) total.gross = (total.gross ?? 0) + item.gross
  }
  return total
}

/**
 * 항목 한 줄의 금액 정합성 — 서버 app.assert_approval_amounts와 같은 규칙.
 *
 * 화면이 먼저 보는 이유는 상신 버튼을 누른 뒤 서버 오류로 되돌아오는 것보다 적는 자리에서
 * 알려 주는 편이 낫기 때문이고, 서버가 다시 보는 이유는 **화면이 인가가 아니기 때문**이다.
 * 통과 시 null, 막히면 사람이 고칠 수 있는 한 문장을 돌려준다.
 */
export function validateAmounts(
  amounts: VatAmounts,
  kind: VatKind | null,
  /**
   * 이 양식이 공급가액·부가세 칸을 갖는가. 역할 열이 없는 옛 양식은 합계액 하나만 갖고
   * 있으므로 쪼개진 값을 요구하지 않는다 — 요구하면 옛 문서를 고칠 길까지 함께 막힌다.
   */
  hasVatColumns = true,
): string | null {
  const { net, vat, gross } = amounts
  // 빈 칸보다 먼저 본다 — 오타는 모두 null로 읽혀 '안 쓴 줄'로 통과해 버린다.
  if (amounts.bad) return '숫자로 읽을 수 없는 금액이 있습니다. 숫자만 적어 주세요.'
  // 아무것도 적지 않은 줄은 아직 쓰지 않은 줄이다.
  if (net === null && vat === null && gross === null) return null
  if (!hasVatColumns) {
    return gross !== null && gross < 0 ? '금액은 0원 이상이어야 합니다.' : null
  }
  if (net === null || vat === null || gross === null) {
    return '공급가액·부가세·합계액을 모두 입력해 주세요.'
  }
  if (net < 0 || vat < 0 || gross < 0) return '금액은 0원 이상이어야 합니다.'
  if (kind !== null && vatRate(kind) === 0 && vat !== 0) {
    return '부가세가 없는 과세 유형인데 세액이 적혀 있습니다.'
  }
  if (gross !== net + vat) return '합계액이 공급가액+부가세와 다릅니다.'
  return null
}
