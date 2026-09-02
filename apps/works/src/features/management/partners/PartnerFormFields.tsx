import { Field, Input, Select, SettingRow, Switch } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import {
  BANKS,
  licenseLabel,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPE_ORDER,
  registrationLabel,
  type PartnerType,
} from '@/features/management/partners/config'
import { PartnerDocField } from '@/features/management/partners/PartnerDocField'
import {
  digitsOnly,
  normalizeAccountNo,
  normalizeCodePrefix,
  registrationLength,
  withPartnerType,
  type PartnerDraft,
  type PartnerFormError,
} from '@/features/management/partners/partnerForm'
import {
  useDuplicateRegistrationNo,
  useNextPartnerCode,
} from '@/features/management/partners/partnersApi'

interface PartnerFormFieldsProps {
  draft: PartnerDraft
  onChange: (next: PartnerDraft) => void
  /** 수정 중인 거래처의 id·코드. 등록이면 둘 다 없다. */
  partnerId?: string
  code?: string
  error: PartnerFormError | null
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}

/**
 * 거래처 등록·수정 폼의 필드 배치. 값 판단(전이·검증)은 `partnerForm`이 갖고 여기서는 배치만 한다.
 *
 * 필드 차례는 표의 열 차례와 같다 — 표에서 보던 순서대로 폼이 이어져야 무엇을 고치는 중인지
 * 눈이 헤매지 않는다. 줄 묶음은 함께 정하는 값끼리다: 누구인가(코드·거래처명) /
 * 어떤 상대인가(구분·등록번호) / 어디로 보내나(은행·계좌번호·예금주) / 무엇으로 증명하나(서류 2종).
 *
 * 코드 칸은 등록과 수정에서 다른 것을 보여 준다 — 등록에서는 접두어만 받고 번호는 서버가 매기고,
 * 수정에서는 발급된 코드를 읽기 전용으로 적는다. 고칠 수 없는 값에 입력 칸 모양을 주지 않는다.
 */
export function PartnerFormFields({
  draft,
  onChange,
  partnerId,
  code,
  error,
}: PartnerFormFieldsProps) {
  const invalid = (field: keyof PartnerDraft) => error?.field === field
  const editing = Boolean(code)
  const { data: nextCode } = useNextPartnerCode(editing ? '' : draft.codePrefix)
  const regDigits = digitsOnly(draft.registrationNo)
  const { data: duplicate } = useDuplicateRegistrationNo(
    regDigits.length === registrationLength(draft.partnerType) ? regDigits : '',
    partnerId,
  )
  const regLabel = registrationLabel(draft.partnerType)

  return (
    <div className="space-y-4">
      <Row>
        {editing ? (
          <Field label="거래처 코드" hint="발급된 코드는 바뀌지 않습니다(전표가 이 값으로 거래처를 가리킵니다).">
            <Input value={code} readOnly disabled />
          </Field>
        ) : (
          <Field
            label="거래처 코드"
            required
            hint="영문 2글자 접두어만 정하면 일련번호 5자리는 저장할 때 자동으로 붙습니다."
          >
            <div className="flex items-center gap-2">
              <Input
                value={draft.codePrefix}
                invalid={invalid('codePrefix')}
                onChange={(e) =>
                  onChange({ ...draft, codePrefix: normalizeCodePrefix(e.target.value) })
                }
                placeholder="YN"
                className="w-20"
                autoFocus
              />
              {/* 저장 시점에 확정되는 값이라 입력 칸이 아니라 곁글로 적는다. */}
              <span className="tabular-nums text-body text-gray-500">
                {nextCode ? `→ ${nextCode}` : '→ 접두어 2글자'}
              </span>
            </div>
          </Field>
        )}
        <Field label="거래처명" required>
          <Input
            value={draft.name}
            invalid={invalid('name')}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="예: 미성OA시스템"
            autoFocus={editing}
          />
        </Field>
      </Row>

      <Row>
        <Field label="구분" required hint="구분을 바꾸면 등록번호 칸이 비워집니다(받는 값이 달라집니다).">
          <Select
            value={draft.partnerType}
            onChange={(e) => onChange(withPartnerType(draft, e.target.value as PartnerType))}
          >
            {PARTNER_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {PARTNER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={regLabel}
          hint={
            draft.partnerType === 'CORPORATE'
              ? '숫자 10자리. 하이픈은 붙여 넣어도 되며 저장할 때 걷힙니다.'
              : '생년월일 8자리(YYYYMMDD).'
          }
          // 중복은 막지 않고 알린다 — 사업장이 둘인 같은 사업자도 있다.
          error={
            duplicate
              ? `같은 번호가 '${duplicate.name}'(${duplicate.code})에 이미 등록되어 있습니다.`
              : undefined
          }
        >
          <Input
            value={draft.registrationNo}
            invalid={invalid('registrationNo')}
            onChange={(e) => onChange({ ...draft, registrationNo: digitsOnly(e.target.value) })}
            placeholder={draft.partnerType === 'CORPORATE' ? '1234567891' : '19900101'}
            maxLength={registrationLength(draft.partnerType)}
            inputMode="numeric"
            className="tabular-nums"
          />
        </Field>
      </Row>

      <Row>
        <Field label="은행명" hint="목록에 없는 금융기관은 담당 개발자에게 추가를 요청하세요.">
          <Select
            value={draft.bankCode}
            invalid={invalid('bankCode')}
            onChange={(e) => onChange({ ...draft, bankCode: e.target.value })}
          >
            <option value="">선택</option>
            {BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="계좌번호" hint="은행·계좌번호·예금주는 함께 채우거나 함께 비웁니다.">
          <Input
            value={draft.accountNo}
            invalid={invalid('accountNo')}
            onChange={(e) => onChange({ ...draft, accountNo: normalizeAccountNo(e.target.value) })}
            placeholder="602-910435-43607"
            inputMode="numeric"
            className="tabular-nums"
          />
        </Field>
      </Row>

      <Row>
        <Field label="예금주" hint="통장에 적힌 그대로 적습니다 — 거래처명과 다를 수 있습니다.">
          <Input
            value={draft.accountHolder}
            invalid={invalid('accountHolder')}
            onChange={(e) => onChange({ ...draft, accountHolder: e.target.value })}
            placeholder="예: 와이앤아처(주)"
          />
        </Field>
      </Row>

      <Row>
        <Field label={licenseLabel(draft.partnerType)} as="div">
          <PartnerDocField
            kind="license"
            partnerType={draft.partnerType}
            partnerId={partnerId}
            path={draft.licensePath}
            fileName={draft.licenseName}
            onChange={(v) => onChange({ ...draft, licensePath: v.path, licenseName: v.fileName })}
          />
        </Field>
        <Field label="통장사본" as="div">
          <PartnerDocField
            kind="bankbook"
            partnerType={draft.partnerType}
            partnerId={partnerId}
            path={draft.bankbookPath}
            fileName={draft.bankbookName}
            onChange={(v) => onChange({ ...draft, bankbookPath: v.path, bankbookName: v.fileName })}
          />
        </Field>
      </Row>

      {/* 거래 중단은 목록에서 지우는 일이 아니다 — 과거 지급 내역을 설명해야 하므로 행은 남는다. */}
      <SettingRow
        title="사용 여부"
        hint="끄면 새 지급 대상 목록에서 빠집니다. 과거 기록을 설명해야 하므로 원장에는 남습니다."
        control={({ id }) => (
          <Switch
            id={id}
            checked={draft.isActive}
            onChange={(v) => onChange({ ...draft, isActive: v })}
          />
        )}
      />
    </div>
  )
}
