import { Button, Input, Select, cn } from '@ynarcher/ui'
import { Fragment, useState } from 'react'
import { Cell, RowActions, RowBox } from '@/features/startup/StartupFieldLabel'
import {
  CUSTOMER_KIND_OPTIONS,
  type BusinessStatusEntry,
  type CustomerEntry,
  type EmployeeEntry,
  type FinanceEntry,
  type InvestmentEntry,
  type RevenueEntry,
  type TractionEntry,
} from '@/features/startup/startupGrowth'

/**
 * 통합 수정 폼의 '실적' 입력 섹션들.
 *
 * 한때 이 파일은 카드 하나(`실적 지표`)에 일곱 묶음(연혁·트랙션·고객·매출·재무·고용·투자)을
 * 소제목으로 나눠 담았다. 조회 화면이 그 일곱을 **카드 일곱 장**으로 세우는데 편집은 한 장이라,
 * 방금 적은 값이 어느 카드로 가는지 화면이 답하지 못했다(2026-09-06 분리). 카드가 곧 묶음의
 * 단위라는 규칙은 조회와 편집 양쪽에 같이 적용된다 — 그래서 여기 있는 것들은 제목을 갖지 않는다.
 * 제목은 폼이 세우는 `PanelCard`가 소유한다.
 */

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
    <label className="block min-w-0">
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
    <label className="block min-w-0">
      <span className="mb-0.5 block text-caption text-gray-700">{label}</span>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

interface NumCol {
  key: string
  label: string
}

/**
 * 연도 기준 숫자 지표(재무/매출/고용) 편집기. 헤더 1행 + 연도별 값 행을 그리드로 정렬한다.
 *
 * 이 형태만은 항목 상자로 바꾸지 않는다 — 연도를 **세로로 견주며** 넣는 입력이라 열이 정렬돼야
 * 작년 값과 올해 값이 눈으로 맞고, 상자로 흩으면 그 비교가 사라진다. 대신 이 카드를 쓰는 자리는
 * 폼에서 두 칸을 다 받는다(절반 폭에서는 금액 칸이 여덟 자를 담지 못한다).
 */
function YearMetricGroup<T extends { year: number }>({
  cols,
  rows,
  setRows,
}: {
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

/** 연혁(월 기준 서술) 편집기. */
export function StartupTimelineFields({
  rows,
  setRows,
}: {
  rows: BusinessStatusEntry[]
  setRows: (rows: BusinessStatusEntry[]) => void
}) {
  const patch = (i: number, p: Partial<BusinessStatusEntry>) =>
    setRows(rows.map((s, idx) => (idx === i ? { ...s, ...p } : s)))
  return (
    <div className="space-y-2">
      {rows.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Input 래퍼가 w-full이라 폭 클래스는 바깥 div에 준다. 선택은 월(YYYY-MM)까지만. */}
          <div className="w-40 shrink-0">
            <Input type="month" value={s.date ?? ''} onChange={(e) => patch(i, { date: e.target.value })} />
          </div>
          <div className="min-w-0 flex-1">
            <Input
              placeholder="현황 내용"
              value={s.content ?? ''}
              onChange={(e) => patch(i, { content: e.target.value })}
            />
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
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { date: '', content: '' }])}>
        현황 추가
      </Button>
    </div>
  )
}

/**
 * 핵심 지표(트랙션) 편집기. 지표명을 값으로 받는 이유는 기업마다 세는 것이 달라서다 —
 * 고정 열(MAU·재구매율…)로 못 박으면 그 기업이 세지 않는 지표가 늘 빈 칸으로 남는다.
 * 같은 지표를 여러 달 적으면 조회 화면이 기준월 내림차순으로 묶어 보여준다.
 */
export function StartupTractionFields({
  rows,
  setRows,
}: {
  rows: TractionEntry[]
  setRows: (rows: TractionEntry[]) => void
}) {
  const patch = (i: number, p: Partial<TractionEntry>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <RowBox key={i}>
          <Cell label="기준월">
            <Input type="month" value={r.period ?? ''} onChange={(e) => patch(i, { period: e.target.value })} />
          </Cell>
          <Txt label="지표명" value={r.metric} onChange={(v) => patch(i, { metric: v })} />
          <Num label="값" value={r.value} onChange={(v) => patch(i, { value: v })} />
          <Txt label="단위" value={r.unit} onChange={(v) => patch(i, { unit: v })} />
          <RowActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            >
              삭제
            </Button>
          </RowActions>
        </RowBox>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { metric: '', period: '' }])}>
        지표 추가
      </Button>
    </div>
  )
}

/**
 * 주요 고객·레퍼런스 편집기. 형태(계약·MOU·POC)를 함께 받는 이유는 무게가 전혀 다른 사실이라서다 —
 * 고객 수만 세면 MOU 열 건이 계약 한 건보다 커 보인다.
 */
export function StartupCustomerFields({
  rows,
  setRows,
}: {
  rows: CustomerEntry[]
  setRows: (rows: CustomerEntry[]) => void
}) {
  const patch = (i: number, p: Partial<CustomerEntry>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <RowBox key={i}>
          <Cell label="시점">
            <Input type="month" value={r.date ?? ''} onChange={(e) => patch(i, { date: e.target.value })} />
          </Cell>
          <Cell label="형태">
            <Select value={r.kind ?? ''} onChange={(e) => patch(i, { kind: e.target.value })}>
              <option value="">선택</option>
              {CUSTOMER_KIND_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Cell>
          <Cell label="고객명" wide>
            <Input value={r.name ?? ''} onChange={(e) => patch(i, { name: e.target.value })} />
          </Cell>
          <RowActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            >
              삭제
            </Button>
          </RowActions>
        </RowBox>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { name: '', kind: '', date: '' }])}>
        고객 추가
      </Button>
    </div>
  )
}

/** 매출/손익(연도 기준) 편집기. */
export function StartupRevenueFields({
  rows,
  setRows,
}: {
  rows: RevenueEntry[]
  setRows: (rows: RevenueEntry[]) => void
}) {
  return <YearMetricGroup<RevenueEntry> cols={REVENUE_COLS} rows={rows} setRows={setRows} />
}

/** 재무(연도 기준) 편집기. */
export function StartupFinanceFields({
  rows,
  setRows,
}: {
  rows: FinanceEntry[]
  setRows: (rows: FinanceEntry[]) => void
}) {
  return <YearMetricGroup<FinanceEntry> cols={FINANCE_COLS} rows={rows} setRows={setRows} />
}

/** 고용(연도 기준) 편집기. */
export function StartupEmployeeFields({
  rows,
  setRows,
}: {
  rows: EmployeeEntry[]
  setRows: (rows: EmployeeEntry[]) => void
}) {
  return <YearMetricGroup<EmployeeEntry> cols={EMPLOYEE_COLS} rows={rows} setRows={setRows} />
}

/** 투자 유치 편집기(월 기준). 회계연도와 무관하게 건별 상자로 관리한다. */
export function StartupInvestmentFields({
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
      {rows.map((r, i) => (
        <RowBox key={i}>
          <Cell label="기준월">
            <Input type="month" value={r.date ?? ''} onChange={(e) => patch(i, { date: e.target.value })} />
          </Cell>
          <Txt label="라운드" value={r.round} onChange={(v) => patch(i, { round: v })} />
          <Cell label="투자자" wide>
            <Input value={r.investor ?? ''} onChange={(e) => patch(i, { investor: e.target.value })} />
          </Cell>
          <Num label="기업 가치(Pre)" value={r.valuation} onChange={(v) => patch(i, { valuation: v })} />
          <Num label="투자유치액" value={r.fundingAmount} onChange={(v) => patch(i, { fundingAmount: v })} />
          <RowActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            >
              삭제
            </Button>
          </RowActions>
        </RowBox>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { date: '' }])}>
        투자 추가
      </Button>
    </div>
  )
}
