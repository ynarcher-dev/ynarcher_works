import { Button, CardShell, useToast } from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CapitalCallFormModal } from '@/features/fund/CapitalCallFormModal'
import { CapitalCallRound } from '@/features/fund/CapitalCallRound'
import {
  useDeleteCapitalCall,
  type CapitalCall,
  type FundLp,
} from '@/features/fund/hooks'

/** 상단 요약 타일(약정 대비 실 납입). */
function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2">
      <p className="text-caption text-gray-600">{label}</p>
      <p className="text-body font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-caption tabular-nums text-gray-500">{sub}</p>}
    </div>
  )
}

/**
 * 캐피탈 콜 탭 — 차수(N차) 목록 + 출자자 연동 요약. 각 차수 카드를 펼치면 LP별 요청·납입 그리드가
 * 열린다(CapitalCallRound). 상단 요약은 출자자 원장에서 파생된 총 약정·총 실납입·납입률을 보여준다
 * — 캐피탈 콜에서 체크한 납입이 fund_lps.paid_amount 로 집계된 결과가 그대로 반영된다.
 * (근거: docs_planning/3_5_workspace_fund.md §1.3)
 */
export function CapitalCallPanel({
  fundId,
  calls,
  lps,
}: {
  fundId: string
  calls: CapitalCall[]
  lps: FundLp[]
}) {
  const toast = useToast()
  const del = useDeleteCapitalCall(fundId)
  const [modal, setModal] = useState<{ open: boolean; editing: CapitalCall | null }>({
    open: false,
    editing: null,
  })

  const totals = useMemo(() => {
    const commitment = lps.reduce((a, l) => a + l.commitment_amount, 0)
    const paid = lps.reduce((a, l) => a + l.paid_amount, 0)
    return { commitment, paid, rate: commitment > 0 ? Math.round((paid / commitment) * 100) : 0 }
  }, [lps])

  const nextCallNo = calls.reduce((max, c) => Math.max(max, c.call_no), 0) + 1

  const onDelete = async (call: CapitalCall) => {
    if (!window.confirm(`${call.call_no}차 캐피탈 콜을 삭제하시겠습니까? 납입 현황도 함께 사라집니다.`)) {
      return
    }
    try {
      await del.mutateAsync(call.id)
      toast.show('차수를 삭제했습니다.', 'success')
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <CardShell>
      <div className="space-y-4">
        {/* 출자자 연동 요약: 총 약정 대비 캐피탈 콜로 집계된 실 납입. */}
        <div className="grid grid-cols-3 gap-2">
          <Summary label="총 약정액" value={totals.commitment.toLocaleString()} />
          <Summary label="총 실 납입액" value={totals.paid.toLocaleString()} sub={`납입률 ${totals.rate}%`} />
          <Summary
            label="미납 잔액"
            value={Math.max(0, totals.commitment - totals.paid).toLocaleString()}
          />
        </div>

        <div className="flex items-center justify-between">
          <h4 className="text-body font-semibold text-gray-700">캐피탈 콜 차수</h4>
          <Button density="card" onClick={() => setModal({ open: true, editing: null })}>
            <Plus className="size-4" />
            차수 추가
          </Button>
        </div>

        {calls.length === 0 ? (
          <p className="text-body-sm text-gray-500">
            등록된 캐피탈 콜 차수가 없습니다. '차수 추가'로 1차를 등록하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
              <CapitalCallRound
                key={call.id}
                fundId={fundId}
                call={call}
                lps={lps}
                onEdit={(c) => setModal({ open: true, editing: c })}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      <CapitalCallFormModal
        fundId={fundId}
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null })}
        editing={modal.editing}
        nextCallNo={nextCallNo}
      />
    </CardShell>
  )
}
