import { useEffect, useMemo, useState } from 'react'
import {
  useFundCapitalCallPayments,
  useSetCapitalCallPayments,
  type CapitalCall,
  type FundLp,
} from '@/features/fund/hooks'

/** 숫자만 남겨 천단위 콤마. */
export function formatThousands(s: string): string {
  return s.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
/** 콤마 제거 후 숫자(빈값·실패=0). */
export function toNum(s: string): number {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * 납입률 표기 = 총 실 납입액 ÷ 총 약정액.
 * 조합 규모(수백억)에 비해 초기 납입은 몇 천만 원 단위라 정수로 반올림하면 0%로 뭉개진다 —
 * 실제로 들어온 돈이 있는데 0%라고 쓰지 않도록 자릿수를 값에 맞춘다.
 */
export function formatPaidRate(paid: number, commitment: number): string {
  if (commitment <= 0 || paid <= 0) return '0%'
  const pct = (paid / commitment) * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  if (pct >= 0.01) return `${pct.toFixed(2)}%`
  return '<0.01%'
}

export type CapitalCallCellValue = { requested: string; status: string }
export const EMPTY_CELL: CapitalCallCellValue = { requested: '', status: 'SCHEDULED' }

/** draft[callId][lpId] = 셀 초안. */
type Draft = Record<string, Record<string, CapitalCallCellValue>>

export interface CapitalCallDraft {
  cellOf: (callId: string, lpId: string) => CapitalCallCellValue
  setCell: (callId: string, lpId: string, patch: Partial<CapitalCallCellValue>) => void
  /** 차수별 요청/납입 합계(푸터). */
  callTotals: Record<string, { requested: number; paid: number }>
  /** LP별 납입 합계(오른쪽 열). */
  lpPaid: (lpId: string) => number
  /** 상단 요약 타일의 4개 지표. 표와 같은 초안에서 계산해 둘이 갈라지지 않는다. */
  totals: { commitment: number; requested: number; paid: number; unpaid: number; rate: string }
  dirtyCount: number
  saving: boolean
  /** 변경된 차수만 원자 교체. 실패 시 throw. */
  save: () => Promise<void>
}

/**
 * 캐피탈 콜 그리드 초안 — 차수×LP 요청액·상태의 편집 상태와 그 위에서 도는 모든 합계를 소유한다.
 *
 * 합계를 화면마다 따로 세지 않고 여기 한 곳에서만 센다. 상단 요약이 서버 파생값
 * (`fund_lps.paid_amount`)을 보고 아래 표가 초안을 보면, 저장 전까지 같은 화면의 두 숫자가
 * 서로 다른 말을 한다(총 실 납입액 0 · 납입 합계 37,000,000). 산식은 아래 하나뿐이다.
 *
 *   총 약정액   = Σ fund_lps.commitment_amount
 *   총 실 납입액 = Σ 요청액(상태 = 납입완료)
 *   납입률      = 총 실 납입액 ÷ 총 약정액
 *   미납 잔액   = 총 약정액 − 총 실 납입액
 */
export function useCapitalCallDraft(
  fundId: string,
  calls: CapitalCall[],
  lps: FundLp[],
): CapitalCallDraft {
  const { data: payments } = useFundCapitalCallPayments(fundId)
  const saveMutation = useSetCapitalCallPayments(fundId)

  const [draft, setDraft] = useState<Draft>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  // 서버값(차수×LP)으로 초안을 시드한다. 저장 후 재조회되면 다시 맞춘다.
  useEffect(() => {
    if (!payments) return
    const byKey = new Map(payments.map((p) => [`${p.capital_call_id}:${p.lp_id}`, p]))
    const next: Draft = {}
    for (const call of calls) {
      const col: Record<string, CapitalCallCellValue> = {}
      for (const lp of lps) {
        const p = byKey.get(`${call.id}:${lp.id}`)
        col[lp.id] = {
          requested: p && p.requested_amount > 0 ? formatThousands(String(p.requested_amount)) : '',
          status: p?.status ?? 'SCHEDULED',
        }
      }
      next[call.id] = col
    }
    setDraft(next)
    setDirty(new Set())
  }, [payments, calls, lps])

  const cellOf = (callId: string, lpId: string): CapitalCallCellValue =>
    draft[callId]?.[lpId] ?? EMPTY_CELL

  const setCell = (callId: string, lpId: string, patch: Partial<CapitalCallCellValue>) => {
    const normalized: Partial<CapitalCallCellValue> =
      patch.requested === undefined
        ? patch
        : { ...patch, requested: formatThousands(patch.requested) }
    setDraft((prev) => ({
      ...prev,
      [callId]: {
        ...prev[callId],
        [lpId]: { ...EMPTY_CELL, ...prev[callId]?.[lpId], ...normalized },
      },
    }))
    setDirty((prev) => new Set(prev).add(callId))
  }

  // 차수별·전체 합계를 한 번에 센다(같은 순회 결과를 요약 타일과 푸터가 나눠 쓴다).
  const { callTotals, lpPaidMap, grand } = useMemo(() => {
    const byCall: Record<string, { requested: number; paid: number }> = {}
    const byLp: Record<string, number> = {}
    let requested = 0
    let paid = 0
    for (const call of calls) {
      let callRequested = 0
      let callPaid = 0
      for (const lp of lps) {
        const c = draft[call.id]?.[lp.id] ?? EMPTY_CELL
        const r = toNum(c.requested)
        callRequested += r
        if (c.status === 'PAID') {
          callPaid += r
          byLp[lp.id] = (byLp[lp.id] ?? 0) + r
        }
      }
      byCall[call.id] = { requested: callRequested, paid: callPaid }
      requested += callRequested
      paid += callPaid
    }
    return { callTotals: byCall, lpPaidMap: byLp, grand: { requested, paid } }
  }, [draft, calls, lps])

  const commitment = useMemo(
    () => lps.reduce((a, l) => a + l.commitment_amount, 0),
    [lps],
  )

  const save = async () => {
    const targets = calls.filter((c) => dirty.has(c.id))
    if (targets.length === 0) return
    for (const call of targets) {
      const rows = lps
        .map((lp) => {
          const c = cellOf(call.id, lp.id)
          return { lp_id: lp.id, requested_amount: toNum(c.requested), status: c.status }
        })
        .filter((r) => r.requested_amount > 0 || r.status !== 'SCHEDULED')
      await saveMutation.mutateAsync({ callId: call.id, rows })
    }
    setDirty(new Set())
  }

  return {
    cellOf,
    setCell,
    callTotals,
    lpPaid: (lpId: string) => lpPaidMap[lpId] ?? 0,
    totals: {
      commitment,
      requested: grand.requested,
      paid: grand.paid,
      unpaid: Math.max(0, commitment - grand.paid),
      rate: formatPaidRate(grand.paid, commitment),
    },
    dirtyCount: dirty.size,
    saving: saveMutation.isPending,
    save,
  }
}
