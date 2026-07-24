import { Badge, Button, Checkbox, IconButton, Input, useToast } from '@ynarcher/ui'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CAPITAL_CALL_STATUS_LABEL,
  CAPITAL_CALL_STATUS_TONE,
} from '@/features/fund/fundListHooks'
import {
  useFundCapitalCallPayments,
  useSetCapitalCallPayments,
  type CapitalCall,
  type FundLp,
} from '@/features/fund/hooks'

/** 숫자만 남겨 천단위 콤마. */
function formatThousands(s: string): string {
  return s.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
/** 콤마 제거 후 숫자(빈값·실패=0). */
function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

type Cell = { requested: string; paid: boolean }
/** draft[callId][lpId] = 셀 초안. */
type Draft = Record<string, Record<string, Cell>>

/**
 * 캐피탈 콜 매트릭스 — 가로축 N차 · 세로축 LP. 각 셀은 그 차수에 그 LP가 낼 요청액 입력 +
 * 납입 토글(체크박스)이다. "누가 몇 차를 얼마 냈나"가 한 화면에 보인다. 저장하면 변경된 차수만
 * set_capital_call_payments RPC로 원자 교체하고, 집계 트리거가 fund_lps.paid_amount·funds
 * 실출자금액을 파생 갱신한다. (근거: docs_planning/3_5_workspace_fund.md §1.3)
 */
export function CapitalCallMatrix({
  fundId,
  calls,
  lps,
  onEditCall,
  onDeleteCall,
}: {
  fundId: string
  calls: CapitalCall[]
  lps: FundLp[]
  onEditCall: (call: CapitalCall) => void
  onDeleteCall: (call: CapitalCall) => void
}) {
  const toast = useToast()
  const { data: payments } = useFundCapitalCallPayments(fundId)
  const save = useSetCapitalCallPayments(fundId)

  const [draft, setDraft] = useState<Draft>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  // 서버값(차수×LP)으로 초안을 시드한다. 저장 후 재조회되면 다시 맞춘다.
  useEffect(() => {
    if (!payments) return
    const byKey = new Map(payments.map((p) => [`${p.capital_call_id}:${p.lp_id}`, p]))
    const next: Draft = {}
    for (const call of calls) {
      const col: Record<string, Cell> = {}
      for (const lp of lps) {
        const p = byKey.get(`${call.id}:${lp.id}`)
        col[lp.id] = {
          requested: p && p.requested_amount > 0 ? formatThousands(String(p.requested_amount)) : '',
          paid: p?.is_paid ?? false,
        }
      }
      next[call.id] = col
    }
    setDraft(next)
    setDirty(new Set())
  }, [payments, calls, lps])

  const setCell = (callId: string, lpId: string, patch: Partial<Cell>) => {
    setDraft((prev) => ({
      ...prev,
      [callId]: {
        ...prev[callId],
        [lpId]: { requested: '', paid: false, ...prev[callId]?.[lpId], ...patch },
      },
    }))
    setDirty((prev) => new Set(prev).add(callId))
  }

  const cellOf = (callId: string, lpId: string): Cell =>
    draft[callId]?.[lpId] ?? { requested: '', paid: false }

  // 차수별 요청/납입 합계(푸터).
  const callTotals = useMemo(() => {
    const m: Record<string, { requested: number; paid: number }> = {}
    for (const call of calls) {
      let requested = 0
      let paid = 0
      for (const lp of lps) {
        const c = cellOf(call.id, lp.id)
        const r = toNum(c.requested)
        requested += r
        if (c.paid) paid += r
      }
      m[call.id] = { requested, paid }
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, calls, lps])

  // LP별 납입 합계(오른쪽 열, 초안 기준 실시간).
  const lpPaid = (lpId: string) =>
    calls.reduce((sum, call) => {
      const c = cellOf(call.id, lpId)
      return sum + (c.paid ? toNum(c.requested) : 0)
    }, 0)

  const onSave = async () => {
    const targets = calls.filter((c) => dirty.has(c.id))
    if (targets.length === 0) return
    try {
      for (const call of targets) {
        const rows = lps
          .map((lp) => {
            const c = cellOf(call.id, lp.id)
            return { lp_id: lp.id, requested_amount: toNum(c.requested), is_paid: c.paid }
          })
          .filter((r) => r.requested_amount > 0 || r.is_paid)
        await save.mutateAsync({ callId: call.id, rows })
      }
      toast.show('납입 현황을 저장했습니다.', 'success')
      setDirty(new Set())
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-radius-md border border-gray-200">
        <table className="min-w-full border-collapse text-body-sm">
          <thead>
            <tr className="bg-gray-25">
              {/* LP명은 가로 스크롤 시에도 고정(sticky). */}
              <th className="sticky left-0 z-10 bg-gray-25 px-3 py-2 text-left font-medium text-gray-600">
                LP명
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">약정액</th>
              {calls.map((call) => (
                <th key={call.id} className="min-w-[9rem] border-l border-gray-100 px-2 py-1.5 align-top">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-body-sm font-bold text-gray-900">{call.call_no}차</span>
                    <span className="flex items-center">
                      <IconButton
                        label={`${call.call_no}차 수정`}
                        variant="ghost"
                        density="table"
                        icon={<Pencil className="size-3.5" />}
                        onClick={() => onEditCall(call)}
                      />
                      <IconButton
                        label={`${call.call_no}차 삭제`}
                        variant="ghost"
                        density="table"
                        danger
                        icon={<Trash2 className="size-3.5" />}
                        onClick={() => onDeleteCall(call)}
                      />
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={CAPITAL_CALL_STATUS_TONE[call.status] ?? 'neutral'}>
                      {CAPITAL_CALL_STATUS_LABEL[call.status] ?? call.status}
                    </Badge>
                    <span className="text-caption font-normal text-gray-400">
                      {call.due_date ?? '기한 -'}
                    </span>
                  </div>
                </th>
              ))}
              <th className="border-l border-gray-200 px-3 py-2 text-right font-medium text-brand">
                납입 합계
              </th>
            </tr>
          </thead>
          <tbody>
            {lps.map((lp) => (
              <tr key={lp.id} className="border-t border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-900">
                  {lp.name}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                  {lp.commitment_amount.toLocaleString()}
                </td>
                {calls.map((call) => {
                  const c = cellOf(call.id, lp.id)
                  return (
                    <td
                      key={call.id}
                      className={`border-l border-gray-100 px-2 py-1.5 ${c.paid ? 'bg-success-subtle/40' : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Input
                          inputMode="numeric"
                          value={c.requested}
                          onChange={(e) => setCell(call.id, lp.id, { requested: formatThousands(e.target.value) })}
                          className="w-full text-right tabular-nums"
                          density="table"
                          placeholder="0"
                        />
                        <Checkbox
                          checked={c.paid}
                          onChange={(e) => setCell(call.id, lp.id, { paid: e.target.checked })}
                          aria-label={`${lp.name} ${call.call_no}차 납입`}
                          title="납입 완료"
                        />
                      </div>
                    </td>
                  )
                })}
                <td className="border-l border-gray-200 px-3 py-1.5 text-right font-semibold tabular-nums text-brand">
                  {lpPaid(lp.id).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* 차수별 요청/납입 합계 + 미납 잔여. */}
            <tr className="border-t-2 border-gray-200 bg-gray-25 font-semibold text-gray-900">
              <td className="sticky left-0 z-10 bg-gray-25 px-3 py-2">차수 합계</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                {lps.reduce((a, l) => a + l.commitment_amount, 0).toLocaleString()}
              </td>
              {calls.map((call) => {
                const t = callTotals[call.id] ?? { requested: 0, paid: 0 }
                const overdue = call.due_date ? call.due_date < today : false
                const unpaid = t.requested - t.paid
                return (
                  <td key={call.id} className="border-l border-gray-100 px-2 py-2 text-right tabular-nums">
                    <div className="text-gray-900">{t.paid.toLocaleString()}</div>
                    <div className="text-caption font-normal text-gray-400">/ {t.requested.toLocaleString()}</div>
                    {unpaid > 0 && overdue && (
                      <div className="text-caption font-normal text-danger">미납 {unpaid.toLocaleString()}</div>
                    )}
                  </td>
                )
              })}
              <td className="border-l border-gray-200 px-3 py-2 text-right tabular-nums text-brand">
                {lps.reduce((a, l) => a + lpPaid(l.id), 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-caption text-gray-400">
          셀에 요청액을 입력하고 납입되면 체크하세요. 저장하면 실 납입액·실출자금액에 반영됩니다.
        </p>
        <Button onClick={() => void onSave()} disabled={dirty.size === 0 || save.isPending}>
          납입 현황 저장
        </Button>
      </div>
    </div>
  )
}
