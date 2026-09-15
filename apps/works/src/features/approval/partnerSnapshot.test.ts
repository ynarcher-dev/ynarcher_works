import { describe, expect, it } from 'vitest'
import {
  partnerSnapshotPatch,
  partnerSourceText,
  readPartnerSnapshot,
  type PartnerSnapshot,
} from './partnerSnapshot'
import { sourceColumnKeys, visibleColumns, type FormColumn, type TableRow } from './fields'

/** 새 양식(20260915041117 시드)의 송금 요청 열 한 벌. */
const REMITTANCE_COLUMNS: FormColumn[] = [
  { key: 'partner', label: '거래처명', type: 'PARTNER_REF' },
  { key: 'partnerName', label: '거래처명', type: 'TEXT', source: { from: 'partner', field: 'NAME' } },
  {
    key: 'partnerType',
    label: '구분',
    type: 'TEXT',
    source: { from: 'partner', field: 'PARTNER_TYPE' },
  },
  { key: 'bankCode', label: '은행', type: 'TEXT', source: { from: 'partner', field: 'BANK' } },
  {
    key: 'accountNo',
    label: '계좌번호',
    type: 'TEXT',
    source: { from: 'partner', field: 'ACCOUNT_NO' },
  },
  {
    key: 'accountHolder',
    label: '예금주',
    type: 'TEXT',
    source: { from: 'partner', field: 'ACCOUNT_HOLDER' },
  },
  { key: 'amount', label: '송금액', type: 'MONEY' },
  { key: 'requestOn', label: '송금 요청일', type: 'DATE' },
]

/** 사본 열이 없던 옛 양식(20260911140000 시드). 옛 문서가 그대로 읽히는 자리다. */
const LEGACY_COLUMNS: FormColumn[] = [
  { key: 'partner', label: '거래처', type: 'PARTNER_REF' },
  { key: 'amount', label: '송금액', type: 'MONEY' },
  { key: 'requestOn', label: '송금 요청일', type: 'DATE' },
]

const ACME: PartnerSnapshot = {
  id: 'p-1',
  name: '㈜에이콤',
  partnerType: 'CORPORATE',
  bankCode: '004',
  accountNo: '12345678901',
  accountHolder: '㈜에이콤',
}

const KIM: PartnerSnapshot = {
  id: 'p-2',
  name: '김담당',
  partnerType: 'INDIVIDUAL',
  bankCode: '088',
  accountNo: '110-222-333444',
  accountHolder: '김담당',
}

describe('송금 요청 열 구성', () => {
  it('이름 사본만 화면에서 빠지고 일곱 열이 정해진 순서로 선다', () => {
    expect(visibleColumns(REMITTANCE_COLUMNS).map((c) => c.label)).toEqual([
      '거래처명',
      '구분',
      '은행',
      '계좌번호',
      '예금주',
      '송금액',
      '송금 요청일',
    ])
  })

  it('파생 열의 자리를 참조 열 key로 찾는다', () => {
    expect(sourceColumnKeys(REMITTANCE_COLUMNS, 'partner')).toEqual({
      NAME: 'partnerName',
      PARTNER_TYPE: 'partnerType',
      BANK: 'bankCode',
      ACCOUNT_NO: 'accountNo',
      ACCOUNT_HOLDER: 'accountHolder',
    })
  })

  it('가리키는 참조가 다르면 그 참조의 파생 열로 세지 않는다', () => {
    expect(sourceColumnKeys(REMITTANCE_COLUMNS, 'other')).toEqual({})
  })

  it('같은 조각이 두 번 선언되면 앞의 것만 쓴다', () => {
    const columns: FormColumn[] = [
      ...REMITTANCE_COLUMNS,
      { key: 'bankAgain', label: '은행', type: 'TEXT', source: { from: 'partner', field: 'BANK' } },
    ]
    expect(sourceColumnKeys(columns, 'partner').BANK).toBe('bankCode')
  })
})

describe('partnerSnapshotPatch', () => {
  it('고른 거래처의 다섯 조각과 id를 그 줄에 적는다', () => {
    expect(partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', ACME)).toEqual({
      partner: 'p-1',
      partnerName: '㈜에이콤',
      partnerType: 'CORPORATE',
      bankCode: '004',
      accountNo: '12345678901',
      accountHolder: '㈜에이콤',
    })
  })

  it('사람이 적은 송금액·요청일은 조각에 들지 않는다(거래처를 바꿔도 남는다)', () => {
    const row: TableRow = { amount: '1,500,000', requestOn: '2026-09-20' }
    const next = { ...row, ...partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', ACME) }
    expect(next.amount).toBe('1,500,000')
    expect(next.requestOn).toBe('2026-09-20')
  })

  it('다른 거래처로 바꾸면 사본 다섯 칸이 한 번에 갈린다', () => {
    const row: TableRow = {
      ...partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', ACME),
      amount: '1,000',
    }
    const next = { ...row, ...partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', KIM) }
    expect(next).toEqual({
      partner: 'p-2',
      partnerName: '김담당',
      partnerType: 'INDIVIDUAL',
      bankCode: '088',
      accountNo: '110-222-333444',
      accountHolder: '김담당',
      amount: '1,000',
    })
  })

  it('해제하면 사본 다섯 칸이 한 번에 비워진다 — 옛 계좌가 남지 않는다', () => {
    const row: TableRow = {
      ...partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', ACME),
      amount: '1,000',
      requestOn: '2026-09-20',
    }
    const next = { ...row, ...partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', null) }
    expect(next).toEqual({
      partner: '',
      partnerName: '',
      partnerType: '',
      bankCode: '',
      accountNo: '',
      accountHolder: '',
      amount: '1,000',
      requestOn: '2026-09-20',
    })
  })

  it('계좌를 아직 모르는 거래처는 그 칸들이 빈 값으로 적힌다', () => {
    const noAccount: PartnerSnapshot = {
      id: 'p-3',
      name: '미확인상사',
      partnerType: 'CORPORATE',
      bankCode: '',
      accountNo: '',
      accountHolder: '',
    }
    expect(partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', noAccount)).toEqual({
      partner: 'p-3',
      partnerName: '미확인상사',
      partnerType: 'CORPORATE',
      bankCode: '',
      accountNo: '',
      accountHolder: '',
    })
  })

  it('사본 열이 없는 옛 양식에서는 참조 칸 하나만 바뀐다', () => {
    expect(partnerSnapshotPatch(LEGACY_COLUMNS, 'partner', ACME)).toEqual({ partner: 'p-1' })
    expect(partnerSnapshotPatch(LEGACY_COLUMNS, 'partner', null)).toEqual({ partner: '' })
  })
})

describe('readPartnerSnapshot', () => {
  it('참조 칸이 비어 있으면 고르지 않은 줄이다', () => {
    expect(readPartnerSnapshot(REMITTANCE_COLUMNS, 'partner', {})).toBeNull()
    expect(readPartnerSnapshot(REMITTANCE_COLUMNS, 'partner', { partner: '  ' })).toBeNull()
  })

  it('적힌 사본을 그대로 읽는다', () => {
    const row = partnerSnapshotPatch(REMITTANCE_COLUMNS, 'partner', KIM)
    expect(readPartnerSnapshot(REMITTANCE_COLUMNS, 'partner', row)).toEqual(KIM)
  })

  it('옛 문서·옛 양식에서는 id만 든 사본이 나온다(이름은 원장이 답한다)', () => {
    expect(readPartnerSnapshot(LEGACY_COLUMNS, 'partner', { partner: 'p-1', amount: '10' })).toEqual(
      {
        id: 'p-1',
        name: '',
        partnerType: '',
        bankCode: '',
        accountNo: '',
        accountHolder: '',
      },
    )
  })
})

describe('partnerSourceText', () => {
  it('구분은 이름표로 편다', () => {
    expect(partnerSourceText('PARTNER_TYPE', 'CORPORATE')).toBe('법인')
    expect(partnerSourceText('PARTNER_TYPE', 'INDIVIDUAL')).toBe('개인')
  })

  it('은행은 코드로 저장되고 이름표는 여기서 붙는다', () => {
    expect(partnerSourceText('BANK', '004')).toBe('국민은행')
    expect(partnerSourceText('BANK', '088')).toBe('신한은행')
  })

  it('목록에서 뺀 코드·모르는 값도 칸을 비우지 않는다', () => {
    expect(partnerSourceText('BANK', '999')).toBe('코드 999')
    expect(partnerSourceText('PARTNER_TYPE', 'UNKNOWN')).toBe('UNKNOWN')
  })

  it('계좌번호·예금주·이름은 적힌 그대로 보인다(송금 요청서에서 가리지 않는다)', () => {
    expect(partnerSourceText('ACCOUNT_NO', '110-222-333444')).toBe('110-222-333444')
    expect(partnerSourceText('ACCOUNT_HOLDER', '김담당')).toBe('김담당')
    expect(partnerSourceText('NAME', '㈜에이콤')).toBe('㈜에이콤')
  })

  it('빈 칸은 빈 문자열이다 — 빈 값 표기는 화면이 정한다', () => {
    expect(partnerSourceText('BANK', '')).toBe('')
    expect(partnerSourceText('ACCOUNT_NO', '   ')).toBe('')
  })
})
