/**
 * 자산 대용량 업로드 — CSV 한 장을 저장 가능한 행들로 바꾸고, 바꿀 수 없는 줄은 이유를 남긴다.
 *
 * 임포터가 화면 폼보다 느슨하면 원장이 화면으로는 만들 수 없는 값으로 채워진다. 그래서 검증은
 * 폼과 같은 `validateDraft`를 통과시키고, 그 위에 CSV에만 있는 문제(모르는 지사·모르는 라벨·
 * 없는 사람)를 더 본다. 서버 check 제약이 마지막 방어선이지만, 거기서 막히면 몇 번째 줄이
 * 문제인지 알 수 없다.
 *
 * 라벨은 한국어로 받는다 — 이 파일을 만드는 사람은 화면에서 쓰는 말('구매', '월 구독')을 알고
 * DB 코드값(PURCHASE, MONTHLY)은 모른다. 코드값도 함께 받아 두어 내려받은 데이터를 그대로
 * 올릴 수 있게 한다.
 */
import { parseCsvTable } from '@/lib/csv'
import {
  ACQUISITION_LABELS,
  ASSET_LABELS,
  BILLING_LABELS,
  type AssetAcquisition,
  type AssetBillingCycle,
  type AssetStatus,
} from '@/features/management/config'
import {
  emptyDraft,
  normalizeAmountInput,
  toAssetInput,
  validateDraft,
} from '@/features/management/assets/assetForm'
import type { AssetInput } from '@/features/management/assets/assetsApi'

/**
 * 업로드 CSV 헤더(순서 = 템플릿 열 순서 = 표의 열 순서).
 * 끝나는 날은 한 칸('만료일')이다 — 상태가 폐기면 그 값이 폐기일자로 저장된다.
 * 옛 템플릿으로 만든 파일을 위해 '폐기일자' 열도 계속 읽는다(아래 별칭·병합 규칙 참조).
 */
export const ASSET_IMPORT_HEADERS = [
  '자산명',
  '시리얼번호',
  '품목',
  '분류',
  '상태',
  '할당대상',
  '금액',
  '결제주기',
  '취득일자',
  '만료일',
  '반출가능',
  '지사',
  '비고',
] as const

/** 헤더 별칭 — 내려받은 파일을 손대지 않고 올릴 수 있도록 영문 컬럼명도 받는다. */
const HEADER_ALIASES: Record<string, string> = {
  자산명: '자산명', name: '자산명',
  지사: '지사', branch: '지사',
  품목: '품목', item_type: '품목',
  분류: '분류', acquisition_type: '분류',
  상태: '상태', status: '상태',
  할당대상: '할당대상', assigned_to: '할당대상', 할당: '할당대상',
  시리얼번호: '시리얼번호', serial_no: '시리얼번호', 시리얼: '시리얼번호',
  취득일자: '취득일자', acquired_on: '취득일자',
  만료일: '만료일', return_due: '만료일', 회수예정일: '만료일',
  폐기일자: '폐기일자', disposed_on: '폐기일자',
  금액: '금액', amount: '금액',
  결제주기: '결제주기', billing_cycle: '결제주기',
  반출가능: '반출가능', is_portable: '반출가능', 반출: '반출가능',
  비고: '비고', note: '비고',
}

export interface ImportRowError {
  /** 원본 CSV 줄 번호(1=헤더). */
  line: number
  message: string
}

export interface ImportParseResult {
  rows: AssetInput[]
  errors: ImportRowError[]
}

/** 참조 원장 — 이름으로 들어온 값을 id로 바꾸는 데 쓴다. */
export interface ImportRefs {
  /** 활성 지사(이름 → id). 비활성 지사로는 새로 등록하지 않는다. */
  branches: { id: string; name: string }[]
  /** 내부 임직원(이름 → id). 동명이인이 있으면 그 줄은 사람을 특정할 수 없다고 본다. */
  employees: { id: string; name: string }[]
}

/** 값 → 코드. 라벨('구매')과 코드('PURCHASE') 양쪽을 받고, 빈 값은 기본값으로 떨어진다. */
function codeOf<T extends string>(
  raw: string,
  labels: Record<T, string>,
  fallback: T,
): T | null {
  const v = raw.trim()
  if (!v) return fallback
  const upper = v.toUpperCase()
  const keys = Object.keys(labels) as T[]
  const byCode = keys.find((k) => k === upper)
  if (byCode) return byCode
  const byLabel = keys.find((k) => labels[k] === v)
  return byLabel ?? null
}

/** 'O'·'Y'·'true'·'가능'을 참으로 본다. 빈 값은 거짓(반출 불가가 기본이다). */
function boolOf(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return false
  if (['o', 'y', 'yes', 'true', '가능', '1'].includes(v)) return true
  if (['x', 'n', 'no', 'false', '불가', '0'].includes(v)) return false
  return null
}

/** 날짜는 YYYY-MM-DD만 받는다. 엑셀이 흔히 쓰는 점·슬래시 구분자는 하이픈으로 맞춘다. */
function dateOf(raw: string): string | null {
  const v = raw.trim().replace(/[./]/g, '-')
  if (!v) return ''
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v)
  if (!m) return null
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
}

/** 이름 → 유일한 id. 없으면 'none', 여럿이면 'many'. */
function uniqueIdByName(list: { id: string; name: string }[], name: string) {
  const hits = list.filter((x) => x.name.trim() === name.trim())
  if (hits.length === 0) return 'none' as const
  if (hits.length > 1) return 'many' as const
  return hits[0]!.id
}

export function buildAssetTemplateCsv(): string {
  return [
    ASSET_IMPORT_HEADERS.join(','),
    '"MacBook Pro 16 (2025)",C02X1234ABCD,노트북,구매,보유,,2500000,완납,2026-03-01,,O,본사,',
    'Figma 엔터프라이즈,,라이선스,렌탈,보유,,55000,월 구독,2026-01-01,2027-12-31,X,본사,연 단위 갱신',
  ].join('\n')
}

/**
 * CSV 텍스트 → 저장 입력. 한 줄이라도 문제가 있으면 그 줄만 errors로 빠지고 나머지는 rows에 남는다.
 * 실제 저장은 전부 통과했을 때만 하도록 호출부가 정한다(반쯤 들어간 원장을 만들지 않기 위해).
 */
export function parseAssetCsv(text: string, refs: ImportRefs): ImportParseResult {
  const table = parseCsvTable(text)
  const fields = table.headers.map(
    (h) => HEADER_ALIASES[h.replace(/\s/g, '')] ?? HEADER_ALIASES[h] ?? '',
  )
  const rows: AssetInput[] = []
  const errors: ImportRowError[] = []

  // 아직 아무것도 붙여 넣지 않은 상태 — 오류로 다루면 열기만 해도 빨간 글씨가 뜬다.
  if (!table.headers.length) return { rows, errors }

  if (!fields.includes('자산명') || !fields.includes('지사')) {
    return {
      rows: [],
      errors: [{ line: 1, message: '헤더에 자산명·지사 열이 필요합니다. 템플릿을 내려받아 쓰세요.' }],
    }
  }

  for (const { line, cells } of table.rows) {
    const cell = (field: string) => {
      const idx = fields.indexOf(field)
      return idx >= 0 ? (cells[idx] ?? '').trim() : ''
    }

    const branchName = cell('지사')
    const branchId = uniqueIdByName(refs.branches, branchName)
    if (branchId === 'none') {
      errors.push({ line, message: `지사 '${branchName || '(빈 값)'}'을(를) 찾을 수 없습니다.` })
      continue
    }
    if (branchId === 'many') {
      errors.push({ line, message: `지사 '${branchName}'이(가) 여러 건입니다. 지사명을 정리하세요.` })
      continue
    }

    const acquisitionType = codeOf<AssetAcquisition>(cell('분류'), ACQUISITION_LABELS, 'PURCHASE')
    if (!acquisitionType) {
      errors.push({ line, message: `분류 '${cell('분류')}'를 알 수 없습니다(구매/리스/렌탈/기타).` })
      continue
    }
    const status = codeOf<AssetStatus>(cell('상태'), ASSET_LABELS, 'AVAILABLE')
    if (!status) {
      errors.push({ line, message: `상태 '${cell('상태')}'를 알 수 없습니다(가용/할당됨/유지보수/폐기).` })
      continue
    }
    const billingCycle = codeOf<AssetBillingCycle>(cell('결제주기'), BILLING_LABELS, 'ONE_TIME')
    if (!billingCycle) {
      errors.push({ line, message: `결제주기 '${cell('결제주기')}'를 알 수 없습니다(완납/월 구독/연 구독).` })
      continue
    }
    const isPortable = boolOf(cell('반출가능'))
    if (isPortable == null) {
      errors.push({ line, message: `반출가능 '${cell('반출가능')}'를 알 수 없습니다(O/X).` })
      continue
    }

    const acquiredOn = dateOf(cell('취득일자'))
    const expiry = dateOf(cell('만료일'))
    const disposed = dateOf(cell('폐기일자'))
    if (acquiredOn == null || expiry == null || disposed == null) {
      errors.push({ line, message: '날짜는 YYYY-MM-DD 형식으로 적으세요.' })
      continue
    }
    // 옛 템플릿에는 만료일·폐기일자가 따로 있었다. 둘을 한 값으로 접되 폐기일자를 우선하고,
    // 폐기일자가 적혀 있으면 상태도 폐기로 본다 — 폐기한 날을 아는데 상태가 보유일 수는 없다.
    const endsOn = disposed || expiry
    const finalStatus = disposed ? 'RETIRED' : status

    let assignedTo = ''
    const personName = cell('할당대상')
    if (personName) {
      const found = uniqueIdByName(refs.employees, personName)
      if (found === 'none') {
        errors.push({ line, message: `임직원 '${personName}'을(를) 찾을 수 없습니다.` })
        continue
      }
      if (found === 'many') {
        errors.push({ line, message: `임직원 '${personName}'이(가) 여러 명입니다. 화면에서 직접 지정하세요.` })
        continue
      }
      assignedTo = found
    }

    const draft = {
      ...emptyDraft(branchId),
      name: cell('자산명'),
      itemType: cell('품목'),
      acquisitionType,
      status: finalStatus,
      // 폐기한 물건에는 소유자를 남기지 않는다(화면의 상태 전이와 같은 규칙).
      assignedTo: finalStatus === 'RETIRED' ? '' : assignedTo,
      serialNo: cell('시리얼번호'),
      acquiredOn,
      endsOn,
      amount: normalizeAmountInput(cell('금액')),
      billingCycle,
      isPortable,
      note: cell('비고'),
    }

    const invalid = validateDraft(draft)
    if (invalid) {
      errors.push({ line, message: invalid.message })
      continue
    }
    rows.push(toAssetInput(draft))
  }

  return { rows, errors }
}
