import { Input, Select, Switch, TextArea, TokenMultiSelect } from '@ynarcher/ui'
import { useMemo, type ReactNode } from 'react'
import {
  ACQUISITION_LABELS,
  ACQUISITION_ORDER,
  ASSET_LABELS,
  ASSET_STATUS_ORDER,
  type AssetAcquisition,
  type AssetStatus,
} from '@/features/management/config'
import {
  normalizeAmountInput,
  withDisposedOn,
  withStatus,
  type AssetDraft,
  type AssetFormError,
} from '@/features/management/assets/assetForm'
import type { Branch } from '@/features/office/branches/branchesApi'

interface Emp {
  id: string
  name: string
  email?: string | null
}

interface AssetFormFieldsProps {
  draft: AssetDraft
  onChange: (next: AssetDraft) => void
  /** 귀속 후보(활성 지사). 지사 원장은 '지사 관리'가 소유하고 여기서는 고르기만 한다. */
  branches: Branch[]
  /** 할당 대상 후보(내부 임직원만 — 외부 게스트 계정은 목록에 없다). */
  employees: Emp[]
  /** 이미 쓰인 품목 값(자유입력을 막지 않는 제안 목록). */
  itemTypes: string[]
  error: AssetFormError | null
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-caption text-gray-500">{hint}</span>}
    </label>
  )
}

/**
 * 자산 등록·수정 폼의 필드 배치. 값 판단(전이·검증)은 `assetForm`이 갖고 여기서는 배치만 한다.
 *
 * 줄 묶음은 함께 정하는 값끼리다 — 무엇인가(자산명·품목) / 어떻게 들여왔나(분류·지사) /
 * 지금 어떤 상태인가(상태·할당 대상) / 언제(취득·폐기) / 얼마·언제까지(금액·회수 예정일).
 */
export function AssetFormFields({
  draft,
  onChange,
  branches,
  employees,
  itemTypes,
  error,
}: AssetFormFieldsProps) {
  const invalid = (field: keyof AssetDraft) => error?.field === field
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees])
  const selected = draft.assignedTo
    ? [byId.get(draft.assignedTo) ?? { id: draft.assignedTo, name: '알 수 없음' }]
    : []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="자산명" required>
          <Input
            value={draft.name}
            invalid={invalid('name')}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="예: MacBook Pro 16 (2025)"
            autoFocus
          />
        </Field>
        <Field label="품목" hint="이미 등록된 품목이 제안되며, 새 품목은 그대로 입력합니다.">
          <Input
            value={draft.itemType}
            list="asset-item-types"
            onChange={(e) => onChange({ ...draft, itemType: e.target.value })}
            placeholder="예: 노트북"
          />
          <datalist id="asset-item-types">
            {itemTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="분류" required>
          <Select
            value={draft.acquisitionType}
            onChange={(e) =>
              onChange({ ...draft, acquisitionType: e.target.value as AssetAcquisition })
            }
          >
            {ACQUISITION_ORDER.map((v) => (
              <option key={v} value={v}>
                {ACQUISITION_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="지사" required>
          <Select
            value={draft.branchId}
            invalid={invalid('branchId')}
            onChange={(e) => onChange({ ...draft, branchId: e.target.value })}
          >
            <option value="">선택하세요</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="상태" required>
          <Select
            value={draft.status}
            invalid={invalid('status')}
            onChange={(e) => onChange(withStatus(draft, e.target.value as AssetStatus))}
          >
            {ASSET_STATUS_ORDER.map((v) => (
              <option key={v} value={v}>
                {ASSET_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="할당 대상"
          required={draft.status === 'ASSIGNED'}
          hint={draft.status === 'RETIRED' ? '폐기 자산에는 할당 대상을 두지 않습니다.' : undefined}
        >
          {/* 한 자산은 한 사람에게 간다 — 공용 검색 필드를 쓰되 max 1로 마지막 선택이 대체하게 둔다. */}
          <TokenMultiSelect<Emp>
            selected={selected}
            onChange={(next) => onChange({ ...draft, assignedTo: next.slice(-1)[0]?.id ?? '' })}
            options={employees}
            getKey={(e) => e.id}
            getLabel={(e) => e.name || '(이름 없음)'}
            getMeta={(e) => e.email ?? undefined}
            max={1}
            disabled={draft.status === 'RETIRED'}
            placeholder="임직원 검색 후 지정(1명)"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="취득일자">
          <Input
            type="date"
            value={draft.acquiredOn}
            onChange={(e) => onChange({ ...draft, acquiredOn: e.target.value })}
          />
        </Field>
        <Field
          label="폐기일자"
          hint="입력하면 상태가 폐기로 바뀌고 할당 대상이 비워집니다."
        >
          <Input
            type="date"
            value={draft.disposedOn}
            invalid={invalid('disposedOn')}
            onChange={(e) => onChange(withDisposedOn(draft, e.target.value))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="금액(원)">
          <Input
            value={draft.amount}
            invalid={invalid('amount')}
            inputMode="numeric"
            onChange={(e) => onChange({ ...draft, amount: normalizeAmountInput(e.target.value) })}
            placeholder="예: 2500000"
          />
        </Field>
        <Field label="회수 예정일" hint="리스·렌탈 반납 예정일 또는 할당 자산 회수 예정일.">
          <Input
            type="date"
            value={draft.returnDue}
            onChange={(e) => onChange({ ...draft, returnDue: e.target.value })}
          />
        </Field>
      </div>

      {/* 반출 가능 여부는 관리자의 사전 판단이며, OFFICE 반출대장이 이 값으로 후보를 거른다. */}
      <div className="flex items-center justify-between rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2.5">
        <div>
          <p className="text-body font-medium text-gray-800">반출 가능 여부</p>
          <p className="text-caption text-gray-500">
            켜면 OFFICE 반출대장에서 반출 후보로 제시됩니다.
          </p>
        </div>
        <Switch
          checked={draft.isPortable}
          onChange={(isPortable) => onChange({ ...draft, isPortable })}
          aria-label="반출 가능 여부"
        />
      </div>

      <Field label="비고">
        <TextArea
          value={draft.note}
          rows={3}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          placeholder="예: 램프 교체 중"
        />
      </Field>

      {error && <p className="text-caption text-danger">{error.message}</p>}
    </div>
  )
}
