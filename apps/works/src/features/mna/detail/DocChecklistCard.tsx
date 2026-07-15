import { Badge, Button, Card, Input, Select, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { DOC_TYPES, type DocType } from '@/features/mna/config'
import {
  useAddDocument,
  useDealDocuments,
  useReviewDocument,
} from '@/features/mna/hooks'

/**
 * 보안 문서 체크리스트(상세 좌측 카드).
 * NDA·MOU·주주 동의서 등 필수 문서를 등록하고 [검토 완료]로 잠금 처리한다.
 */
export function DocChecklistCard({ dealId }: { dealId: string }) {
  const toast = useToast()
  const { data: docs } = useDealDocuments(dealId)
  const add = useAddDocument(dealId)
  const review = useReviewDocument(dealId)
  const [type, setType] = useState<DocType>('NDA')
  const [title, setTitle] = useState('')

  const rows = docs ?? []
  const reviewed = rows.filter((d) => d.is_reviewed).length

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
    <Card
      title="보안 문서 체크리스트"
      subtitle="검토 완료 처리 시 문서가 잠금됩니다."
      actions={
        <Badge tone={rows.length > 0 && reviewed === rows.length ? 'success' : 'neutral'}>
          검토 {reviewed}/{rows.length}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="rounded-radius-md border border-gray-300 bg-white">
          {rows.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between border-b border-gray-100 px-4 py-2 last:border-b-0"
            >
              <div>
                <span className="text-body text-gray-900">{d.title}</span>
                <span className="ml-2 text-caption text-gray-400">{label(d.doc_type)}</span>
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
          {rows.length === 0 && (
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
    </Card>
  )
}
