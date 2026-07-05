import { Badge, Button, Spinner } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { ApprovalFormModal } from '@/features/management/ApprovalFormModal'
import { APPROVAL_LABELS, approvalTone } from '@/features/management/config'
import {
  useApprovalDocs,
  useDecideApproval,
  type ApprovalDoc,
} from '@/features/management/hooks'

type Filter = 'todo' | 'progress' | 'completed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todo', label: '대기 문서' },
  { key: 'progress', label: '진행 문서' },
  { key: 'completed', label: '완료 문서' },
]

/** 전자결재 통합 대시보드(대기/진행/완료 탭 + 상신 폼 + 결재 처리). */
export function ApprovalPanel() {
  const me = useAuthStore((s) => s.user)?.id
  const { data, isLoading } = useApprovalDocs()
  const decide = useDecideApproval()
  const [filter, setFilter] = useState<Filter>('todo')
  const [creating, setCreating] = useState(false)

  // 내 다음 결재 차례(가장 낮은 step 중 PENDING) 라인 계산.
  const myPendingLine = (doc: ApprovalDoc) => {
    const pending = doc.approval_lines
      .filter((l) => l.decision === 'PENDING')
      .sort((a, b) => a.step_order - b.step_order)
    const next = pending[0]
    return next && next.approver_id === me ? next : null
  }

  const docs = useMemo(() => {
    const all = data ?? []
    if (filter === 'completed')
      return all.filter((d) => d.status === 'APPROVED' || d.status === 'REJECTED')
    if (filter === 'progress')
      return all.filter(
        (d) =>
          d.drafter_id === me &&
          (d.status === 'PENDING' || d.status === 'IN_REVIEW'),
      )
    return all.filter((d) => myPendingLine(d) !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, me])

  const onDecide = (doc: ApprovalDoc, decision: 'APPROVED' | 'REJECTED') => {
    const line = myPendingLine(doc)
    if (!line) return
    const remaining = doc.approval_lines.filter(
      (l) => l.decision === 'PENDING' && l.id !== line.id,
    ).length
    decide.mutate({
      line_id: line.id,
      document_id: doc.id,
      decision,
      is_final: remaining === 0,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex gap-1 border-b border-gray-200">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                filter === f.key
                  ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                  : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
              }
            >
              {f.label}
            </button>
          ))}
        </nav>
        <Button onClick={() => setCreating(true)}>문서 상신</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : docs.length === 0 ? (
        <p className="rounded border border-dashed border-gray-200 py-8 text-center text-body text-gray-400">
          해당 문서가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded border border-gray-200 bg-white px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-body font-medium text-gray-900">
                    {doc.title}
                  </span>
                  <Badge tone={approvalTone[doc.status]}>
                    {APPROVAL_LABELS[doc.status]}
                  </Badge>
                </div>
                <p className="text-caption text-gray-500">
                  {doc.amount != null
                    ? `${Number(doc.amount).toLocaleString()}원 · `
                    : ''}
                  결재선 {doc.approval_lines.length}단계
                </p>
              </div>
              {filter === 'todo' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => onDecide(doc, 'REJECTED')}
                  >
                    반려
                  </Button>
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => onDecide(doc, 'APPROVED')}
                  >
                    승인
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ApprovalFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
