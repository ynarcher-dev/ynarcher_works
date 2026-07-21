import { Button, cn, DataTable, Select, type Column } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import type { ExistingRef, ParsedRow } from '@/features/networks/bulkUpload'

export type Decision = 'new' | 'merge' | 'skip'

export interface ReviewRow extends ParsedRow {
  /** 편집 가능한 저장 대상 구분 라벨. 중복이면 재결정의 출발점(보수적 프리셋). */
  categoryLabel: string
  /** 확실중복(이메일·전화 일치)으로 매칭된 기존 레코드. 없으면 신규. */
  match: ExistingRef | null
  /** 처리 방식(비활성 매칭은 결정 대신 '복구하기' 버튼 사용). */
  decision: Decision
}

/**
 * 결정 옵션. 중복(매칭)이 있으면 합치기/미업로드만 — 중복인데 새로 만드는 신규 등록은 없앤다.
 * 중복이 없으면 신규 등록/미업로드.
 */
function decisionOptions(hasMatch: boolean): { value: Decision; label: string }[] {
  return hasMatch
    ? [
        { value: 'merge', label: '합치기' },
        { value: 'skip', label: '미업로드' },
      ]
    : [
        { value: 'new', label: '신규 등록' },
        { value: 'skip', label: '미업로드' },
      ]
}

/** 업로드 행과 기존 레코드가 실제로 겹치는 필드 라벨만 추린다(이름/소속/부서/직책/이메일/연락처). */
function overlapLabels(row: ReviewRow, match: ExistingRef): string[] {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  const eq = (a: string, b: string) => a !== '' && a === b
  const out: string[] = []
  if (eq(norm(row.name), norm(match.name))) out.push('이름')
  if (eq(norm(row.affiliation), norm(match.affiliation))) out.push('소속')
  if (eq(norm(row.department), norm(match.profile.department))) out.push('부서')
  if (eq(norm(row.position), norm(match.profile.position))) out.push('직책')
  if (eq(norm(row.email), norm(match.email))) out.push('이메일')
  if (eq(digits(row.phone), digits(match.phone))) out.push('연락처')
  return out
}

/** 중복 셀의 한 덩이(독립 pill 뱃지). tone으로 경각심 단계, widthCls로 열 정렬용 최소폭을 준다. */
function Seg({
  label,
  value,
  tone = 'plain',
  widthCls,
}: {
  label: string
  value: ReactNode
  tone?: 'plain' | 'warning' | 'danger'
  widthCls?: string
}) {
  const toneCls =
    tone === 'danger'
      ? 'border-danger-border bg-danger-subtle text-danger'
      : tone === 'warning'
        ? 'border-warning-border bg-warning-subtle text-warning'
        : 'border-gray-200 bg-gray-50 text-gray-600'
  return (
    <span className={cn('inline-flex items-center rounded-radius-sm border px-2 py-0.5', widthCls, toneCls)}>
      <span className="opacity-60">{label}</span>
      <span className="ml-1 font-semibold">{value}</span>
    </span>
  )
}

/**
 * 중복 매칭 셀. 최소폭으로 행마다 시작점을 정렬한다.
 * - 비활성(미복구): 비활성화한 사람 · 사유만(둘 다 레드). 구분·중복은 숨긴다.
 * - 활성 매칭 or 복구 확정: 작성자 · 구분 · 중복(앰버).
 */
function DupCell({ row, match, revived }: { row: ReviewRow; match: ExistingRef; revived: boolean }) {
  if (match.deleted && !revived) {
    return (
      <div className="inline-flex items-center gap-2.5 whitespace-nowrap text-caption leading-snug">
        <Seg label="비활성" tone="danger" value={match.deactivatedBy ?? '미상'} widthCls="min-w-[6rem]" />
        <Seg label="사유" tone="danger" value={match.deactivateReason ?? '-'} />
      </div>
    )
  }
  const dups = overlapLabels(row, match).join(', ')
  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap text-caption leading-snug">
      <Seg label="작성자" value={match.contributor ?? '미상'} widthCls="min-w-[6rem]" />
      <Seg label="구분" value={match.category} widthCls="min-w-[6.5rem]" />
      <Seg label="중복" tone="warning" value={dups} />
    </div>
  )
}

interface Props {
  rows: ReviewRow[]
  categoryOptions: { value: string; label: string }[]
  /** 선택된 행 번호(제어). */
  selected: number[]
  /** 이미 복구 처리된(활성화된) 행 번호. 해당 행은 '복구됨'으로 잠긴다. */
  revivedLines: number[]
  busy?: boolean
  onSelectionChange: (lines: number[]) => void
  onCategory: (line: number, label: string) => void
  onDecision: (line: number, decision: Decision) => void
  /** 비활성 매칭 행 즉시 복구(활성화). */
  onRevive: (line: number) => void
}

/**
 * 대용량 업로드 리뷰 테이블. 공용 DataTable(디자인 통일) 위에 구분 재결정·중복 강조·결정을 얹는다.
 * 중복이 있는 행은 '중복' 칸을 테두리 박스로 강조해 선행 데이터(이름/구분/작성자)를 함께 보인다.
 */
export function BulkReviewTable({
  rows,
  categoryOptions,
  selected,
  revivedLines,
  busy,
  onSelectionChange,
  onCategory,
  onDecision,
  onRevive,
}: Props) {
  // 모든 열의 좌우 패딩을 px-2로 통일해 열 간 여백이 들쑥날쑥하지 않게 한다(중복 칸은 폭만 w-72로 넓힘).
  const pad = 'px-2'
  // 비활성(미복구) 상태: 복구하기를 아직 누르지 않은 비활성 매칭 행.
  const isDeactivated = (r: ReviewRow) => Boolean(r.match?.deleted) && !revivedLines.includes(r.line)
  // 비활성 행은 원본 데이터 텍스트를 옅게 처리한다.
  const dim = (r: ReviewRow, normal: string) => (isDeactivated(r) ? 'text-gray-300' : normal)
  const columns: Column<ReviewRow>[] = [
    { key: 'name', header: '이름', className: pad, render: (r) => <span className={cn('font-medium', dim(r, 'text-gray-800'))}>{r.name || '—'}</span> },
    { key: 'affiliation', header: '소속', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.affiliation || '-'}</span> },
    { key: 'department', header: '부서', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.department || '-'}</span> },
    { key: 'position', header: '직책', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.position || '-'}</span> },
    { key: 'email', header: '이메일', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.email || '-'}</span> },
    { key: 'phone', header: '연락처', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.phone || '-'}</span> },
    {
      key: 'category',
      header: '구분',
      className: pad,
      render: (r) => (
        <Select
          value={r.categoryLabel}
          disabled={r.decision === 'skip' || isDeactivated(r)}
          onChange={(e) => onCategory(r.line, e.target.value)}
        >
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      ),
    },
    {
      key: 'dup',
      header: (
        <span className="whitespace-nowrap">
          중복 여부{' '}
          <span className="font-normal normal-case text-gray-600">(이름·전화·이메일 중 2개 이상 일치)</span>
        </span>
      ),
      // 왼쪽은 좁혀(pl-1) 구분 열에 붙이고, 오른쪽은 키워(pr-8) 주황 '중복' 뱃지가 결정 열에 붙지 않게 한다.
      className: 'w-72 pl-1 pr-8',
      // 중복이 있는 행만 표시. 비활성 미복구는 비활성/사유만, 그 외는 작성자·구분·중복.
      render: (r) =>
        r.match ? (
          <DupCell row={r} match={r.match} revived={revivedLines.includes(r.line)} />
        ) : (
          <span className="text-gray-300">중복 없음</span>
        ),
    },
    {
      key: 'decision',
      header: '결정',
      align: 'center',
      // 드롭다운 글씨가 잘리지 않게 열을 넓히고(w-32) 오른쪽 여백(pr-4)으로 우측 끝에서 살짝 당긴다.
      className: 'w-32 pl-2 pr-4',
      // 비활성 매칭은 먼저 '복구하기'로 의사를 밝힌 뒤에야 결정(합치기/미업로드) 드롭다운이 열린다.
      render: (r) =>
        r.match?.deleted && !revivedLines.includes(r.line) ? (
          <Button disabled={busy} onClick={() => onRevive(r.line)}>
            복구하기
          </Button>
        ) : (
          <Select
            value={r.decision}
            disabled={!r.name}
            onChange={(e) => onDecision(r.line, e.target.value as Decision)}
          >
            {decisionOptions(Boolean(r.match)).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.line)}
      numbered={false}
      standardColumns={false}
      // 비활성(미복구) 중복 행은 배경을 회색으로 눌러 표시한다(복구 확정 시 일반 행으로 복귀).
      rowClassName={(r) => (isDeactivated(r) ? 'bg-gray-100' : undefined)}
      selectable
      selectedKeys={selected.map(String)}
      onSelectionChange={(keys) => onSelectionChange(keys.map(Number))}
      emptyText="업로드할 데이터가 없습니다."
    />
  )
}
