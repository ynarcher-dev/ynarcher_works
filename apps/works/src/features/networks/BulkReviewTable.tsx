import { Badge, cn, InlineSelect } from '@ynarcher/ui'
import type { ExistingRef, ParsedRow } from '@/features/networks/bulkUpload'

export type Decision = 'new' | 'merge' | 'skip'

export interface ReviewRow extends ParsedRow {
  /** 편집 가능한 저장 대상 구분 라벨. 중복이면 재결정의 출발점(보수적 프리셋). */
  categoryLabel: string
  /** 확실중복(이메일·전화 일치)으로 매칭된 기존 레코드. 없으면 신규. */
  match: ExistingRef | null
  /** 처리 방식. */
  decision: Decision
}

function decisionOptions(hasMatch: boolean): { value: Decision; label: string }[] {
  const base: { value: Decision; label: string }[] = [
    { value: 'new', label: '신규 등록' },
    { value: 'skip', label: '건너뛰기' },
  ]
  return hasMatch ? [{ value: 'merge', label: '합치기' }, ...base] : base
}

const HEADERS = [
  '이름', '소속', '부서', '직책', '이메일', '연락처', '구분', '중복', '중복 데이터', '결정',
]

interface Props {
  rows: ReviewRow[]
  categoryOptions: { value: string; label: string }[]
  selected: number[]
  onToggle: (line: number) => void
  onToggleAll: () => void
  onCategory: (line: number, label: string) => void
  onDecision: (line: number, decision: Decision) => void
}

/** 대용량 업로드 리뷰 테이블(체크박스·구분 재결정·중복 데이터·결정). */
export function BulkReviewTable({
  rows,
  categoryOptions,
  selected,
  onToggle,
  onToggleAll,
  onCategory,
  onDecision,
}: Props) {
  const selectable = rows.filter((r) => r.name)
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.includes(r.line))

  return (
    <div className="overflow-x-auto rounded-radius-lg border border-gray-200">
      <table className="w-full text-caption">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-3 py-2">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
            </th>
            {HEADERS.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.line}
              className={cn(
                'border-t border-gray-100',
                r.match && 'bg-info-subtle',
                (!r.name || r.decision === 'skip') && 'opacity-50',
              )}
            >
              <td className="px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={selected.includes(r.line)}
                  disabled={!r.name}
                  onChange={() => onToggle(r.line)}
                />
              </td>
              <td className="px-3 py-1.5 text-gray-800">{r.name || '—'}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.affiliation || '-'}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.department || '-'}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.position || '-'}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.email || '-'}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.phone || '-'}</td>
              <td className="px-3 py-1.5">
                <InlineSelect
                  value={r.categoryLabel}
                  disabled={r.decision === 'skip'}
                  onChange={(e) => onCategory(r.line, e.target.value)}
                >
                  {categoryOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </InlineSelect>
              </td>
              <td className="px-3 py-1.5">
                {r.match ? (
                  <Badge tone="info" size="sm">Y</Badge>
                ) : (
                  <span className="text-gray-400">N</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-gray-600">
                {r.match
                  ? `${r.match.name} / ${r.match.category} / ${r.match.contributor ?? '-'}`
                  : '-'}
              </td>
              <td className="px-3 py-1.5">
                <InlineSelect
                  value={r.decision}
                  disabled={!r.name}
                  onChange={(e) => onDecision(r.line, e.target.value as Decision)}
                >
                  {decisionOptions(Boolean(r.match)).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </InlineSelect>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
