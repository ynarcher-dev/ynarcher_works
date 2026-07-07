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
  const columns: Column<ReviewRow>[] = [
    { key: 'name', header: '이름', render: (r) => <span className="font-medium text-gray-800">{r.name || '—'}</span> },
    { key: 'affiliation', header: '소속', render: (r) => <span className={cellText}>{r.affiliation || '-'}</span> },
    { key: 'department', header: '부서', render: (r) => <span className={cellText}>{r.department || '-'}</span> },
    { key: 'position', header: '직책', render: (r) => <span className={cellText}>{r.position || '-'}</span> },
    { key: 'email', header: '이메일', render: (r) => <span className={cellText}>{r.email || '-'}</span> },
    { key: 'phone', header: '연락처', render: (r) => <span className={cellText}>{r.phone || '-'}</span> },
    {
      key: 'category',
      header: '구분',
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
      className: 'w-56',
      // 중복이 있는 행만 테두리 박스로 강조(선행 데이터: 항목명 / 구분 / 작성자).
      render: (r) =>
        r.match ? (
          <div
            className={cn(
              'inline-flex flex-col gap-0.5 rounded-radius-md border px-2 py-1 text-caption leading-tight',
              r.match.deleted
                ? 'border-warning-border bg-warning-subtle'
                : 'border-info-border bg-info-subtle',
            )}
          >
            <span className="font-medium text-gray-800">
              {r.match.name}
              {r.match.deleted && <span className="ml-1 font-normal text-warning">· 비활성</span>}
            </span>
            <span className="text-gray-500">
              {r.match.category} · {r.match.contributor ?? '작성자 미상'}
            </span>
          </div>
        ) : (
          <span className="text-gray-300">중복 없음</span>
        ),
    },
    {
      key: 'decision',
      header: '결정',
      align: 'center',
      className: 'w-28',
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
