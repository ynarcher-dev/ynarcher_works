import { BackButton, Button, CardShell, Input, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import {
  FUND_CHARACTER_OPTIONS,
  FUND_SOURCE_OPTIONS,
  FUND_STATUS_OPTIONS,
  FUND_STRATEGY_OPTIONS,
  FUND_SUBSCRIPTION_OPTIONS,
  FUND_TYPE_OPTIONS,
} from '@/features/fund/fundListHooks'
import { useCreateFund, useUpdateFund, type Fund, type FundInput } from '@/features/fund/hooks'

interface Option {
  value: string
  label: string
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-body font-medium text-gray-800">{children}</label>
}

function SelectField({
  label,
  value,
  onChange,
  options,
  blank,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  blank?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

interface FundFormProps {
  /** 지정 시 수정 모드. */
  fundId?: string
  initial?: Fund
  onCancel: () => void
  /** 저장 완료 후(생성=새 id, 수정=기존 id). */
  onDone: (id: string) => void
}

/**
 * 펀드 생성·수정 공용 페이지형 폼(모달 아님). STARTUP StartupDetailForm 패턴 —
 * 상단 바(뒤로가기 ↔ 취소·저장)를 스스로 소유하고, 생성 페이지와 상세 편집에서 공용으로 쓴다.
 */
export function FundForm({ fundId, initial, onCancel, onDone }: FundFormProps) {
  const toast = useToast()
  const create = useCreateFund()
  const update = useUpdateFund()
  const editing = Boolean(fundId)
  const d = (v?: string | null) => (v ? v.slice(0, 10) : '')

  const [name, setName] = useState(initial?.name ?? '')
  const [commitment, setCommitment] = useState(
    initial?.total_commitment != null ? String(Number(initial.total_commitment)) : '',
  )
  const [paidIn, setPaidIn] = useState(
    initial?.paid_in_amount != null ? String(Number(initial.paid_in_amount)) : '',
  )
  const [status, setStatus] = useState(initial?.status ?? 'RAISING')
  const [source, setSource] = useState(initial?.source_type ?? '')
  const [character, setCharacter] = useState(initial?.character_type ?? '')
  const [strategy, setStrategy] = useState(initial?.strategy_type ?? '')
  const [fundType, setFundType] = useState(initial?.fund_type ?? '')
  const [subscription, setSubscription] = useState(initial?.subscription_type ?? '')
  const [formedOn, setFormedOn] = useState(d(initial?.formed_on))
  const [termStart, setTermStart] = useState(d(initial?.term_start))
  const [termEnd, setTermEnd] = useState(d(initial?.term_end))
  const [opStart, setOpStart] = useState(d(initial?.operation_start))
  const [opEnd, setOpEnd] = useState(d(initial?.operation_end))

  const busy = create.isPending || update.isPending

  const save = async () => {
    if (!name.trim()) {
      toast.show('펀드명을 입력하세요.', 'warning')
      return
    }
    const values: FundInput = {
      name: name.trim(),
      total_commitment: Number(commitment) || 0,
      status,
      // 빈 문자열(미지정)은 enum 위반이므로 null로 보낸다.
      source_type: source || null,
      character_type: character || null,
      strategy_type: strategy || null,
      fund_type: fundType || null,
      subscription_type: subscription || null,
      paid_in_amount: paidIn ? Number(paidIn) : null,
      formed_on: formedOn || null,
      term_start: termStart || null,
      term_end: termEnd || null,
      operation_start: opStart || null,
      operation_end: opEnd || null,
    }
    try {
      if (editing && fundId) {
        await update.mutateAsync({ id: fundId, values })
        toast.show('펀드를 수정했습니다.', 'success')
        onDone(fundId)
      } else {
        const id = await create.mutateAsync(values)
        toast.show('펀드를 등록했습니다.', 'success')
        onDone(id)
      }
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton onClick={onCancel} />
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            저장
          </Button>
        </div>
      </div>

      <h1 className="text-title-md font-bold text-gray-900">{editing ? '펀드 수정' : '펀드 등록'}</h1>

      <CardShell>
        <div className="space-y-3">
          <div>
            <Label>펀드명</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>결성액(원)</Label>
              <Input inputMode="numeric" value={commitment} onChange={(e) => setCommitment(e.target.value)} />
            </div>
            <div>
              <Label>실출자금액(원)</Label>
              <Input inputMode="numeric" value={paidIn} onChange={(e) => setPaidIn(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SelectField label="재원" value={source} onChange={setSource} options={FUND_SOURCE_OPTIONS} blank="미지정" />
            <SelectField label="성격" value={character} onChange={setCharacter} options={FUND_CHARACTER_OPTIONS} blank="미지정" />
            <SelectField label="구분" value={strategy} onChange={setStrategy} options={FUND_STRATEGY_OPTIONS} blank="미지정" />
            <SelectField label="펀드유형" value={fundType} onChange={setFundType} options={FUND_TYPE_OPTIONS} blank="미지정" />
            <SelectField label="출자" value={subscription} onChange={setSubscription} options={FUND_SUBSCRIPTION_OPTIONS} blank="미지정" />
            <SelectField label="상태" value={status} onChange={setStatus} options={FUND_STATUS_OPTIONS} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label>결성일</Label>
              <Input type="date" value={formedOn} onChange={(e) => setFormedOn(e.target.value)} />
            </div>
            <div>
              <Label>존속기간 시작</Label>
              <Input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
            </div>
            <div>
              <Label>존속기간 종료</Label>
              <Input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
            </div>
            <div>
              <Label>운용기간 시작</Label>
              <Input type="date" value={opStart} onChange={(e) => setOpStart(e.target.value)} />
            </div>
            <div>
              <Label>운용기간 종료</Label>
              <Input type="date" value={opEnd} onChange={(e) => setOpEnd(e.target.value)} />
            </div>
          </div>
        </div>
      </CardShell>
    </div>
  )
}
