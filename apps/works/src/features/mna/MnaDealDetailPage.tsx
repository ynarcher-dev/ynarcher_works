import { Badge, Banner, Button, Input, Select, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DOC_TYPES,
  STAGE_LABELS,
  stageTone,
  type DocType,
} from '@/features/mna/config'
import {
  useAddDocument,
  useDeal,
  useDealDocuments,
  useReviewDocument,
  useStageLogs,
} from '@/features/mna/hooks'

function DocChecklist({ dealId }: { dealId: string }) {
  const toast = useToast()
  const { data: docs } = useDealDocuments(dealId)
  const add = useAddDocument(dealId)
  const review = useReviewDocument(dealId)
  const [type, setType] = useState<DocType>('NDA')
  const [title, setTitle] = useState('')

  const onAdd = async () => {
    if (!title.trim()) {
      toast.show('문서명을 입력하세요.', 'warning')
      return
    }
    try {
      await add.mutateAsync({ doc_type: type, title: title.trim() })
      setTitle('')
    } catch {
      toast.show('추가에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const label = (t: DocType) => DOC_TYPES.find((d) => d.key === t)?.label ?? t

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white">
        {(docs ?? []).map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between border-b border-gray-100 px-4 py-2 last:border-b-0"
          >
            <div>
              <span className="text-body text-gray-900">{d.title}</span>
              <span className="ml-2 text-caption text-gray-400">
                {label(d.doc_type)}
              </span>
            </div>
            {d.is_reviewed ? (
              <Badge tone="success">검토 완료</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => review.mutate(d.id)}
                disabled={review.isPending}
              >
                검토 완료
              </Button>
            )}
          </div>
        ))}
        {(docs ?? []).length === 0 && (
          <p className="px-4 py-6 text-center text-caption text-gray-400">
            등록된 보안 문서가 없습니다.
          </p>
        )}
      </div>

      <div className="flex items-end gap-2">
        <div className="w-48">
          <label className="text-caption text-gray-600">유형</label>
          <Select value={type} onChange={(e) => setType(e.target.value as DocType)}>
            {DOC_TYPES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-caption text-gray-600">문서명</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <Button onClick={() => void onAdd()} disabled={add.isPending}>
          추가
        </Button>
      </div>
    </div>
  )
}

/** M&A 딜 상세: 단계/보안 문서 체크리스트/단계 전환 타임라인. */
export function MnaDealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: deal, isLoading } = useDeal(id)
  const { data: logs } = useStageLogs(id)

  if (isLoading) return <Spinner />
  if (!deal || !id) return <Banner tone="warning">딜을 찾을 수 없습니다.</Banner>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/mna" className="text-caption text-gray-500 hover:text-gray-800">
          ← M&amp;A 칸반
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-title-lg font-bold text-gray-900">
            {deal.deal_name}
          </h1>
          <Badge tone={stageTone[deal.stage]}>{STAGE_LABELS[deal.stage]}</Badge>
          {deal.on_hold && <Badge tone="danger">보류</Badge>}
        </div>
        <p className="text-caption text-gray-500">
          {deal.target_name ?? '대상 미지정'} ·{' '}
          {deal.estimated_value != null
            ? `${(deal.estimated_value / 100_000_000).toLocaleString()}억`
            : '가액 미정'}
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-title-sm font-semibold text-gray-900">
          보안 문서 체크리스트
        </h2>
        <DocChecklist dealId={id} />
      </section>

      <section>
        <h2 className="mb-2 text-title-sm font-semibold text-gray-900">
          단계 전환 타임라인
        </h2>
        <div className="rounded border border-gray-200 bg-white">
          {(logs ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-body last:border-b-0"
            >
              <span className="text-caption tabular-nums text-gray-400">
                {new Date(l.created_at).toLocaleDateString('ko-KR')}
              </span>
              <span className="text-gray-600">
                {l.from_stage ? STAGE_LABELS[l.from_stage] : '생성'} →{' '}
                <span className="font-medium text-gray-900">
                  {STAGE_LABELS[l.to_stage]}
                </span>
              </span>
            </div>
          ))}
          {(logs ?? []).length === 0 && (
            <p className="px-4 py-6 text-center text-caption text-gray-400">
              단계 전환 이력이 없습니다.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
