/**
 * 자산 등록·수정 폼의 값 모델과 규칙 — 화면(JSX)과 떼어 두고 여기서만 판단한다.
 *
 * 규칙은 DB check 제약(20260730100000_assets_ledger.sql)을 그대로 비춘 것이다. 서버가 최종
 * 판정하지만 저장을 눌러서야 알게 되면 무엇이 틀렸는지 사용자가 알 수 없으므로, 같은 규칙을
 * 화면 쪽에도 둔다. 둘이 어긋나면 DB가 맞다 — 저장은 결국 서버가 받는다.
 *
 * 상태와 폐기일자는 서로를 끌고 다니므로(전이 규칙) 그 이동도 순수 함수로 둔다.
 */
import {
  type AssetAcquisition,
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
  acquiredOn: string
  disposedOn: string
  /** 원 단위 정수 문자열. 빈 문자열이면 미입력(0과 구분한다). */
  amount: string
  isPortable: boolean
  returnDue: string
  note: string
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
    acquiredOn: '',
    disposedOn: '',
    amount: '',
    isPortable: false,
    returnDue: '',
    note: '',
  }
}

export function draftFromAsset(a: Asset): AssetDraft {
  return {
    name: a.name,
    itemType: a.itemType ?? '',
    acquisitionType: a.acquisitionType,
    status: a.status,
    branchId: a.branchId ?? '',
    assignedTo: a.assignedTo ?? '',
    acquiredOn: a.acquiredOn ?? '',
    disposedOn: a.disposedOn ?? '',
    // 금액은 원 단위 정수로 다룬다 — 소수점 입력을 되살려 보여줄 이유가 없다.
    amount: a.amount == null ? '' : String(Math.trunc(a.amount)),
    isPortable: a.isPortable,
    returnDue: a.returnDue ?? '',
    note: a.note ?? '',
  }
}

/**
 * 폐기일자 입력 — 날짜가 적혔다는 것이 곧 폐기의 근거이므로 상태를 폐기로 옮기고 할당을 비운다.
 * 지우면 상태를 되돌리지 않는다: 날짜를 모르는 폐기 자산도 있어야 하므로 폐기는 날짜와 독립이다.
 */
export function withDisposedOn(draft: AssetDraft, value: string): AssetDraft {
  if (!value) return { ...draft, disposedOn: '' }
  return { ...draft, disposedOn: value, status: 'RETIRED', assignedTo: '' }
}

/**
 * 상태 변경 — 폐기로 가면 할당을 비우고, 폐기에서 나오면 폐기일자를 비운다.
 * 폐기를 취소하는 일과 폐기일자를 남겨 두는 일은 함께 성립할 수 없다(DB 제약이 같은 말을 한다).
 */
export function withStatus(draft: AssetDraft, status: AssetStatus): AssetDraft {
  if (status === 'RETIRED') return { ...draft, status, assignedTo: '' }
  return { ...draft, status, disposedOn: '' }
}

/** 금액 입력 — 숫자만 남긴다(천 단위 구분 기호를 붙여 넣어도 그대로 받는다). */
export function normalizeAmountInput(value: string): string {
  return value.replace(/[^\d]/g, '')
}

/** 표시용 천 단위 구분. 값이 없으면 '—'(0원과 미입력을 구분한다). */
export function formatAmount(amount: number | null): string {
  return amount == null ? '—' : amount.toLocaleString('ko-KR')
}

/** 저장 전 검증. 첫 번째로 어긋난 규칙 하나만 돌려준다 — 한 번에 여러 줄을 읽게 하지 않는다. */
export function validateDraft(draft: AssetDraft): AssetFormError | null {
  if (!draft.name.trim()) return { field: 'name', message: '자산명을 입력하세요.' }
  if (!draft.branchId) return { field: 'branchId', message: '지사를 선택하세요.' }
  if (draft.status === 'ASSIGNED' && !draft.assignedTo) {
    return { field: 'assignedTo', message: '할당됨 상태에는 할당 대상이 필요합니다.' }
  }
  if (draft.disposedOn && draft.acquiredOn && draft.disposedOn < draft.acquiredOn) {
    return { field: 'disposedOn', message: '폐기일자는 취득일자보다 앞설 수 없습니다.' }
  }
  if (draft.disposedOn && draft.status !== 'RETIRED') {
    return { field: 'status', message: '폐기일자가 있으면 상태는 폐기여야 합니다.' }
  }
  if (draft.amount && !/^\d+$/.test(draft.amount)) {
    return { field: 'amount', message: '금액은 0 이상의 숫자로 입력하세요.' }
  }
  return null
}

/** 저장 입력으로 변환. 빈 문자열은 모두 null로 접는다(DB에서 ''와 null을 구분할 이유가 없다). */
export function toAssetInput(draft: AssetDraft): AssetInput {
  return {
    name: draft.name.trim(),
    itemType: draft.itemType.trim() || null,
    acquisitionType: draft.acquisitionType,
    status: draft.status,
    branchId: draft.branchId,
    assignedTo: draft.assignedTo || null,
    acquiredOn: draft.acquiredOn || null,
    disposedOn: draft.disposedOn || null,
    amount: draft.amount ? Number(draft.amount) : null,
    isPortable: draft.isPortable,
    returnDue: draft.returnDue || null,
    note: draft.note.trim() || null,
  }
}
