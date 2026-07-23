import { Button, cn, DataTable, Select, type Column } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { GLOBAL_CATEGORY_OPTIONS, type GlobalCategory } from '@/features/networks/globalConfig'
import type { GlobalExistingRef, GlobalParsedRow } from '@/features/networks/globalBulkUpload'

export type Decision = 'new' | 'merge' | 'skip'

export interface GlobalReviewRow extends GlobalParsedRow {
  /** 편집 가능한 저장 대상 구분(빈 값 = 선택 안 함). 중복이면 보수적 프리셋. */
  categoryLabel: GlobalCategory | ''
  /** 확실중복으로 매칭된 기존 글로벌 레코드. 없으면 신규. */
  match: GlobalExistingRef | null
  /** 처리 방식(비활성 매칭은 결정 대신 '복구하기' 버튼 사용). */
  decision: Decision
}

/** 결정 옵션. 중복이면 합치기/미업로드, 아니면 신규 등록/미업로드. */
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

/** 업로드 행과 기존 레코드가 실제로 겹치는 필드 라벨만 추린다. */
function overlapLabels(row: GlobalReviewRow, match: GlobalExistingRef): string[] {
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
  const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
  const eq = (a: string, b: string) => a !== '' && a === b
  const out: string[] = []
  if (eq(norm(row.name), norm(match.name))) out.push('이름')
  if (eq(norm(row.affiliation), norm(match.affiliation))) out.push('소속')
  if (eq(norm(row.email), norm(match.email))) out.push('이메일')
  if (eq(digits(row.phone), digits(match.phone))) out.push('연락처')
  return out
}

/** 중복 셀의 한 덩이(독립 pill 뱃지). */
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

/** 중복 매칭 셀. 비활성 미복구는 비활성/사유만, 그 외는 작성자·구분·중복. */
function DupCell({
  row,
  match,
  revived,
}: {
  row: GlobalReviewRow
  match: GlobalExistingRef
  revived: boolean
}) {
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
      <Seg label="구분" value={match.category || '미지정'} widthCls="min-w-[5rem]" />
      <Seg label="중복" tone="warning" value={dups} />
    </div>
  )
}

interface Props {
  rows: GlobalReviewRow[]
  /** 선택된 행 번호(제어). */
  selected: number[]
  /** 이미 복구 처리된 행 번호. */
  revivedLines: number[]
  busy?: boolean
  onSelectionChange: (lines: number[]) => void
  onCategory: (line: number, label: GlobalCategory | '') => void
  onDecision: (line: number, decision: Decision) => void
  /** 비활성 매칭 행 복구 확인 요청. */
  onRevive: (line: number) => void
}

/**
 * 글로벌 대용량 업로드 리뷰 테이블. 국내 BulkReviewTable과 같은 UX(구분 선택·중복 강조·결정)에
 * 글로벌 전용 컬럼(권역·국가)을 더하고, 구분은 3값 스칼라 셀렉트(빈 값 허용)로 둔다.
 */
export function GlobalBulkReviewTable({
  rows,
  selected,
  revivedLines,
  busy,
  onSelectionChange,
  onCategory,
  onDecision,
  onRevive,
}: Props) {
  const pad = 'px-2'
  const isDeactivated = (r: GlobalReviewRow) =>
    Boolean(r.match?.deleted) && !revivedLines.includes(r.line)
  const dim = (r: GlobalReviewRow, normal: string) => (isDeactivated(r) ? 'text-gray-300' : normal)
  const columns: Column<GlobalReviewRow>[] = [
    { key: 'name', header: '이름', className: pad, render: (r) => <span className={cn('font-medium', dim(r, 'text-gray-800'))}>{r.name || '—'}</span> },
    { key: 'affiliation', header: '소속', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.affiliation || '-'}</span> },
    { key: 'position', header: '직책', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.position || '-'}</span> },
    { key: 'email', header: '이메일', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.email || '-'}</span> },
    { key: 'phone', header: '연락처', className: pad, render: (r) => <span className={dim(r, 'text-gray-600')}>{r.phone || '-'}</span> },
    {
      key: 'geo',
      header: '권역·국가',
      className: pad,
      render: (r) => (
        <span className={dim(r, 'text-gray-600')}>
          {[r.region, r.country].filter(Boolean).join(' · ') || '-'}
        </span>
      ),
    },
    {
      key: 'category',
      header: '구분',
      className: pad,
      render: (r) => (
        <Select
          value={r.categoryLabel}
          disabled={r.decision === 'skip' || isDeactivated(r)}
          onChange={(e) => onCategory(r.line, e.target.value as GlobalCategory | '')}
        >
          <option value="">선택 안 함</option>
          {GLOBAL_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
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
      className: 'w-72 pl-1 pr-8',
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
      className: 'w-32 pl-2 pr-4',
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
      rowClassName={(r) => (isDeactivated(r) ? 'bg-gray-100' : undefined)}
      selectable
      selectedKeys={selected.map(String)}
      onSelectionChange={(keys) => onSelectionChange(keys.map(Number))}
      emptyText="업로드할 데이터가 없습니다."
    />
  )
}
