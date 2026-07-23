import { Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import {
  useCreateInvestment,
  useUpdateInvestment,
  useStartupOptions,
  type Investment,
} from '@/features/fund/hooks'

/** 빈 문자열 → null, 그 외 콤마 제거 후 숫자. 파싱 실패 시 null. */
function numOrNull(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? null : n
}

/**
 * 자사 펀드 투자 집행 등록·수정 모달.
 * 피투자사(스타트업) 선택 → 투자일·라운드·기업 가치(Pre)·집행액 입력.
 * 라운드는 investments.stage에, 기업 가치는 valuation에 저장한다.
 * 집행액(funds.drawn_amount)은 저장 시 DB 트리거가 자동 재계산한다.
 */
export function InvestmentFormModal({
  fundId,
  open,
  onClose,
  editing,
}: {
  fundId: string
  open: boolean
  onClose: () => void
  /** 수정 대상. 없으면 신규 등록. */
  editing?: Investment | null
}) {
  const toast = useToast()
  const { data: startups } = useStartupOptions()
  const create = useCreateInvestment(fundId)
  const update = useUpdateInvestment(fundId)

  const [startupId, setStartupId] = useState('')
  const [investedAt, setInvestedAt] = useState('')
  const [round, setRound] = useState('')
  const [valuation, setValuation] = useState('')
  const [amount, setAmount] = useState('')

  // 모달을 열 때(신규/수정) 현재 대상 값으로 초기화한다.
  useEffect(() => {
    if (!open) return
    setStartupId(editing?.startup_id ?? '')
    setInvestedAt(editing?.invested_at?.slice(0, 10) ?? '')
    setRound(editing?.stage ?? '')
    setValuation(editing?.valuation != null ? String(editing.valuation) : '')
    setAmount(editing?.amount != null ? String(editing.amount) : '')
  }, [open, editing])

  const busy = create.isPending || update.isPending

  const onSubmit = async () => {
    if (!startupId) {
      toast.show('피투자사를 선택하세요.', 'warning')
      return
    }
    const amt = numOrNull(amount)
    if (amt == null || amt <= 0) {
      toast.show('집행액을 입력하세요.', 'warning')
      return
    }
    const values = {
      startup_id: startupId,
      invested_at: investedAt || null,
      stage: round.trim() || null,
      valuation: numOrNull(valuation),
      amount: amt,
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.show('투자를 수정했습니다.', 'success')
      } else {
        await create.mutateAsync(values)
        toast.show('투자를 등록했습니다.', 'success')
      }
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '투자 집행 수정' : '투자 집행 등록'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {editing ? '수정' : '등록'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-body font-medium text-gray-800">피투자사</label>
          <Select value={startupId} onChange={(e) => setStartupId(e.target.value)}>
            <option value="">선택</option>
            {(startups ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">투자일</label>
          <Input type="date" value={investedAt} onChange={(e) => setInvestedAt(e.target.value)} />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">라운드</label>
          <Input
            value={round}
            onChange={(e) => setRound(e.target.value)}
            placeholder="예: Series A, Pre-A"
          />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">기업 가치(Pre)</label>
          <Input
            inputMode="numeric"
            className="text-right tabular-nums"
            value={valuation}
            onChange={(e) => setValuation(e.target.value)}
          />
        </div>
        <div>
          <label className="text-body font-medium text-gray-800">집행액</label>
          <Input
            inputMode="numeric"
            className="text-right tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
