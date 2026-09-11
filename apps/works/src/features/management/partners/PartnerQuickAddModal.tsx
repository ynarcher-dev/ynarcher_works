import { Button, Field, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  BANKS,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPE_ORDER,
  registrationLabel,
  type PartnerType,
} from '@/features/management/partners/config'
import {
  digitsOnly,
  normalizeAccountNo,
  registrationLength,
} from '@/features/management/partners/partnerForm'
import { useQuickRegisterPartner } from '@/features/management/partners/partnerDirectoryApi'

interface Props {
  open: boolean
  onClose: () => void
  /** 원장에 들어간 뒤 그 id를 돌려준다 — 요청 줄은 이 id를 가리킨다. */
  onCreated: (partnerId: string) => void
  /** 검색해도 없어서 새로 넣는 자리이므로 검색어를 이름 칸에 미리 넣는다. */
  initialName?: string
}

/**
 * 송금 요청에서의 즉석 거래처 등록.
 *
 * **원장에 먼저 들어가고 그 다음 요청 줄에 실린다.** 요청서에만 있고 원장에는 없는 거래처를
 * 만들지 않는 것이 이 창의 전부다 — 그런 거래처가 생기면 지급 담당자가 계좌를 어디서
 * 확인해야 하는지 답할 곳이 없다.
 *
 * 여기서 만든 거래처에는 **"확인 전" 딱지가 붙는다**(서버가 정한다). 계좌 정보를 확인하기
 * 전에 들어온 행이 확인된 행과 같은 얼굴로 서면 결재자가 둘을 가릴 수 없다. 딱지가 붙어도
 * 상신은 막지 않는다 — 거르는 일은 결재자의 반려가 한다.
 */
export function PartnerQuickAddModal({ open, onClose, onCreated, initialName }: Props) {
  const toast = useToast()
  const register = useQuickRegisterPartner()
  const [name, setName] = useState(initialName ?? '')
  const [partnerType, setPartnerType] = useState<PartnerType>('CORPORATE')
  const [registrationNo, setRegistrationNo] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [accountHolder, setAccountHolder] = useState('')

  const regLen = registrationLength(partnerType)
  // 계좌 세 값은 함께 있거나 함께 없다(원장 CHECK와 같은 규칙). 반쯤 적힌 계좌는 없는 계좌보다
  // 나쁘다 — 있다고 착각하게 한다.
  const accountFilled = [bankCode, accountNo, accountHolder].filter(Boolean).length
  const accountBroken = accountFilled > 0 && accountFilled < 3

  const submit = async () => {
    if (!name.trim()) {
      toast.show('거래처명을 입력하세요.', 'warning')
      return
    }
    if (registrationNo && registrationNo.length !== regLen) {
      toast.show(`${registrationLabel(partnerType)}는 ${regLen}자리입니다.`, 'warning')
      return
    }
    if (accountBroken) {
      toast.show('은행·계좌번호·예금주는 함께 입력하세요.', 'warning')
      return
    }
    try {
      const id = await register.mutateAsync({
        name,
        partnerType,
        registrationNo: registrationNo || null,
        bankCode: bankCode || null,
        accountNo: accountNo || null,
        accountHolder: accountHolder || null,
      })
      toast.show('거래처를 원장에 등록했습니다. 경영지원 확인 전 상태입니다.', 'success')
      onCreated(id)
      onClose()
    } catch {
      toast.show('거래처 등록에 실패했습니다.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="거래처 등록"
      // 쓰던 값이 클릭 한 번에 사라지지 않도록 바깥 클릭으로 닫지 않는다.
      dismissible={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={register.isPending}>
            등록
          </Button>
        </>
      }
    >
      {/* **이 안내는 접지 않는다.** 지금 만드는 것이 요청서 한 줄이 아니라 원장의 행이고,
          한 번 들어가면 이 화면에서 되돌릴 수 없다 — 되돌릴 수 없는 작업의 파급 효과 고지는
          말풍선 뒤로 숨기지 않는다(CLAUDE.md '안내 문구는 접는다'의 예외). */}
      <p className="mb-3 rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2 text-body-sm text-gray-700">
        여기서 등록한 거래처는 거래처 원장에 바로 들어갑니다. 경영지원이 계좌 정보를 확인하기
        전까지 <b>확인 전</b>으로 표시됩니다.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="거래처명" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="구분">
          <Select
            value={partnerType}
            onChange={(e) => {
              setPartnerType(e.target.value as PartnerType)
              setRegistrationNo('')
            }}
          >
            {PARTNER_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {PARTNER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={registrationLabel(partnerType)} hint={`숫자 ${regLen}자리`}>
          <Input
            inputMode="numeric"
            value={registrationNo}
            onChange={(e) => setRegistrationNo(digitsOnly(e.target.value).slice(0, regLen))}
          />
        </Field>
        <Field label="은행">
          <Select value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
            <option value="">선택</option>
            {BANKS.map((b) => (
              <option key={b.code} value={b.code}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="계좌번호">
          <Input
            value={accountNo}
            onChange={(e) => setAccountNo(normalizeAccountNo(e.target.value))}
          />
        </Field>
        <Field label="예금주">
          <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
