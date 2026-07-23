import { Button, cardText, cn, Input } from '@ynarcher/ui'
import { Fragment, useState } from 'react'
import type {
  BusinessStatusEntry,
  EmployeeEntry,
  FinanceEntry,
  GrowthMetrics,
  InvestmentEntry,
  RevenueEntry,
} from '@/features/startup/startupGrowth'

/** 빈 문자열 → undefined, 그 외 숫자로 파싱(콤마 허용). */
function numOrUndef(s: string): number | undefined {
  if (s.trim() === '') return undefined
  const n = Number(s.replace(/,/g, ''))
  return Number.isNaN(n) ? undefined : n
}

/**
 * 천단위 콤마 표시 + 우측정렬 숫자 입력. number 타입은 콤마를 못 넣으므로 text로 처리한다.
 * 편집 중에는 입력한 원문을 그대로 두어(음수 '-' 입력·캐럿 튐 방지) 콤마 없이 보이고,
 * 포커스가 빠질 때 저장값을 콤마 포맷으로 다시 그린다.
 */
function NumberInput({
  value,
  onChange,
  className,
}: {
  value?: number | null
  onChange: (v: number | undefined) => void
  className?: string
}) {
  const [typing, setTyping] = useState<string | null>(null)
  const formatted = value == null || Number.isNaN(Number(value)) ? '' : Number(value).toLocaleString()
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={cn('text-right tabular-nums', className)}
      value={typing ?? formatted}
      onChange={(e) => {
        setTyping(e.target.value)
        onChange(numOrUndef(e.target.value))
      }}
      onBlur={() => setTyping(null)}
    />
  )
}

/** 숫자 입력 셀(라벨 + number Input). */
function Num({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number | null
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-caption text-gray-700">{label}</span>
      <NumberInput value={value} onChange={onChange} />
    </label>
  )
}

/** 텍스트 입력 셀(라벨 + text Input). */
function Txt({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-caption text-gray-700">{label}</span>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** 연도 기준 숫자 지표(재무/매출/고용) 편집기. 헤더 1행 + 연도별 값 행을 그리드로 정렬한다. */
interface NumCol {
  key: string
  label: string
}
function YearMetricGroup<T extends { year: number }>({
  title,
  cols,
  rows,
  setRows,
}: {
  title: string
  cols: NumCol[]
  rows: T[]
  setRows: (rows: T[]) => void
}) {
  const patch = (i: number, p: Partial<T>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  const get = (r: T, k: string) => (r as Record<string, number | null | undefined>)[k]
  // 연도 + 각 항목 + 삭제 버튼 열. 헤더/값 행이 같은 그리드라 자동 정렬된다.
  const gridStyle = { gridTemplateColumns: `5.5rem repeat(${cols.length}, minmax(0,1fr)) auto` }
  return (
    <div className="space-y-2">
      <h3 className={cardText.subhead}>{title}</h3>
      {rows.length > 0 && (
        <div className="grid items-center gap-x-2 gap-y-1.5" style={gridStyle}>
          <span className="text-caption text-gray-700">연도</span>
          {cols.map((c) => (
            <span key={c.key} className="text-caption text-gray-700">
              {c.label}
            </span>
          ))}
          <span aria-hidden />
          {rows.map((r, i) => (
            <Fragment key={i}>
              <Input
                type="number"
                value={r.year ?? ''}
                onChange={(e) => patch(i, { year: numOrUndef(e.target.value) ?? 0 } as Partial<T>)}
              />
              {cols.map((c) => (
                <NumberInput
                  key={c.key}
                  value={get(r, c.key)}
                  onChange={(v) => patch(i, { [c.key]: v } as Partial<T>)}
                />
              ))}
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              >
                삭제
              </Button>
            </Fragment>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => setRows([...rows, { year: new Date().getFullYear() } as T])}
      >
        연도 추가
      </Button>
    </div>
  )
}

/** 투자 유치 편집기(월 기준). 회계연도와 무관하게 건별 카드로 관리한다. */
function InvestmentGroup({
  rows,
  setRows,
}: {
  rows: InvestmentEntry[]
  setRows: (rows: InvestmentEntry[]) => void
}) {
  const patch = (i: number, p: Partial<InvestmentEntry>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  return (
    <div className="space-y-2">
      <h3 className={cardText.subhead}>투자</h3>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 rounded-radius-md border border-gray-200 p-3">
          <label className="block w-32 shrink-0">
            <span className="mb-0.5 block text-caption text-gray-700">기준월</span>
            <Input type="month" value={r.date ?? ''} onChange={(e) => patch(i, { date: e.target.value })} />
          </label>
          <div className="min-w-28 flex-1">
            <Txt label="라운드" value={r.round} onChange={(v) => patch(i, { round: v })} />
          </div>
          <div className="min-w-28 flex-1">
            <Txt label="투자자" value={r.investor} onChange={(v) => patch(i, { investor: v })} />
          </div>
          <div className="min-w-32 flex-1">
            <Num label="기업 가치(Pre)" value={r.valuation} onChange={(v) => patch(i, { valuation: v })} />
          </div>
          <div className="min-w-32 flex-1">
            <Num label="투자유치액" value={r.fundingAmount} onChange={(v) => patch(i, { fundingAmount: v })} />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
          >
            삭제
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { date: '' }])}>
        투자 추가
      </Button>
    </div>
  )
}

interface Props {
  growth: GrowthMetrics
  setGrowth: (g: GrowthMetrics) => void
  businessStatus: BusinessStatusEntry[]
  setBusinessStatus: (b: BusinessStatusEntry[]) => void
}

/** 재무/매출/고용 카드의 항목 열 정의. */
const FINANCE_COLS: NumCol[] = [
  { key: 'assets', label: '자산' },
  { key: 'liabilities', label: '부채' },
  { key: 'equity', label: '자본' },
]
const REVENUE_COLS: NumCol[] = [
  { key: 'revenue', label: '매출액' },
  { key: 'operatingProfit', label: '영업이익' },
  { key: 'netIncome', label: '당기순이익' },
]
const EMPLOYEE_COLS: NumCol[] = [{ key: 'employeeCount', label: '고용 인원' }]

/**
 * 통합 수정 폼의 '성장 지표' 입력 섹션.
 * 연혁(월 기준)과 항목별 지표(재무·매출·고용은 연도 기준, 투자는 월 기준)를 각각 목록으로 편집한다.
 * 저장은 상위 폼이 growth_metrics(항목별 객체) / business_status(jsonb)로 통째 반영한다.
 */
export function StartupGrowthFields({ growth, setGrowth, businessStatus, setBusinessStatus }: Props) {
  const patchStatus = (i: number, patch: Partial<BusinessStatusEntry>) =>
    setBusinessStatus(businessStatus.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  return (
    <div className="space-y-5">
      {/* 연혁 */}
      <div className="space-y-2">
        <h3 className={cardText.subhead}>연혁</h3>
        {businessStatus.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            {/* Input 래퍼가 w-full이라 폭 클래스는 바깥 div에 준다. 선택은 월(YYYY-MM)까지만. */}
            <div className="w-40 shrink-0">
              <Input
                type="month"
                value={s.date ?? ''}
                onChange={(e) => patchStatus(i, { date: e.target.value })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Input
                placeholder="현황 내용"
                value={s.content ?? ''}
                onChange={(e) => patchStatus(i, { content: e.target.value })}
              />
            </div>
            <Button type="button" variant="secondary" className="shrink-0" onClick={() => setBusinessStatus(businessStatus.filter((_, idx) => idx !== i))}>
              삭제
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setBusinessStatus([...businessStatus, { date: '', content: '' }])}
        >
          현황 추가
        </Button>
      </div>

      {/* 항목별 지표: 재무·매출·고용(연도 기준) + 투자(월 기준) */}
      <YearMetricGroup<FinanceEntry>
        title="재무"
        cols={FINANCE_COLS}
        rows={growth.finance}
        setRows={(finance) => setGrowth({ ...growth, finance })}
      />
      <YearMetricGroup<RevenueEntry>
        title="매출/손익"
        cols={REVENUE_COLS}
        rows={growth.revenue}
        setRows={(revenue) => setGrowth({ ...growth, revenue })}
      />
      <YearMetricGroup<EmployeeEntry>
        title="고용"
        cols={EMPLOYEE_COLS}
        rows={growth.employee}
        setRows={(employee) => setGrowth({ ...growth, employee })}
      />
      <InvestmentGroup rows={growth.investment} setRows={(investment) => setGrowth({ ...growth, investment })} />
    </div>
  )
}
