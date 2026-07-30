/**
 * 자산 등록·수정 폼의 값 모델과 규칙 — 화면(JSX)과 떼어 두고 여기서만 판단한다.
 *
 * 규칙은 DB check 제약(20260730100000_assets_ledger.sql)을 그대로 비춘 것이다. 서버가 최종
 * 판정하지만 저장을 눌러서야 알게 되면 무엇이 틀렸는지 사용자가 알 수 없으므로, 같은 규칙을
 * 화면 쪽에도 둔다. 둘이 어긋나면 DB가 맞다 — 저장은 결국 서버가 받는다.
 *
 * 끝나는 날짜는 화면에서 하나(`endsOn`)지만 원장에서는 둘이다 — 계약이 끝날 **예정**인 날
 * (`return_due`)과 실제로 폐기한 날(`disposed_on`). 사용자에게는 둘 다 "이 자산이 끝나는 날"
 * 하나이고, 그 날이 예정인지 사실인지는 상태가 이미 말하고 있다. 그래서 입력은 한 칸으로 받고,
 * 어느 컬럼에 넣을지는 상태를 보고 여기서 정한다. 원장을 합치지는 않는다: 계약 총액 계산과
 * DB check 제약(폐기일자가 있으면 상태는 폐기)이 둘의 구분 위에 서 있다.
 */
import {
  ASSET_PHOTO_MAX,
  type AssetAcquisition,
  type AssetBillingCycle,
  type AssetStatus,
} from '@/features/management/config'
import type { Asset, AssetInput } from '@/features/management/assets/assetsApi'

/** 폼이 들고 있는 값. 날짜·금액은 입력 중간 상태를 담기 위해 문자열로 둔다. */
export interface AssetDraft {
  name: string
  itemType: string
  acquisitionType: AssetAcquisition
  status: AssetStatus
  branchId: string
  /** 빈 문자열이면 미지정. */
  assignedTo: string
  serialNo: string
  acquiredOn: string
  /**
   * 끝나는 날 — 상태가 폐기면 폐기일자(`disposed_on`), 아니면 만료 예정일(`return_due`)로 저장된다.
   * 빈 문자열이면 미입력(만료일을 아직 모르는 계약, 날짜를 모르는 과거 폐기 모두 있어야 한다).
   */
  endsOn: string
  /** 원 단위 정수 문자열. 빈 문자열이면 미입력(0과 구분한다). */
  amount: string
  billingCycle: AssetBillingCycle
  isPortable: boolean
  /** 반출 시 승인 필요 여부. 반출 가능이 꺼져 있으면 저장되지 않는다(뜻이 없는 값이다). */
  requiresApproval: boolean
  note: string
  /**
   * 사진 경로 목록. 파일 자체는 고른 자리에서 이미 버킷에 올라가 있고 여기에는 경로만 담긴다 —
   * 폼이 저장하는 것은 "이 자산의 사진이 이 다섯 장"이라는 사실뿐이다.
   */
  photoPaths: string[]
}

export interface AssetFormError {
  /** 강조할 필드(폼이 invalid 표시에 쓴다). */
  field: keyof AssetDraft
  message: string
}

export function emptyDraft(branchId: string): AssetDraft {
  return {
    name: '',
    itemType: '',
    acquisitionType: 'PURCHASE',
    status: 'AVAILABLE',
    branchId,
    assignedTo: '',
    serialNo: '',
    acquiredOn: '',
    endsOn: '',
    amount: '',
    billingCycle: 'ONE_TIME',
    isPortable: false,
    requiresApproval: false,
    note: '',
    photoPaths: [],
  }
}

/**
 * 원장 → 초안. 끝나는 날은 폐기일자를 먼저 본다 — DB 제약상 폐기일자는 폐기 상태에만 있을 수
 * 있으므로, 값이 있다면 그것이 이 자산이 실제로 끝난 날이다.
 */
export function draftFromAsset(a: Asset): AssetDraft {
  return {
    name: a.name,
    itemType: a.itemType ?? '',
    acquisitionType: a.acquisitionType,
    status: a.status,
    branchId: a.branchId ?? '',
    assignedTo: a.assignedTo ?? '',
    serialNo: a.serialNo ?? '',
    acquiredOn: a.acquiredOn ?? '',
    endsOn: a.disposedOn ?? a.returnDue ?? '',
    // 금액은 원 단위 정수로 다룬다 — 소수점 입력을 되살려 보여줄 이유가 없다.
    amount: a.amount == null ? '' : String(Math.trunc(a.amount)),
    billingCycle: a.billingCycle,
    isPortable: a.isPortable,
    requiresApproval: a.requiresApproval,
    note: a.note ?? '',
    photoPaths: a.photoPaths,
  }
}

/**
 * 상태 변경 — 폐기로 가면 할당을 비운다(폐기한 물건에 소유자를 남겨 둘 수 없다).
 *
 * 끝나는 날은 건드리지 않는다. 상태가 바뀌면 그 날짜가 저장될 컬럼이 만료일↔폐기일자로 옮겨갈
 * 뿐, 사용자가 적어 둔 날 자체는 그대로다 — 상태를 고쳤다고 날짜가 사라지면 지운 적 없는 값이
 * 사라진 것으로 보인다.
 */
export function withStatus(draft: AssetDraft, status: AssetStatus): AssetDraft {
  if (status === 'RETIRED') return { ...draft, status, assignedTo: '' }
  return { ...draft, status }
}

/** 끝나는 날의 뜻은 상태가 정한다 — 폐기면 '폐기일자', 아니면 '만료일'. */
export function endsOnLabel(status: AssetStatus): string {
  return status === 'RETIRED' ? '폐기일자' : '만료일'
}

/** 금액 입력 — 숫자만 남긴다(천 단위 구분 기호를 붙여 넣어도 그대로 받는다). */
export function normalizeAmountInput(value: string): string {
  return value.replace(/[^\d]/g, '')
}

/** 표시용 천 단위 구분. 값이 없으면 '-'(0원과 미입력을 구분한다). */
export function formatAmount(amount: number | null): string {
  return amount == null ? '-' : amount.toLocaleString('ko-KR')
}

/** 저장 전 검증. 첫 번째로 어긋난 규칙 하나만 돌려준다 — 한 번에 여러 줄을 읽게 하지 않는다. */
export function validateDraft(draft: AssetDraft): AssetFormError | null {
  if (!draft.name.trim()) return { field: 'name', message: '자산명을 입력하세요.' }
  if (!draft.branchId) return { field: 'branchId', message: '지사를 선택하세요.' }
  if (draft.status === 'ASSIGNED' && !draft.assignedTo) {
    return { field: 'assignedTo', message: '할당됨 상태에는 할당 대상이 필요합니다.' }
  }
  // 끝나는 날이 시작한 날보다 앞설 수는 없다. DB는 폐기일자만 제약하지만 만료일도 같은 이치라
  // 화면에서 함께 막는다 — 뒤집힌 기간은 계약 총액도 계산되지 않아 빈 값으로만 남는다.
  if (draft.endsOn && draft.acquiredOn && draft.endsOn < draft.acquiredOn) {
    return {
      field: 'endsOn',
      message: `${endsOnLabel(draft.status)}는 취득일자보다 앞설 수 없습니다.`,
    }
  }
  if (draft.amount && !/^\d+$/.test(draft.amount)) {
    return { field: 'amount', message: '금액은 0 이상의 숫자로 입력하세요.' }
  }
  // 화면은 다섯 장을 채우면 첨부 버튼을 감추므로 여기 걸릴 일은 드물다. 그래도 둔다 —
  // DB check(assets_photo_paths_max)에 먼저 걸리면 사용자는 무엇이 문제인지 알 수 없다.
  if (draft.photoPaths.length > ASSET_PHOTO_MAX) {
    return {
      field: 'photoPaths',
      message: `사진은 최대 ${ASSET_PHOTO_MAX}장까지 첨부할 수 있습니다.`,
    }
  }
  // 구독은 만료일이 있어야 계약 총액을 계산할 수 있다. 다만 저장을 막지는 않는다 —
  // 만료일을 아직 모르는 계약도 등록해 두어야 하므로, 총액을 빈 값으로 두는 것이 답이다.
  return null
}

/**
 * 저장 입력으로 변환. 빈 문자열은 모두 null로 접는다(DB에서 ''와 null을 구분할 이유가 없다).
 * 끝나는 날은 여기서 두 컬럼으로 갈린다 — 폐기 상태면 폐기일자, 아니면 만료 예정일이다.
 * 반대쪽은 반드시 비운다: 둘 다 채우면 "폐기했는데 아직 만료 예정"이라는 말이 안 되는 행이 남는다.
 */
export function toAssetInput(draft: AssetDraft): AssetInput {
  const retired = draft.status === 'RETIRED'
  const endsOn = draft.endsOn || null
  return {
    name: draft.name.trim(),
    itemType: draft.itemType.trim() || null,
    acquisitionType: draft.acquisitionType,
    status: draft.status,
    branchId: draft.branchId,
    assignedTo: draft.assignedTo || null,
    serialNo: draft.serialNo.trim() || null,
    acquiredOn: draft.acquiredOn || null,
    disposedOn: retired ? endsOn : null,
    amount: draft.amount ? Number(draft.amount) : null,
    billingCycle: draft.billingCycle,
    isPortable: draft.isPortable,
    requiresApproval: draft.isPortable && draft.requiresApproval,
    returnDue: retired ? null : endsOn,
    note: draft.note.trim() || null,
    photoPaths: draft.photoPaths,
  }
}
