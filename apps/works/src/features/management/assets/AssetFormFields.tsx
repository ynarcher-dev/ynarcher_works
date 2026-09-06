import {
  Checkbox,
  Field,
  Input,
  Tooltip,
  tooltipScale,
  Select,
  SettingRow,
  Switch,
  TextArea,
  TokenMultiSelect,
} from '@ynarcher/ui'
import { useMemo, type ReactNode } from 'react'
import {
  ACQUISITION_LABELS,
  ACQUISITION_ORDER,
  ASSET_LABELS,
  ASSET_STATUS_ORDER,
  BILLING_LABELS,
  BILLING_ORDER,
  type AssetAcquisition,
  type AssetBillingCycle,
  type AssetStatus,
} from '@/features/management/config'
import { AssetCostSummary } from '@/features/management/assets/AssetCostSummary'
import { AssetPhotoPicker } from '@/features/management/assets/AssetPhotoPicker'
import {
  endsOnLabel,
  normalizeAmountInput,
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
  /** 관리자·할당 대상 후보(내부 임직원만 — 외부 게스트 계정은 목록에 없다). */
  employees: Emp[]
  /** 이미 쓰인 품목 값(자유입력을 막지 않는 제안 목록). */
  itemTypes: string[]
  error: AssetFormError | null
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}

/**
 * 사람 한 명을 고르는 칸(관리자·할당). 한 자산에 한 사람이므로 공용 검색 필드를 max 1로 쓰고
 * 마지막 선택이 앞의 것을 대체하게 둔다.
 */
function PersonPicker({
  value,
  employees,
  disabled,
  placeholder,
  onChange,
}: {
  value: string
  employees: Emp[]
  disabled?: boolean
  placeholder: string
  onChange: (id: string) => void
}) {
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e] as const)), [employees])
  // 퇴사·계정 정리로 목록에 없는 id가 남아 있어도 칸을 비우지 않는다 — 값이 사라진 것처럼
  // 보이면 저장을 누르는 순간 실제로 사라진다.
  const selected = value ? [byId.get(value) ?? { id: value, name: '알 수 없음' }] : []

  return (
    <TokenMultiSelect<Emp>
      selected={selected}
      onChange={(next) => onChange(next.slice(-1)[0]?.id ?? '')}
      options={employees}
      getKey={(e) => e.id}
      getLabel={(e) => e.name || '(이름 없음)'}
      getMeta={(e) => e.email ?? undefined}
      max={1}
      disabled={disabled}
      placeholder={placeholder}
    />
  )
}

/**
 * 자산 등록·수정 폼의 필드 배치. 값 판단(전이·검증)은 `assetForm`이, 금액 계산은 `assetCost`가
 * 갖고 여기서는 배치만 한다.
 *
 * 필드 차례는 표의 열 차례와 같다 — 표에서 보던 순서대로 폼이 이어져야 무엇을 고치는 중인지
 * 눈이 헤매지 않는다. 줄 묶음은 함께 정하는 값끼리다: 무엇인가(자산명·시리얼) /
 * 어떤 물건인가(품목·분류) / 몇 개이고 어떤 상태인가(보유 수량·상태) / 어디 있나(지사·보관 위치) /
 * 누구의 물건인가(관리자·할당) / 얼마(금액·결제 주기) / 언제부터 언제까지(취득일자·끝나는 날).
 *
 * 비용 계산 결과는 금액·기간 줄 바로 아래에 붙인다 — 값을 고치는 자리에서 결과가 바뀌어야 한다.
 *
 * 라벨·도움말의 규격은 공용 `Field`가 소유한다(2026-09-02에 이 파일의 사본을 걷어냈다). 사본을
 * 쓰던 동안 도움말이 이 모달에서만 상시 캡션으로 남아, 같은 works 안에서 규칙이 어느 화면은
 * 말풍선·어느 화면은 캡션으로 갈렸다 — 접기/펴기는 화면이 아니라 소유자가 정한다.
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

  return (
    <div className="space-y-4">
      <Row>
        <Field label="자산명" required>
          <Input
            value={draft.name}
            invalid={invalid('name')}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="예: MacBook Pro 16 (2025)"
            autoFocus
          />
        </Field>
        <Field label="시리얼 번호" hint="제조사 시리얼 또는 사내 관리 번호.">
          <Input
            value={draft.serialNo}
            onChange={(e) => onChange({ ...draft, serialNo: e.target.value })}
            placeholder="예: C02X1234ABCD"
          />
        </Field>
      </Row>

      {/*
        중요는 폼 맨 앞자리다 — 필드 차례는 표의 열 차례를 따르는데, 이 값이 목록에서
        차지하는 자리가 맨 앞의 번호 칸이기 때문이다. 아래 공개 스위치와 묶지 않는 이유는
        축이 다르기 때문이다: 공개는 이 물건을 OFFICE에 보일지이고, 중요는 이 목록에서
        어디에 서는가다.
      */}
      <Checkbox
        checked={draft.isPinned}
        onChange={(e) => onChange({ ...draft, isPinned: e.target.checked })}
        wrapperClassName="flex-wrap gap-y-1"
        label={
          <>
            중요
            <Tooltip
              label="중요"
              content="목록에서 자산명 순을 건너뛰고 맨 위에 고정합니다(번호 대신 📌)."
              className={tooltipScale.gap}
            />
          </>
        }
      />

      <Row>
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
      </Row>

      <Row>
        {/*
          보유 수량은 품목 다음 자리다 — "어떤 물건인가" 다음에 오는 질문이 "몇 개인가"이고,
          공용 물품이라면 OFFICE 자산 현황이 이 수를 그대로 적는다.
        */}
        <Field
          label="보유 수량"
          required
          hint="같은 물건을 여러 개 두는 자산만 1보다 크게 둡니다."
        >
          <Input
            value={draft.quantity}
            invalid={invalid('quantity')}
            inputMode="numeric"
            onChange={(e) =>
              onChange({ ...draft, quantity: e.target.value.replace(/[^\d]/g, '') })
            }
            placeholder="1"
          />
        </Field>
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
      </Row>

      {/*
        지사와 보관 위치는 한 줄이다 — 둘이 합쳐 "어디 있나" 하나에 답한다. 지사는 OFFICE 자산
        현황의 탭이라 목록에서는 이미 골라 놓은 값이고, 그 안에서 어디로 가면 되는지는 위치가
        답한다. 위치를 원장으로 승격하지 않는 이유는 품목과 같다 — 자리 이름은 지사마다 달라
        조합을 관리해야 하는데 그 비용을 치를 만큼 값의 종류가 많지 않다.
      */}
      <Row>
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
        <Field label="보관 위치" hint="지사 안에서 물건이 놓인 자리. OFFICE 자산 현황에 표시됩니다.">
          <Input
            value={draft.location}
            onChange={(e) => onChange({ ...draft, location: e.target.value })}
            placeholder="예: 3층 회의실"
          />
        </Field>
      </Row>

      {/*
        관리자와 할당은 다른 질문이라 한 줄에 나란히 둔다 — 이 물건을 맡은 사람과 지금 쓰는
        사람이다. 공용 비품은 누구에게도 지급되지 않아 할당은 비어 있고 관리자만 있다.
      */}
      <Row>
        {/* 사람 고르는 칸은 label로 감싸지 않는다 — 안에 토큰 삭제 버튼과 후보 목록이 들어 있다. */}
        <Field
          as="div"
          label="관리자"
          hint="이 물건을 맡은 사람. 공개하면 OFFICE 자산 현황에 표시되어 쓰려는 사람이 물어볼 상대가 됩니다."
        >
          <PersonPicker
            value={draft.managerId}
            employees={employees}
            placeholder="임직원 검색 후 지정(1명)"
            onChange={(managerId) => onChange({ ...draft, managerId })}
          />
        </Field>
        <Field
          as="div"
          label="할당"
          required={draft.status === 'ASSIGNED'}
          hint={
            draft.status === 'RETIRED'
              ? '폐기 자산에는 할당 대상을 두지 않습니다.'
              : '이 물건을 지급받아 쓰는 사람.'
          }
          // 폐기 자산의 안내는 편다 — 칸이 왜 잠겼는지의 답이라, 호버해야 보이면 답이 되지 못한다.
          hintInline={draft.status === 'RETIRED'}
        >
          <PersonPicker
            value={draft.assignedTo}
            employees={employees}
            disabled={draft.status === 'RETIRED'}
            placeholder="임직원 검색 후 지정(1명)"
            onChange={(assignedTo) => onChange({ ...draft, assignedTo })}
          />
        </Field>
      </Row>

      <Row>
        <Field label="금액(원)">
          <Input
            value={draft.amount}
            invalid={invalid('amount')}
            inputMode="numeric"
            onChange={(e) => onChange({ ...draft, amount: normalizeAmountInput(e.target.value) })}
            placeholder="예: 2500000"
          />
        </Field>
        <Field label="결제 주기" required hint="완납은 일시금, 구독은 회차마다 내는 금액입니다.">
          <Select
            value={draft.billingCycle}
            onChange={(e) =>
              onChange({ ...draft, billingCycle: e.target.value as AssetBillingCycle })
            }
          >
            {BILLING_ORDER.map((v) => (
              <option key={v} value={v}>
                {BILLING_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
      </Row>

      <Row>
        <Field label="취득일자" hint="구독·리스는 계약 개시일.">
          <Input
            type="date"
            value={draft.acquiredOn}
            onChange={(e) => onChange({ ...draft, acquiredOn: e.target.value })}
          />
        </Field>
        {/* 만료일과 폐기일자는 한 칸이다 — 그 날이 예정인지 사실인지는 위의 상태가 이미 말한다. */}
        <Field
          label={endsOnLabel(draft.status)}
          hint={
            draft.status === 'RETIRED'
              ? '실제로 폐기한 날.'
              : '구독 만료일, 리스·렌탈 반납일, 회수 예정일.'
          }
        >
          <Input
            type="date"
            value={draft.endsOn}
            invalid={invalid('endsOn')}
            onChange={(e) => onChange({ ...draft, endsOn: e.target.value })}
          />
        </Field>
      </Row>

      <AssetCostSummary
        basis={{
          amount: draft.amount ? Number(draft.amount) : null,
          billingCycle: draft.billingCycle,
          acquiredOn: draft.acquiredOn || null,
          endsOn: draft.endsOn || null,
        }}
      />

      {/*
        이 스위치가 정하는 것은 하나다 — OFFICE 자산 현황에 이 물건이 서는가. 종전 이름은
        '반출 가능 여부'였는데 그 이름이 가리키던 반출대장은 2026-08-25에 폐지됐고, 없어진
        기능의 스위치로 읽힌 탓에 실제로 꺼져 OFFICE 목록이 통째로 빈 일이 있었다(2026-08-26).
        이름은 그 스위치가 지금 하는 일을 말한다. 함께 있던 '반출 시 승인 필요'는 그 값을 읽는
        화면이 하나도 남지 않아 걷어냈다.
      */}
      <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2.5">
        <SettingRow
          title="OFFICE 자산 현황에 공개"
          hint="켜면 임직원 전원이 OFFICE 자산 현황에서 이 물건과 보관 위치·관리자를 찾을 수 있습니다. 꺼져 있거나 폐기 상태이면 그 목록에 서지 않습니다."
          control={({ id }) => (
            <Switch
              id={id}
              checked={draft.isPortable}
              onChange={(isPortable) => onChange({ ...draft, isPortable })}
            />
          )}
        />
      </div>

      {/*
        사진은 값 입력이 끝난 뒤에 둔다 — 파일을 고르는 동안 폼이 멈춘 것처럼 보이는 자리라,
        이름·금액 같은 필수 값을 적는 흐름 중간에 끼우지 않는다.
      */}
      {/* label로 감싸지 않는다(as="div") — 안에 파일 입력 label과 삭제 버튼이 있어 label이 중첩된다. */}
      <Field as="div" label="사진">
        <AssetPhotoPicker
          value={draft.photoPaths}
          onChange={(photoPaths) => onChange({ ...draft, photoPaths })}
        />
      </Field>

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
