import { Badge, Button, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { CriteriaManager } from '@/features/program/CriteriaManager'
import { EvaluationFormModal } from '@/features/program/EvaluationFormModal'
import { ResultsTable } from '@/features/program/ResultsTable'
import { useEvaluationForms } from '@/features/program/evaluationHooks'

const FORM_TYPE_LABEL: Record<string, string> = {
  DOC_REVIEW: '서면',
  ONSITE_EVAL: '대면',
  DEMO_DAY: '데모데이',
}

/** 공통 평가 엔진 패널: 폼 목록/생성 + 지표 관리 + 가중 집계. (7-4) */
export function EvaluationPanel({ programId }: { programId: string }) {
  const { data, isLoading } = useEvaluationForms(programId)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  if (isLoading) return <Spinner />
  const forms = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body text-gray-600">
          동적 평가표를 만들고 지표 가중치로 대상별 총점을 집계합니다. (점수 입력은 심사위원 GUEST 화면)
        </p>
        <Button onClick={() => setCreating(true)}>
          평가 폼 생성
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {forms.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelected(f.id)}
            className={
              selected === f.id
                ? 'rounded border border-brand bg-brand-25 px-3 py-1.5 text-body text-brand'
                : 'rounded border border-gray-300 bg-white px-3 py-1.5 text-body text-gray-700 hover:bg-gray-50'
            }
          >
            <span className="inline-flex items-center gap-2">
              <Badge tone="info">{FORM_TYPE_LABEL[f.form_type] ?? f.form_type}</Badge>
              {f.title}
            </span>
          </button>
        ))}
        {forms.length === 0 && (
          <p className="text-caption text-gray-500">생성된 평가 폼이 없습니다.</p>
        )}
      </div>

      {selected && (
        <div className="grid gap-6 lg:grid-cols-2">
          <CriteriaManager formId={selected} />
          <ResultsTable formId={selected} />
        </div>
      )}

      <EvaluationFormModal
        programId={programId}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </div>
  )
}
