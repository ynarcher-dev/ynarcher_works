import { DataTable, EmptyValue, PanelCard, cardText, type Column } from '@ynarcher/ui'
import type { CustomerEntry, TractionEntry } from '@/features/startup/startupGrowth'

/** 지표 값 + 단위. 단위가 기업마다 달라(명·건·%·원) 카드 헤더가 아니라 값 옆에 붙는다. */
function Value({ row }: { row: TractionEntry }) {
  if (row.value == null || Number.isNaN(Number(row.value))) return <EmptyValue />
  return (
    <span>
      {Number(row.value).toLocaleString()}
      {row.unit ? <span className="text-gray-500"> {row.unit}</span> : null}
    </span>
  )
}

const tractionColumns: Column<TractionEntry>[] = [
  { key: 'period', header: '기준월', type: 'date', primary: true, render: (r) => r.period || <EmptyValue /> },
  { key: 'metric', header: '지표', type: 'text', render: (r) => r.metric || <EmptyValue /> },
  { key: 'value', header: '값', align: 'right', numeric: true, render: (r) => <Value row={r} /> },
]

const customerColumns: Column<CustomerEntry>[] = [
  { key: 'date', header: '시점', type: 'date', primary: true, render: (r) => r.date || <EmptyValue /> },
  { key: 'name', header: '고객', type: 'text', render: (r) => r.name || <EmptyValue /> },
  { key: 'kind', header: '형태', type: 'text', render: (r) => r.kind || <EmptyValue /> },
]

/** 성장 지표 카드와 같은 규격의 소형 표(차트 없는 카드라 위 여백만 준다). */
function Table<T>({ columns, rows, rowKey }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string }) {
  return (
    <div className="mt-1">
      <DataTable columns={columns} rows={rows} rowKey={rowKey} numbered={false} standardColumns={false} layout="fixed" />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-body text-gray-600">{text}</p>
}

/** 출처 표기(카드 헤더 우측). 확정 숫자와 자기 보고를 가르는 것은 자리가 아니라 이 한 줄이다. */
function Source({ text }: { text: string }) {
  return <span className={`shrink-0 ${cardText.subtitle}`}>({text})</span>
}

/**
 * 핵심 지표(트랙션) 카드 — 실적 밴드 첫 줄 왼쪽.
 *
 * 매출 이전 단계의 증거를 담는 자리다. 발굴·초기 기업일수록 재무·매출 표가 비어 있어, 사실을
 * 말하는 유일한 카드가 여기다. 그래서 실적 밴드에서 매출보다 **위**에 선다 — 순서는 신뢰도순이
 * 아니라 읽는 순서이고, 확정 숫자와의 무게 차이는 헤더의 출처 표기(`기업 제시`)가 진다.
 *
 * 지표명을 고정 열로 못 박지 않는 이유는 `startupGrowth.ts`가 설명한다(기업마다 세는 것이 다르다).
 */
export function StartupTractionCard({ traction }: { traction: TractionEntry[] }) {
  return (
    <PanelCard title="핵심 지표 (최신 8건)" action={<Source text="기업 제시" />}>
      {traction.length === 0 ? (
        <Empty text="등록된 핵심 지표가 없습니다." />
      ) : (
        <Table
          columns={tractionColumns}
          rows={traction.slice(0, 8)}
          rowKey={(r) => `${r.period}-${r.metric}`}
        />
      )}
    </PanelCard>
  )
}

/**
 * 주요 고객·레퍼런스 카드 — 핵심 지표 옆.
 *
 * 계약·MOU·POC는 무게가 전혀 다른 사실이라 형태를 값으로 함께 받는다(고객 수만 세면
 * MOU 열 건이 계약 한 건보다 커 보인다).
 */
export function StartupCustomerCard({ customers }: { customers: CustomerEntry[] }) {
  return (
    <PanelCard title="주요 고객·레퍼런스 (최신 8건)" action={<Source text="기업 제시" />}>
      {customers.length === 0 ? (
        <Empty text="등록된 고객·레퍼런스가 없습니다." />
      ) : (
        <Table
          columns={customerColumns}
          rows={customers.slice(0, 8)}
          rowKey={(r) => `${r.date ?? ''}-${r.name}-${r.kind ?? ''}`}
        />
      )}
    </PanelCard>
  )
}
