import { Button, Input, Modal, Select, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { FUND_LP_TYPE_OPTIONS } from '@/features/fund/fundListHooks'
import {
  useCreateFundLp,
  useDeleteFundLp,
  useUpdateFundLp,
  type FundLp,
} from '@/features/fund/hooks'

/** 숫자만 남겨 천단위 콤마. */
function formatThousands(s: string): string {
  return s.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-body font-medium text-gray-800">{label}</label>
      {children}
    </div>
  )
}

/**
 * 출자자(LP) 등록·수정 모달.
 *
 * 약정액은 캐스케이드의 입력 천장이라 여기서만 받는다 — 납입액·지분율은 받지 않는다.
 * 납입액은 캐피탈 콜에서, 지분율은 `약정액 ÷ 약정총액` 트리거에서 파생된다.
 * (근거: docs_planning/3_5_workspace_fund.md §2.2)
 */
export function FundLpFormModal({
  fundId,
  open,
  onClose,
  editing,
}: {
  fundId: string
  open: boolean
  onClose: () => void
  /** 수정 대상. 없으면 신규 등록. */
  editing?: FundLp | null
}) {
  const toast = useToast()
  const create = useCreateFundLp(fundId)
  const update = useUpdateFundLp(fundId)
  const del = useDeleteFundLp(fundId)

  const [name, setName] = useState('')
  const [lpType, setLpType] = useState('LIMITED')
  const [amount, setAmount] = useState('')
  const [manager, setManager] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setLpType(editing?.lp_type ?? 'LIMITED')
    setAmount(editing ? formatThousands(String(editing.commitment_amount)) : '')
    setManager(editing?.contact?.manager ?? '')
    setPhone(editing?.contact?.phone ?? '')
    setEmail(editing?.contact?.email ?? '')
  }, [open, editing])

  const busy = create.isPending || update.isPending || del.isPending

  const onSubmit = async () => {
    if (!name.trim()) {
      toast.show('조합원명을 입력하세요.', 'warning')
      return
    }
    const values = {
      name: name.trim(),
      lp_type: lpType,
      commitment_amount: Number(amount.replace(/,/g, '')) || 0,
      // 빈 칸은 키 자체를 넣지 않는다 — 빈 문자열이 쌓이면 "연락처 있음"으로 오독된다.
      contact: {
        ...(manager.trim() ? { manager: manager.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      },
    }
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, values })
        toast.show('출자자를 수정했습니다.', 'success')
      } else {
        await create.mutateAsync(values)
        toast.show('출자자를 등록했습니다.', 'success')
      }
      onClose()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const onDelete = async () => {
    if (!editing) return
    const warning =
      editing.paid_amount > 0
        ? `${editing.name}은(는) 납입액 ${editing.paid_amount.toLocaleString()}원이 집계돼 있습니다. 삭제하면 캐피탈 콜 납입 현황에서도 함께 빠집니다. 계속할까요?`
        : `${editing.name}을(를) 삭제할까요? 남은 조합원의 지분율이 다시 계산됩니다.`
    if (!window.confirm(warning)) return
    try {
      await del.mutateAsync(editing.id)
      toast.show('출자자를 삭제했습니다.', 'success')
      onClose()
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? '출자자 수정' : '출자자 등록'}
      footer={
        <>
          {/* 삭제는 수정 모드에서만 — 좌측 하단(mr-auto 로 취소·수정과 갈라 세운다). */}
          {editing && (
            <Button
              variant="outline-danger"
              className="mr-auto"
              onClick={() => void onDelete()}
              disabled={busy}
            >
              삭제
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {editing ? '수정' : '등록'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="조합원명">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 한국벤처투자(모태)" />
        </Field>
        <Field label="조합원유형">
          <Select value={lpType} onChange={(e) => setLpType(e.target.value)}>
            {FUND_LP_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="약정액(원)">
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatThousands(e.target.value))}
            className="text-right tabular-nums"
            placeholder="0"
          />
        </Field>
        <Field label="담당자">
          <Input value={manager} onChange={(e) => setManager(e.target.value)} />
        </Field>
        <Field label="연락처">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="02-000-0000" />
        </Field>
        <Field label="이메일">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <p className="mt-3 text-body-sm text-gray-500">
        지분율은 약정액 ÷ 약정총액으로 자동 계산되고, 납입액은 캐피탈 콜에서 집계됩니다.
      </p>
    </Modal>
  )
}
