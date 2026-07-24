import { Badge, Button, Checkbox, IconButton, Input, Tooltip, useToast } from '@ynarcher/ui'
import { Bell, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  CAPITAL_CALL_STATUS_LABEL,
  CAPITAL_CALL_STATUS_TONE,
} from '@/features/fund/fundListHooks'
import {
  useCapitalCallPayments,
  useSetCapitalCallPayments,
  type CapitalCall,
  type FundLp,
} from '@/features/fund/hooks'

/** 숫자만 남겨 천단위 콤마. */
function formatThousands(s: string): string {
  return s.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
/** 콤마 제거 후 숫자. 빈값·실패는 0. */
function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

type DraftRow = { requested: string; paid: boolean }

/**
 * 캐피탈 콜 한 차수(회차) 카드 — 헤더(회차·기한·상태·요청·납입률) + 펼치면 LP별 요청·납입 그리드.
 *
 * 이 그리드가 출자자↔캐피탈 콜 연동의 입력 표면이다. LP마다 이번 차수 요청액을 개별 입력하고
 * (지분율 기반 일괄 채움은 기본값 제안일 뿐 행마다 수정), 납입 체크박스를 켜면 그 요청액이 실
 * 납입액으로 반영된다 — 저장하면 set_capital_call_payments RPC가 그리드를 원자 교체하고 집계
 * 트리거가 fund_lps.paid_amount·funds.실출자금액을 파생 갱신한다.
 * (근거: docs_planning/3_5_workspace_fund.md §1.3)
 */
export function CapitalCallRound({
  fundId,
  call,
  lps,
  onEdit,
  onDelete,
}: {
  fundId: string
  call: CapitalCall
  lps: FundLp[]
  onEdit: (call: CapitalCall) => void
  onDelete: (call: CapitalCall) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const { data: payments } = useCapitalCallPayments(open ? call.id : undefined)
  const save = useSetCapitalCallPayments(fundId)

  const [draft, setDraft] = useState<Record<string, DraftRow>>({})
  const [pct, setPct] = useState('')
  const [dirty, setDirty] = useState(false)

  // 그리드를 펼치거나 저장 후 서버값이 갱신되면 초안을 다시 시드한다(LP 전체 × 해당 차수 요청/납입).
  useEffect(() => {
    if (!open || !payments) return
    const byLp = new Map(payments.map((p) => [p.lp_id, p]))
    const next: Record<string, DraftRow> = {}
    for (const lp of lps) {
      const p = byLp.get(lp.id)
      next[lp.id] = {
        requested: p && p.requested_amount > 0 ? formatThousands(String(p.requested_amount)) : '',
        paid: p?.is_paid ?? false,
      }
    }
    setDraft(next)
    setDirty(false)
  }, [open, payments, lps])

  const setRow = (lpId: string, patch: Partial<DraftRow>) => {
    setDraft((prev) => ({
      ...prev,
      [lpId]: { requested: '', paid: false, ...prev[lpId], ...patch },
    }))
    setDirty(true)
  }

  // 지분율 기반 일괄 채움: 각 LP 요청액 = 약정액 × pct%. 이후 행별 수정으로 덮어쓴다(기본값 제안).
  const applyPct = () => {
    const p = toNum(pct)
    if (p <= 0) {
      toast.show('적용할 비율(%)을 입력하세요.', 'warning')
      return
    }
    setDraft((prev) => {
      const next = { ...prev }
      for (const lp of lps) {
        const req = Math.round((lp.commitment_amount * p) / 100)
        next[lp.id] = { requested: req > 0 ? formatThousands(String(req)) : '', paid: prev[lp.id]?.paid ?? false }
      }
      return next
    })
    setDirty(true)
  }

  const totals = useMemo(() => {
    let requested = 0
    let paid = 0
    for (const lp of lps) {
      const row = draft[lp.id]
      if (!row) continue
      const r = toNum(row.requested)
      requested += r
      if (row.paid) paid += r
    }
    return { requested, paid, rate: requested > 0 ? Math.round((paid / requested) * 100) : 0 }
  }, [draft, lps])

  const onSave = async () => {
    const rows = lps
      .map((lp) => ({
        lp_id: lp.id,
        requested_amount: toNum(draft[lp.id]?.requested ?? ''),
        is_paid: draft[lp.id]?.paid ?? false,
      }))
      .filter((r) => r.requested_amount > 0 || r.is_paid)
    try {
      await save.mutateAsync({ callId: call.id, rows })
      toast.show('납입 현황을 저장했습니다.', 'success')
      setDirty(false)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const overdue = call.due_date ? call.due_date < new Date().toISOString().slice(0, 10) : false

  return (
    <div className="rounded-radius-md border border-gray-200 bg-white">
      {/* 헤더: 펼침 토글 + 회차·기한·상태 + 요청·납입 요약 + 수정/삭제. */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-gray-400" />
          )}
          <span className="shrink-0 text-body font-bold text-gray-900">{call.call_no}차</span>
          <Badge tone={CAPITAL_CALL_STATUS_TONE[call.status] ?? 'neutral'}>
            {CAPITAL_CALL_STATUS_LABEL[call.status] ?? call.status}
          </Badge>
          <span className="shrink-0 text-body-sm text-gray-500">
            기한 {call.due_date ?? '-'}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <p className="text-caption text-gray-500">요청 / 납입</p>
            <p className="text-body-sm font-semibold tabular-nums text-gray-900">
              {Number(call.amount).toLocaleString()}
            </p>
          </div>
          <IconButton
            label="차수 수정"
            variant="ghost"
            icon={<Pencil className="size-4" />}
            onClick={() => onEdit(call)}
          />
          <IconButton
            label="차수 삭제"
            variant="ghost"
            danger
            icon={<Trash2 className="size-4" />}
            onClick={() => onDelete(call)}
          />
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-3 py-3">
          {lps.length === 0 ? (
            <p className="text-body-sm text-gray-500">
              등록된 출자자(LP)가 없습니다. 출자자 탭에서 먼저 조합원을 등록하세요.
            </p>
          ) : (
            <>
              {/* 지분율 기반 일괄 채움(기본값 제안). 이후 행별로 요청액을 수정한다. */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-body-sm text-gray-500">
                  약정액의
                  <Tooltip content="각 LP 요청액을 약정액 × 비율로 일괄 채웁니다. 이후 행별로 수정할 수 있습니다." />
                </span>
                <Input
                  inputMode="numeric"
                  value={pct}
                  onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ''))}
                  className="w-16 text-right tabular-nums"
                  density="card"
                />
                <span className="text-body-sm text-gray-500">%</span>
                <Button variant="outline" density="card" onClick={applyPct}>
                  일괄 채움
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-1.5 pr-2 text-left font-medium">LP명</th>
                      <th className="py-1.5 px-2 text-right font-medium">약정액</th>
                      <th className="py-1.5 px-2 text-right font-medium">이번 차수 요청액</th>
                      <th className="py-1.5 px-2 text-center font-medium">납입</th>
                      <th className="py-1.5 pl-2 text-center font-medium">미납 알림</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lps.map((lp) => {
                      const row = draft[lp.id] ?? { requested: '', paid: false }
                      return (
                        <tr key={lp.id} className="border-b border-gray-50">
                          <td className="py-1.5 pr-2 text-gray-900">{lp.name}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">
                            {lp.commitment_amount.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2">
                            <Input
                              inputMode="numeric"
                              value={row.requested}
                              onChange={(e) => setRow(lp.id, { requested: formatThousands(e.target.value) })}
                              className="text-right tabular-nums"
                              density="card"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <Checkbox
                              checked={row.paid}
                              onChange={(e) => setRow(lp.id, { paid: e.target.checked })}
                              aria-label={`${lp.name} 납입 완료`}
                            />
                          </td>
                          <td className="py-1.5 pl-2 text-center">
                            {!row.paid && overdue ? (
                              <IconButton
                                label={`${lp.name} 납입 촉구`}
                                variant="ghost"
                                icon={<Bell className="size-4 text-warning-600" />}
                                onClick={() =>
                                  toast.show('발송 채널 연동은 후속(Phase 14)에서 제공됩니다.', 'info')
                                }
                              />
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold text-gray-900">
                      <td className="py-2 pr-2">합계</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-500">
                        {lps.reduce((a, l) => a + l.commitment_amount, 0).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {totals.requested.toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums text-brand" colSpan={2}>
                        납입 {totals.paid.toLocaleString()} ({totals.rate}%)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-3 flex justify-end">
                <Button onClick={() => void onSave()} disabled={!dirty || save.isPending}>
                  납입 현황 저장
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
