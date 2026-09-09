import { Input, Select } from '@ynarcher/ui'
import { ItemRows, patchAt, removeAt, type ItemCol } from '@/components/ItemRows'
import { NumberInput, numOrUndef } from '@/components/FormRowFields'
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
 *
 * **일곱 묶음이 모두 같은 모양(`ItemRows`)으로 선다**(2026-09-09). 그 전에는 연도 표(매출·재무·
 * 고용)만 줄 표였고 나머지는 항목 상자였으며 연혁은 또 다른 flex 한 줄이었다 — 같은 카드 안에서
 * 목록의 모양이 셋이면 어느 것이 규격인지 화면이 답하지 못한다.
 */

/** 연도 기준 숫자 지표(매출·재무·고용)의 항목 열. */
interface NumCol {
  key: string
  label: string
}

/**
 * 연도 기준 숫자 지표 편집기.
 *
 * 이 형태가 목록 전부의 본이 됐다 — 연도를 **세로로 견주며** 넣는 입력이라 열이 정렬돼야 작년
 * 값과 올해 값이 눈으로 맞고, 항목 상자로 흩으면 그 비교가 사라진다. 2026-09-09에 나머지 목록도
 * 같은 모양으로 모으면서, 이 함수는 `ItemRows`에 열 정의만 넘기는 얇은 겉면이 됐다.
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
  const itemCols: ItemCol[] = [
    { label: '연도', kind: 'short' },
    ...cols.map((c): ItemCol => ({ label: c.label, kind: 'num' })),
  ]
  const get = (r: T, k: string) => (r as Record<string, number | null | undefined>)[k]
  return (
    <ItemRows
      cols={itemCols}
      rows={rows}
      onRemove={(i) => setRows(removeAt(rows, i))}
      onAdd={() => setRows([...rows, { year: new Date().getFullYear() } as T])}
      addLabel="연도 추가"
    >
      {(row, i) => {
        const patch = (p: Partial<T>) => setRows(patchAt(rows, i, p))
        return (
          <>
            <Input
              type="number"
              value={row.year ?? ''}
              onChange={(e) => patch({ year: numOrUndef(e.target.value) ?? 0 } as Partial<T>)}
            />
            {cols.map((c) => (
              <NumberInput key={c.key} value={get(row, c.key)} onChange={(v) => patch({ [c.key]: v } as Partial<T>)} />
            ))}
          </>
        )
      }}
    </ItemRows>
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

const TIMELINE_COLS: ItemCol[] = [
  { label: '시점', kind: 'date' },
  { label: '현황 내용' },
]

const TRACTION_COLS: ItemCol[] = [
  { label: '기준월', kind: 'date' },
  { label: '지표명' },
  { label: '값', kind: 'num' },
  { label: '단위', kind: 'short' },
]

const CUSTOMER_COLS: ItemCol[] = [
  { label: '시점', kind: 'date' },
  { label: '형태', kind: 'pick' },
  { label: '고객명' },
]

const INVESTMENT_COLS: ItemCol[] = [
  { label: '기준월', kind: 'date' },
  { label: '라운드', kind: 'name' },
  { label: '투자자' },
  { label: '기업 가치(Pre)', kind: 'num' },
  { label: '투자유치액', kind: 'num' },
]

/** 연혁(월 기준 서술) 편집기. */
export function StartupTimelineFields({
  rows,
  setRows,
}: {
  rows: BusinessStatusEntry[]
  setRows: (rows: BusinessStatusEntry[]) => void
}) {
  return (
    <ItemRows
      cols={TIMELINE_COLS}
      rows={rows}
      onRemove={(i) => setRows(removeAt(rows, i))}
      onAdd={() => setRows([...rows, { date: '', content: '' }])}
      addLabel="현황 추가"
    >
      {(row, i) => {
        const patch = (p: Partial<BusinessStatusEntry>) => setRows(patchAt(rows, i, p))
        return (
          <>
            {/* 선택은 월(YYYY-MM)까지만 — 연혁은 날짜가 아니라 시기의 기록이다. */}
            <Input type="month" value={row.date ?? ''} onChange={(e) => patch({ date: e.target.value })} />
            <Input
              placeholder="현황 내용"
              value={row.content ?? ''}
              onChange={(e) => patch({ content: e.target.value })}
            />
          </>
        )
      }}
    </ItemRows>
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
  return (
    <ItemRows
      cols={TRACTION_COLS}
      rows={rows}
      onRemove={(i) => setRows(removeAt(rows, i))}
      onAdd={() => setRows([...rows, { metric: '', period: '' }])}
      addLabel="지표 추가"
    >
      {(row, i) => {
        const patch = (p: Partial<TractionEntry>) => setRows(patchAt(rows, i, p))
        return (
          <>
            <Input type="month" value={row.period ?? ''} onChange={(e) => patch({ period: e.target.value })} />
            <Input value={row.metric ?? ''} onChange={(e) => patch({ metric: e.target.value })} />
            <NumberInput value={row.value} onChange={(v) => patch({ value: v })} />
            <Input value={row.unit ?? ''} onChange={(e) => patch({ unit: e.target.value })} />
          </>
        )
      }}
    </ItemRows>
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
  return (
    <ItemRows
      cols={CUSTOMER_COLS}
      rows={rows}
      onRemove={(i) => setRows(removeAt(rows, i))}
      onAdd={() => setRows([...rows, { name: '', kind: '', date: '' }])}
      addLabel="고객 추가"
    >
      {(row, i) => {
        const patch = (p: Partial<CustomerEntry>) => setRows(patchAt(rows, i, p))
        return (
          <>
            <Input type="month" value={row.date ?? ''} onChange={(e) => patch({ date: e.target.value })} />
            <Select value={row.kind ?? ''} onChange={(e) => patch({ kind: e.target.value })}>
              <option value="">선택</option>
              {CUSTOMER_KIND_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
            <Input value={row.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
          </>
        )
      }}
    </ItemRows>
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

/** 투자 유치 편집기(월 기준). 회계연도와 무관하게 건별로 관리한다. */
export function StartupInvestmentFields({
  rows,
  setRows,
}: {
  rows: InvestmentEntry[]
  setRows: (rows: InvestmentEntry[]) => void
}) {
  return (
    <ItemRows
      cols={INVESTMENT_COLS}
      rows={rows}
      onRemove={(i) => setRows(removeAt(rows, i))}
      onAdd={() => setRows([...rows, { date: '' }])}
      addLabel="투자 추가"
    >
      {(row, i) => {
        const patch = (p: Partial<InvestmentEntry>) => setRows(patchAt(rows, i, p))
        return (
          <>
            <Input type="month" value={row.date ?? ''} onChange={(e) => patch({ date: e.target.value })} />
            <Input value={row.round ?? ''} onChange={(e) => patch({ round: e.target.value })} />
            <Input value={row.investor ?? ''} onChange={(e) => patch({ investor: e.target.value })} />
            <NumberInput value={row.valuation} onChange={(v) => patch({ valuation: v })} />
            <NumberInput value={row.fundingAmount} onChange={(v) => patch({ fundingAmount: v })} />
          </>
        )
      }}
    </ItemRows>
  )
}
