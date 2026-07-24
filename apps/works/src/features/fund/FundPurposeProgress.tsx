import { FUND_PURPOSE_KIND_LABEL, formatEok } from '@/features/fund/fundListHooks'
import type { FundPurpose, Investment } from '@/features/fund/hooks'

/** 목적별 달성 집계 1행. */
interface Row {
  id: string
  label: string
  targetPct: number | null
  amount: number
  achievedPct: number
}

/**
 * 펀드개요 탭의 목적별 달성 현황. 각 목적에 부합(체크)된 투자의 집행액 합을 약정총액으로 나눠
 * 달성률을 내고 목표비율(%)과 비교한다. 한 투자가 여러 목적에 부합하면 각 목적에 전액 계상된다.
 * 일반(어느 목적에도 부합하지 않는 투자)은 하단에 잔여로 함께 보여준다.
 */
export function FundPurposeProgress({
  purposes,
  investments,
  commitment,
}: {
  purposes: FundPurpose[]
  investments: Investment[]
  commitment: number
}) {
  if (purposes.length === 0) {
    return (
      <p className="text-body-sm text-gray-500">
        등록된 목적이 없습니다. 편집에서 주목적·특수목적을 추가하세요.
      </p>
    )
  }

  const pct = (amount: number) => (commitment > 0 ? (amount / commitment) * 100 : 0)

  // 목적별 부합 투자 집행액 합.
  const amountByPurpose = new Map<string, number>()
  for (const inv of investments) {
    for (const pid of inv.purpose_ids) {
      amountByPurpose.set(pid, (amountByPurpose.get(pid) ?? 0) + inv.amount)
    }
  }

  const toRow = (p: FundPurpose): Row => {
    const amount = amountByPurpose.get(p.id) ?? 0
    return { id: p.id, label: p.label, targetPct: p.target_pct, amount, achievedPct: pct(amount) }
  }
  const mandatory = purposes.filter((p) => p.kind === 'MANDATORY').map(toRow)
  const main = purposes.filter((p) => p.kind === 'MAIN').map(toRow)
  const special = purposes.filter((p) => p.kind === 'SPECIAL').map(toRow)

  return (
    <div className="space-y-4">
      {mandatory.length > 0 && (
        <Group title={FUND_PURPOSE_KIND_LABEL.MANDATORY ?? '의무투자'} rows={mandatory} />
      )}
      {main.length > 0 && <Group title={FUND_PURPOSE_KIND_LABEL.MAIN ?? '주목적'} rows={main} />}
      {special.length > 0 && (
        <Group title={FUND_PURPOSE_KIND_LABEL.SPECIAL ?? '특수목적'} rows={special} />
      )}
    </div>
  )
}

/** 한 구분(주목적/특수목적)의 목적 행 묶음. */
function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-2.5">
      <p className="text-body-sm font-semibold text-gray-700">{title}</p>
      {rows.map((r) => (
        <PurposeBar key={r.id} row={r} />
      ))}
    </div>
  )
}

/** 목적 한 건: 라벨 + 달성/목표 + 약정총액 축 위 달성 막대(목표 눈금 포함). */
function PurposeBar({ row }: { row: Row }) {
  const fill = Math.min(100, row.achievedPct)
  // 목표 달성률 = 약정대비 집행비율 ÷ 목표비율(목표를 100%로 본 달성 정도). 목표 미설정 시 null.
  const targetRate =
    row.targetPct != null && row.targetPct > 0 ? (row.achievedPct / row.targetPct) * 100 : null
  // 목표 도달(≥100%)은 성공색, 목표 초과(>100%)는 빨강으로 구분한다(텍스트·막대 공통).
  const met = targetRate != null && targetRate >= 100
  const exceeded = targetRate != null && targetRate > 100
  const accentText = exceeded ? 'text-danger' : met ? 'text-success' : 'text-gray-900'
  const accentBar = exceeded ? 'bg-danger' : met ? 'bg-success' : 'bg-brand'

  return (
    <div className="space-y-2.5 rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2.5">
      {/* 조건은 긴 참조 문구라 지표(달성률)·머리말보다 크지 않게 한 단계 낮춘다(위계 역전 방지). */}
      <p className="whitespace-pre-wrap break-words text-body-sm text-gray-800">{row.label}</p>

      {/* 지표 그룹: 헤더(라벨↔값) → 전체폭 막대 → 세부 캡션을 세로로 묶는다. */}
      <div className="space-y-1">
        {/* 헤더는 한 줄 안에서 크기를 하나로 두고, 라벨은 연하게·값은 굵게/색으로 위계를 준다. */}
        <div className="flex items-baseline justify-between gap-2 text-body-sm tabular-nums">
          <span className="text-gray-600">{targetRate != null ? '목표 달성률' : '집행률'}</span>
          <b className={accentText}>{(targetRate ?? row.achievedPct).toFixed(1)}%</b>
        </div>

        {/* 약정총액을 100% 축으로 삼은 달성 막대(전체폭). 목표비율 위치에 세로 눈금을 그린다. */}
        <div className="relative h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${accentBar}`}
            style={{ width: `${fill}%` }}
          />
          {row.targetPct != null && row.targetPct <= 100 && (
            <span
              className="absolute top-0 h-full w-px bg-gray-500"
              style={{ left: `${row.targetPct}%` }}
              aria-hidden
            />
          )}
        </div>

        {/* 세부: 약정대비 집행비율·목표비율·집행액. */}
        <p className="text-caption tabular-nums text-gray-500">
          집행 {row.achievedPct.toFixed(1)}%
          {row.targetPct != null && <> · 목표 {row.targetPct}%</>} · {formatEok(row.amount)}
        </p>
      </div>
    </div>
  )
}
