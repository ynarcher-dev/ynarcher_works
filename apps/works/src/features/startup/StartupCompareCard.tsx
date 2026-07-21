import { Badge, Button, PanelCard, Spinner } from '@ynarcher/ui'
import { Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { PhotoBox } from '@/features/networks/PhotoBox'
import { readBusiness } from '@/features/startup/StartupBusinessTeamCard'
import { formatFounded, readIndustries, readGrowth } from '@/features/startup/startupGrowth'
import type { EntityRow } from '@/features/networks/hooks'

/** 레코드의 텍스트 필드를 안전하게 문자열로 읽는다(없으면 빈 문자열). */
function txt(record: EntityRow | null | undefined, key: string): string {
  const v = record?.[key]
  return v == null || v === '' ? '' : String(v)
}

/** 금액(천원 단위, ÷1000 반올림) 텍스트. 값 없으면 빈값 문구(empty). 음수는 국내 관례대로 파란색 '-'로 표기. */
function wonK(v: number | null | undefined, empty: string): { text: string; negative: boolean } {
  if (v == null || Number.isNaN(Number(v))) return { text: empty, negative: false }
  const n = Math.round(Number(v) / 1000)
  if (n < 0) return { text: `-${Math.abs(n).toLocaleString()}`, negative: true }
  return { text: n.toLocaleString(), negative: false }
}

/**
 * 비교 표의 한쪽(A 또는 B) 값 셀. 금액(천원)/인원(명) 단위, 열 내 중앙정렬.
 * empty: 값이 없을 때 표기 — 데이터 미입력은 '정보 없음', 비교군 미선택 열은 '-'.
 */
function Val({ v, unit, empty }: { v?: number | null; unit: 'won' | 'count'; empty: string }) {
  if (unit === 'count') {
    const text = v == null || Number.isNaN(Number(v)) ? empty : `${Number(v).toLocaleString()}명`
    return <span className="block min-w-0 truncate text-center text-caption font-medium tabular-nums text-gray-900">{text}</span>
  }
  const { text, negative } = wonK(v, empty)
  return (
    <span className={`block min-w-0 truncate text-center text-caption font-medium tabular-nums ${negative ? 'text-info' : 'text-gray-900'}`}>
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
      <span className="whitespace-nowrap border-x border-gray-100 px-1.5 text-center text-caption text-gray-500">
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
      <span className="min-w-0 self-center break-words text-center text-caption font-medium text-gray-900">{a || aEmpty}</span>
      <span className="flex items-center justify-center whitespace-nowrap border-x border-gray-100 px-1.5 text-center text-caption text-gray-500">
        {label}
      </span>
      <span className="min-w-0 self-center break-words text-center text-caption font-medium text-gray-900">{b || bEmpty}</span>
    </div>
  )
}

/** 지표 그룹(밴드형 제목 + 행 묶음). 재무/매출/고용/투자를 시각적으로 확실히 분리한다. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="rounded-radius-sm bg-gray-50 px-2.5 py-1 text-caption font-semibold text-gray-900">
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
      {/* 카드 제목(semibold)보다 무거워지지 않도록 medium에 둔다 — 자식이 부모를 눌러선 안 된다. */}
      <p className="mt-1.5 w-full truncate text-body font-medium text-gray-900">{record.name}</p>
      {industries.length > 0 && (
        <div className="mt-0.5 flex flex-wrap justify-center gap-1">
          {industries.map((ind) => (
            <Badge key={ind} tone="neutral">
              {ind}
            </Badge>
          ))}
        </div>
      )}
      {year != null ? (
        <span className="mt-0.5 text-caption text-gray-500">{year}</span>
      ) : (
        <span className="mt-0.5 text-caption text-gray-400">기준연도 정보 없음</span>
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
        <Button type="button" variant="outline" onClick={onSelect}>
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
  // 항목별로 각자의 최신 1건을 비교한다(재무·매출·고용은 연도 최신, 투자는 기준월 최신).
  const ga = readGrowth(a)
  const gb = b ? readGrowth(b) : null
  const fa = ga.finance[0]
  const ra = ga.revenue[0]
  const ea = ga.employee[0]
  const ia = ga.investment[0]
  const fb = gb?.finance[0]
  const rb = gb?.revenue[0]
  const eb = gb?.employee[0]
  const ib = gb?.investment[0]
  // 헤더 기준연도는 재무→매출→고용 순으로 존재하는 최신 연도를 쓴다.
  const yearA = fa?.year ?? ra?.year ?? ea?.year
  const yearB = fb?.year ?? rb?.year ?? eb?.year
  // 빈값 문구: 현재 기업(A)은 항상 존재하므로 '정보 없음', 비교기업(B)은 미선택 시 '-'.
  const aEmpty = '정보 없음'
  const bEmpty = b ? '정보 없음' : '-'
  // 설립일은 formatFounded가 자체적으로 '정보 없음'을 반환하므로, B 미선택 시에는 '-'로 대체.
  const foundedB = b ? formatFounded(b.founded_on) : '-'

  return (
    <PanelCard title="기업 비교">
      {/* 기업 헤더: A · VS · B — 두 기업을 각자 테두리 박스로 분리(기업 VS 기업) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-radius-md border border-gray-200 bg-white p-3">
          <CompanyHead record={a} year={yearA} />
        </div>
        <span className="self-center text-caption font-semibold text-gray-400" aria-hidden>
          VS
        </span>
        <div className="rounded-radius-md border border-gray-200 bg-white p-3">
        {b ? (
          <CompanyHead record={b} year={yearB} onClear={onClearB} />
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

        <p className="text-right text-caption text-gray-500">단위: 천원</p>
        <Group title="재무 현황">
          <Row label="자산" a={fa?.assets} b={fb?.assets} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="부채" a={fa?.liabilities} b={fb?.liabilities} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="자본" a={fa?.equity} b={fb?.equity} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <Group title="매출 현황">
          <Row label="매출액" a={ra?.revenue} b={rb?.revenue} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="영업이익" a={ra?.operatingProfit} b={rb?.operatingProfit} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="당기순이익" a={ra?.netIncome} b={rb?.netIncome} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <Group title="고용 현황">
          <Row label="고용 인원" a={ea?.employeeCount} b={eb?.employeeCount} unit="count" aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>

        <Group title="투자 현황">
          <TextRow label="기준월" a={ia?.date} b={ib?.date} aEmpty={aEmpty} bEmpty={bEmpty} />
          <TextRow label="라운드" a={ia?.round} b={ib?.round} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="기업가치(Pre)" a={ia?.valuation} b={ib?.valuation} aEmpty={aEmpty} bEmpty={bEmpty} />
          <Row label="투자유치액" a={ia?.fundingAmount} b={ib?.fundingAmount} aEmpty={aEmpty} bEmpty={bEmpty} />
        </Group>
      </div>
    </PanelCard>
  )
}
