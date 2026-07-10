import { Badge, Button, Spinner } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { readBusiness } from '@/features/startup/StartupBusinessTeamCard'
import { formatFounded, readIndustries, readMetrics, type GrowthMetric } from '@/features/startup/startupGrowth'
import type { EntityRow } from '@/features/networks/hooks'

/** 레코드의 텍스트 필드를 안전하게 문자열로 읽는다(없으면 빈 문자열). */
function txt(record: EntityRow | null | undefined, key: string): string {
  const v = record?.[key]
  return v == null || v === '' ? '' : String(v)
}

/** 투자 정보(가치·유치액·라운드·투자자)가 있는 가장 최신 연도 지표를 고른다. */
function latestInvestment(record: EntityRow | null): GrowthMetric | undefined {
  if (!record) return undefined
  return readMetrics(record).find(
    (m) =>
      m.valuation != null ||
      m.fundingAmount != null ||
      (m.fundingRound ?? '').trim() !== '' ||
      (m.investor ?? '').trim() !== '',
  )
}

/** 금액(천원 단위, ÷1000 반올림) 텍스트. 값 없으면 빈값 문구(empty). 음수는 ▼로 표기. */
function wonK(v: number | null | undefined, empty: string): { text: string; negative: boolean } {
  if (v == null || Number.isNaN(Number(v))) return { text: empty, negative: false }
  const n = Math.round(Number(v) / 1000)
  if (n < 0) return { text: `▼${Math.abs(n).toLocaleString()}`, negative: true }
  return { text: n.toLocaleString(), negative: false }
}

/**
 * 비교 표의 한쪽(A 또는 B) 값 셀. 금액(천원)/인원(명) 단위, 열 내 중앙정렬.
 * empty: 값이 없을 때 표기 — 데이터 미입력은 '정보 없음', 비교군 미선택 열은 '-'.
 */
function Val({ v, unit, empty }: { v?: number | null; unit: 'won' | 'count'; empty: string }) {
  if (unit === 'count') {
    const text = v == null || Number.isNaN(Number(v)) ? empty : `${Number(v).toLocaleString()}명`
    return <span className="block min-w-0 truncate text-center text-caption tabular-nums text-gray-800">{text}</span>
  }
  const { text, negative } = wonK(v, empty)
  return (
    <span className={`block min-w-0 truncate text-center text-caption tabular-nums ${negative ? 'text-danger' : 'text-gray-800'}`}>
      {text}
    </span>
  )
}

/**
 * A값 · (중앙 항목명) · B값 한 줄. 중앙 항목열은 고정폭(6rem)이라 모든 행의 A/B 값 열이
 * 동일한 크기로 정렬되고, 항목열 양옆 옅은 세로 가이드로 A/B 열을 구분한다.
 * aEmpty/bEmpty: 각 열의 빈값 문구(비교군 미선택 열은 '-').
 */
function Row({
  label,
  a,
  b,
  unit = 'won',
  aEmpty,
  bEmpty,
}: {
  label: string
  a?: number | null
  b?: number | null
  unit?: 'won' | 'count'
  aEmpty: string
  bEmpty: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] items-center gap-2 py-1.5">
      <Val v={a} unit={unit} empty={aEmpty} />
      <span className="whitespace-nowrap border-x border-gray-100 px-1.5 text-center text-caption text-gray-400">
        {label}
      </span>
      <Val v={b} unit={unit} empty={bEmpty} />
    </div>
  )
}

/**
 * A · (중앙 항목명) · B 텍스트 한 줄(소개·대표자·설립일·연도·라운드 등).
 * aEmpty/bEmpty: 각 열의 빈값 문구(비교군 미선택 열은 '-').
 */
function TextRow({
  label,
  a,
  b,
  aEmpty,
  bEmpty,
}: {
  label: string
  a?: string
  b?: string
  aEmpty: string
  bEmpty: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] items-stretch gap-2 py-1.5">
      <span className="min-w-0 self-center break-words text-center text-caption text-gray-800">{a || aEmpty}</span>
      <span className="flex items-center justify-center whitespace-nowrap border-x border-gray-100 px-1.5 text-center text-caption text-gray-400">
        {label}
      </span>
      <span className="min-w-0 self-center break-words text-center text-caption text-gray-800">{b || bEmpty}</span>
    </div>
  )
}

/** 지표 그룹(밴드형 제목 + 행 묶음). 재무/매출/고용/투자를 시각적으로 확실히 분리한다. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="rounded-radius-sm bg-gray-50 px-2.5 py-1 text-caption font-semibold text-gray-500">
        {title}
      </p>
      <div className="mt-0.5 divide-y divide-gray-50">{children}</div>
    </div>
  )
}

/** 기업 헤더(로고·이름·산업·기준연도). 중앙 정렬 스택. onClear 시 썸네일 우상단에 해제(X) 배지. */
function CompanyHead({ record, year, onClear }: { record: EntityRow; year?: number; onClear?: () => void }) {
  const logo = record.logo_url ? String(record.logo_url) : null
  const industries = readIndustries(record)
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="relative">
        <PhotoBox src={logo} className="size-12 rounded-radius-md" />
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="비교기업 해제"
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-danger text-white shadow-soft transition-opacity hover:opacity-80"
          >
            <X className="size-3.5" strokeWidth={3} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-1.5 w-full truncate text-body font-bold text-gray-900">{record.name}</p>
      {industries.length > 0 && (
        <div className="mt-0.5 flex flex-wrap justify-center gap-1">
          {industries.map((ind) => (
            <Badge key={ind} tone="neutral" size="sm">
              {ind}
            </Badge>
          ))}
        </div>
      )}
      {year != null ? (
        <span className="mt-0.5 text-caption text-gray-400">{year}</span>
      ) : (
        <span className="mt-0.5 text-caption text-gray-300">기준연도 정보 없음</span>
      )}
    </div>
  )
}

/** 비교기업 미선택/로딩 시의 B 헤더(중앙 '기업 선택' 버튼 또는 스피너). */
function PlaceholderHead({ loading, onSelect }: { loading?: boolean; onSelect: () => void }) {
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-2 text-center">
      {loading ? (
        <Spinner />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={onSelect}>
          <Plus className="mr-1 size-3.5" aria-hidden />
          비교기업 선택
        </Button>
      )}
    </div>
  )
}

interface Props {
  /** 좌측(A) — 현재 보고 있는 기업. */
  a: EntityRow
  /** 우측(B) — 비교기업. 미선택 시 null. */
  b: EntityRow | null
  /** B 조회 중 여부(선택했으나 로딩 중). */
  bLoading?: boolean
  /** B 미선택 상태에서 '기업 선택'. */
  onSelectB: () => void
  /** B 선택 해제(썸네일 우상단 X). */
  onClearB: () => void
}

/**
 * 기업 비교 카드(단일 카드, 좌우 비교). 상단에 A·B 기업 헤더를 좌우로 두고,
 * 그 아래 각 지표를 'A값 · 항목 · B값' 한 줄로 나란히 비교한다.
 * 지표는 성장 지표 최신 1개년(A·B 각자의 기준연도)을 사용하며 금액 단위는 천원.
 */
export function StartupCompareCard({ a, b, bLoading, onSelectB, onClearB }: Props) {
  const ma: GrowthMetric | undefined = readMetrics(a)[0]
  const mb: GrowthMetric | undefined = b ? readMetrics(b)[0] : undefined
  // 투자 현황은 재무연도와 별개로, 투자 정보가 있는 가장 최신 연도를 기준으로 표기한다.
  const ia = latestInvestment(a)
  const ib = latestInvestment(b)
  // 빈값 문구: 현재 기업(A)은 항상 존재하므로 '정보 없음', 비교기업(B)은 미선택 시 '-'.
  const aEmpty = '정보 없음'
  const bEmpty = b ? '정보 없음' : '-'
  // 설립일은 formatFounded가 자체적으로 '정보 없음'을 반환하므로, B 미선택 시에는 '-'로 대체.
  const foundedB = b ? formatFounded(b.founded_on) : '-'

  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      <h3 className="mb-4 text-body font-semibold text-gray-900">기업 비교</h3>

      {/* 기업 헤더: A · VS · B — 두 기업을 각자 테두리 박스로 분리(기업 VS 기업) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-radius-md border border-gray-200 bg-white p-3">
          <CompanyHead record={a} year={ma?.year} />
        </div>
        <span className="self-center text-caption font-semibold text-gray-300" aria-hidden>
          VS
        </span>
        <div className="rounded-radius-md border border-gray-200 bg-white p-3">
        {b ? (
          <CompanyHead record={b} year={mb?.year} onClear={onClearB} />
        ) : (
          <PlaceholderHead loading={bLoading} onSelect={onSelectB} />
        )}
        </div>
      </div>

      {/* 지표 비교 표: A값 · 항목 · B값 (그룹별 밴드로 섹션 구분) */}
      <div className="mt-4 space-y-3">
        <Group title="기업 정보">
          <TextRow label="소개" a={readBusiness(a).oneLiner} b={b ? readBusiness(b).oneLiner : ''} aEmpty={aEmpty} bEmpty={bEmpty} />
          <TextRow label="대표자" a={txt(a, 'representative')} b={txt(b, 'representative')} aEmpty={aEmpty} bEmpty={bEmpty} />
          <TextRow label="설립일" a={formatFounded(a.founded_on)} b={foundedB} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <p className="text-right text-caption text-gray-400">단위: 천원</p>
        <Group title="재무 현황">
          <Row label="자산" a={ma?.assets} b={mb?.assets} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="부채" a={ma?.liabilities} b={mb?.liabilities} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="자본" a={ma?.equity} b={mb?.equity} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <Group title="매출 현황">
          <Row label="매출액" a={ma?.revenue} b={mb?.revenue} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="영업이익" a={ma?.operatingProfit} b={mb?.operatingProfit} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="당기순이익" a={ma?.netIncome} b={mb?.netIncome} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <Group title="고용 현황">
          <Row label="고용 인원" a={ma?.employeeCount} b={mb?.employeeCount} unit="count" aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <Group title="투자 현황">
          <TextRow label="연도" a={ia?.year ? String(ia.year) : ''} b={ib?.year ? String(ib.year) : ''} aEmpty={aEmpty} bEmpty={bEmpty} />
          <TextRow label="라운드" a={ia?.fundingRound} b={ib?.fundingRound} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="기업가치(Pre)" a={ia?.valuation} b={ib?.valuation} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="투자유치액" a={ia?.fundingAmount} b={ib?.fundingAmount} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>
      </div>
    </section>
  )
}
