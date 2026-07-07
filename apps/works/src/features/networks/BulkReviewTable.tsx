import { Badge, Button, cn, DataTable, InlineSelect, type Column } from '@ynarcher/ui'
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

/** 중복 매칭 셀: 작성자·구분 머리글 + 기존 레코드의 6개 필드(이름/소속/부서/직책/이메일/연락처). */
function DupCell({ match }: { match: ExistingRef }) {
  const str = (v: unknown) => (v == null || v === '' ? '-' : String(v))
  const fields: [string, string][] = [
    ['이름', str(match.name)],
    ['소속', str(match.affiliation)],
    ['부서', str(match.profile.department)],
    ['직책', str(match.profile.position)],
    ['이메일', str(match.email)],
    ['연락처', str(match.phone)],
  ]
  return (
    <div
      className={cn(
        'rounded-radius-md border px-2 py-1.5 text-caption leading-tight',
        match.deleted ? 'border-warning-border bg-warning-subtle' : 'border-info-border bg-info-subtle',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2 border-b border-gray-200/70 pb-1">
        <span className="font-medium text-gray-700">작성자 {match.contributor ?? '미상'}</span>
        <span className="inline-flex shrink-0 items-center gap-1">
          {match.deleted && <span className="text-warning">비활성</span>}
          <Badge tone="neutral" size="sm">{match.category}</Badge>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {fields.map(([k, v]) => (
          <div key={k} className="flex min-w-0 gap-1">
            <dt className="shrink-0 text-gray-400">{k}</dt>
            <dd className="truncate text-gray-700">{v}</dd>
          </div>
        ))}
      </dl>
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
      header: '중복',
      className: 'w-80 px-2',
      // 중복이 있는 행만 테두리 박스로 강조. 작성자·구분을 머리에 두고 기존 레코드의 6개 필드를 나열한다.
      render: (r) => (r.match ? <DupCell match={r.match} /> : <span className="text-gray-300">중복 없음</span>),
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
