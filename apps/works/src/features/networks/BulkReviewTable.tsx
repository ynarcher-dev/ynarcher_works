import { Badge, Button, cn, DataTable, InlineSelect, type Column } from '@ynarcher/ui'
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

/** 활성 매칭/무매칭 행의 결정 옵션(비활성 매칭은 버튼으로 처리하므로 제외). */
function decisionOptions(hasActiveMatch: boolean): { value: Decision; label: string }[] {
  const base: { value: Decision; label: string }[] = [
    { value: 'new', label: '신규 등록' },
    { value: 'skip', label: '미업로드' },
  ]
  return hasActiveMatch ? [{ value: 'merge', label: '합치기' }, ...base] : base
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

/** 중복 셀의 한 덩이(라벨 + 값). tone으로 경각심 단계를 표현한다. */
function Seg({ label, value, tone = 'plain' }: { label: string; value: ReactNode; tone?: 'plain' | 'warning' | 'danger' }) {
  const toneCls =
    tone === 'danger'
      ? 'bg-danger-subtle text-danger'
      : tone === 'warning'
        ? 'bg-warning-subtle text-warning'
        : 'bg-gray-50 text-gray-600'
  return (
    <span className={cn('px-2 py-0.5', toneCls)}>
      <span className="opacity-60">{label} </span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}

/** 중복 매칭 셀: 「작성자 · 구분 · 중복」 세 덩이로 나누고, 중복 덩이는 경각심 톤(활성=앰버/비활성=레드). */
function DupCell({ row, match }: { row: ReviewRow; match: ExistingRef }) {
  const dups = overlapLabels(row, match)
  const alarm = match.deleted ? 'danger' : 'warning'
  return (
    <div
      className={cn(
        'inline-flex items-stretch divide-x divide-gray-200 overflow-hidden whitespace-nowrap rounded-radius-md border text-[11px] leading-snug',
        match.deleted ? 'border-danger-border' : 'border-warning-border',
      )}
    >
      <Seg label="작성자" value={match.contributor ?? '미상'} />
      <Seg label="구분" value={match.category} />
      <Seg label="중복" tone={alarm} value={match.deleted ? `비활성 · ${dups.join(', ')}` : dups.join(', ')} />
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
  const cellText = 'text-gray-600'
  // 좌측 원본 컬럼은 여백을 좁혀(px-1.5) 폭을 아끼고, 중복 칸만 넓게 쓴다.
  const tight = 'px-1.5'
  const columns: Column<ReviewRow>[] = [
    { key: 'name', header: '이름', className: tight, render: (r) => <span className="font-medium text-gray-800">{r.name || '—'}</span> },
    { key: 'affiliation', header: '소속', className: tight, render: (r) => <span className={cellText}>{r.affiliation || '-'}</span> },
    { key: 'department', header: '부서', className: tight, render: (r) => <span className={cellText}>{r.department || '-'}</span> },
    { key: 'position', header: '직책', className: tight, render: (r) => <span className={cellText}>{r.position || '-'}</span> },
    { key: 'email', header: '이메일', className: tight, render: (r) => <span className={cellText}>{r.email || '-'}</span> },
    { key: 'phone', header: '연락처', className: tight, render: (r) => <span className={cellText}>{r.phone || '-'}</span> },
    {
      key: 'category',
      header: '구분',
      className: tight,
      render: (r) => (
        <InlineSelect
          value={r.categoryLabel}
          disabled={r.decision === 'skip' || Boolean(r.match?.deleted)}
          onChange={(e) => onCategory(r.line, e.target.value)}
        >
          {categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </InlineSelect>
      ),
    },
    {
      key: 'dup',
      header: '중복 여부',
      className: 'w-72 px-2',
      // 중복이 있는 행만 테두리 박스로 강조. 작성자·구분·겹치는 항목을 한 줄로 보인다.
      render: (r) => (r.match ? <DupCell row={r} match={r.match} /> : <span className="text-gray-300">중복 없음</span>),
    },
    {
      key: 'decision',
      header: '결정',
      align: 'center',
      className: 'w-24 px-1.5',
      render: (r) =>
        r.match?.deleted ? (
          revivedLines.includes(r.line) ? (
            <Badge tone="success" size="sm">복구됨</Badge>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onRevive(r.line)}>
              복구하기
            </Button>
          )
        ) : (
          <InlineSelect
            value={r.decision}
            disabled={!r.name}
            onChange={(e) => onDecision(r.line, e.target.value as Decision)}
          >
            {decisionOptions(Boolean(r.match)).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </InlineSelect>
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
      selectable
      selectedKeys={selected.map(String)}
      onSelectionChange={(keys) => onSelectionChange(keys.map(Number))}
      emptyText="업로드할 데이터가 없습니다."
    />
  )
}
