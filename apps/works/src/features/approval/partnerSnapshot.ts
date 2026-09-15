/**
 * 송금 요청 한 줄이 드는 **거래처 사본**.
 *
 * 이 모듈이 있는 이유는 2026-09-15에 뒤집힌 판단 하나 때문이다. 종전에는 요청 줄이 거래처
 * id 하나만 들고 은행·계좌·예금주는 **매번 원장이 답했다**(그래야 원장을 고치면 요청서도 함께
 * 고쳐진다). 그런데 송금 요청서는 "지금 무엇이 참인가"를 묻는 화면이 아니라 **결재를 받은
 * 지시**다 — 결재자가 승인한 계좌와 경영지원이 실제로 이체한 계좌가 같아야 하고, 승인 뒤에
 * 원장의 계좌가 바뀌었다고 해서 이미 결재가 끝난 문서의 계좌가 따라 바뀌면 그 문서는 무엇을
 * 승인한 것인지 답하지 못한다.
 *
 * 그래서 고르는 순간 원장의 값을 **그 줄에 적어 둔다.** 적어 두는 것은 고른 그때의 사본이고,
 * 원장은 계속 자기 길을 간다. 둘이 달라지는 날이 오면 그것은 고장이 아니라 사실이다 —
 * 그 문서는 그때의 계좌로 나갔다는 뜻이다.
 *
 * **id도 함께 남긴다.** 사본만 있으면 "이 줄이 원장의 어느 행에서 왔는가"를 되짚을 수 없고,
 * 되짚지 못하면 같은 이름의 거래처가 둘일 때 어느 쪽이었는지 아무도 답하지 못한다.
 *
 * 이 파일은 순수 계층이다(React·DB 의존 없음 — fields.ts와 같은 층).
 */
import {
  sourceColumnKeys,
  type ColumnSourceField,
  type FormColumn,
  type TableRow,
} from '@/features/approval/fields'
import {
  PARTNER_TYPE_LABELS,
  bankLabel,
  type PartnerType,
} from '@/features/management/partners/config'

/**
 * 한 줄에 적히는 거래처 사본.
 *
 * **확인 여부(`verified_at`)는 담지 않는다.** 그 값은 사본이 아니라 원장의 현재 상태이고,
 * 경영지원이 증빙을 보고 떼는 딱지라 나중에 바뀌는 것이 정상이다 — 사본으로 굳히면 "확인 전에
 * 올라간 문서"가 영영 확인 전으로 남는다. 화면은 그 딱지만 원장에 매번 묻는다.
 */
export interface PartnerSnapshot {
  id: string
  name: string
  /** 원장이 든 값 그대로(`CORPORATE`·`INDIVIDUAL`). 이름표는 화면이 붙인다. */
  partnerType: PartnerType | string
  /** 금융기관 코드 3자리. 은행 이름은 바뀌지만 코드는 바뀌지 않는다. */
  bankCode: string
  /** 계좌번호 **전체**. 목록·검색에는 뒤 4자리만 흐르고, 전체는 고른 뒤 한 건만 온다. */
  accountNo: string
  accountHolder: string
}

/**
 * 고른 거래처(또는 해제)를 그 줄의 값 묶음으로 편다.
 *
 * **한 번에 바뀐다.** 참조 칸과 사본 칸들이 각자 바뀌면 그 사이에 거래처는 A인데 계좌는 B인
 * 줄이 존재하게 되고, 그 상태로 저장되면 어느 쪽이 참인지 문서가 답하지 못한다. 그래서 여기서
 * 한 벌을 만들어 호출부가 한 번에 덮어쓴다.
 *
 * 돌려주는 것은 **바뀌는 칸만** 담은 조각이다 — 송금액·요청일처럼 사람이 적은 값은 이 묶음에
 * 들지 않으므로 거래처를 바꿔도 그대로 남는다.
 *
 * 사본 열이 없는 옛 양식에서는 참조 칸 하나만 돌아온다(옛 문서가 그대로 읽히는 자리다).
 */
export function partnerSnapshotPatch(
  columns: FormColumn[],
  refKey: string,
  snapshot: PartnerSnapshot | null,
): TableRow {
  const keys = sourceColumnKeys(columns, refKey)
  const patch: TableRow = { [refKey]: snapshot?.id ?? '' }
  const put = (field: ColumnSourceField, value: string) => {
    const key = keys[field]
    if (key) patch[key] = value
  }
  put('NAME', snapshot?.name ?? '')
  put('PARTNER_TYPE', snapshot?.partnerType ?? '')
  put('BANK', snapshot?.bankCode ?? '')
  put('ACCOUNT_NO', snapshot?.accountNo ?? '')
  put('ACCOUNT_HOLDER', snapshot?.accountHolder ?? '')
  return patch
}

/**
 * 그 줄에 적힌 사본을 읽는다. 참조 칸이 비어 있으면 **고르지 않은 줄**이므로 null이다.
 *
 * 사본 열이 없는 옛 양식·옛 문서에서는 id만 든 사본이 돌아온다 — 그때는 화면이 원장에 이름을
 * 물어 채운다(그것이 종전의 동작이고, 옛 문서는 그대로 읽혀야 한다).
 */
export function readPartnerSnapshot(
  columns: FormColumn[],
  refKey: string,
  row: TableRow,
): PartnerSnapshot | null {
  const id = (row[refKey] ?? '').trim()
  if (!id) return null
  const keys = sourceColumnKeys(columns, refKey)
  const read = (field: ColumnSourceField) => {
    const key = keys[field]
    return key ? (row[key] ?? '') : ''
  }
  return {
    id,
    name: read('NAME'),
    partnerType: read('PARTNER_TYPE'),
    bankCode: read('BANK'),
    accountNo: read('ACCOUNT_NO'),
    accountHolder: read('ACCOUNT_HOLDER'),
  }
}

/**
 * 사본 한 칸의 표시 문자열.
 *
 * 저장된 값은 원장이 든 그대로(코드)이고 이름표는 여기서 붙는다 — 은행 이름은 바뀌기 때문에
 * (KEB하나은행 → 하나은행) 이름을 저장하면 그날 전후의 문서가 다른 은행처럼 갈린다.
 *
 * 계좌번호는 **적힌 그대로 보인다.** 이 칸이 서는 유일한 자리가 송금 요청서이고, 그 문서를
 * 읽는 이유가 그 번호로 돈을 보내기 위해서라 가리면 칸이 하는 일이 없어진다. 목록·검색에서는
 * 지금까지와 같이 뒤 4자리만 흐른다(가리는 일은 원장 뷰가 한다).
 *
 * 빈 칸은 빈 문자열로 돌려준다 — `-`를 적는 일은 화면이 한다(빈 값 표기의 주인은 `EmptyValue`).
 */
export function partnerSourceText(field: ColumnSourceField, raw: string): string {
  const value = (raw ?? '').trim()
  if (!value) return ''
  if (field === 'PARTNER_TYPE') {
    return PARTNER_TYPE_LABELS[value as PartnerType] ?? value
  }
  if (field === 'BANK') {
    // 목록에서 뺀 코드가 남아 있어도 칸을 비우지 않는다(`코드 999`로 적힌다).
    return bankLabel(value) ?? value
  }
  return value
}
