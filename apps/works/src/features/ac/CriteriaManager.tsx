import { Button, Input, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useAddCriterion, useCriteria } from '@/features/ac/evaluationHooks'

/** 평가 지표(criteria) 관리: 동적 지표 + 가중치. */
export function CriteriaManager({ formId }: { formId: string }) {
  const toast = useToast()
  const { data, isLoading } = useCriteria(formId)
  const add = useAddCriterion(formId)
  const [label, setLabel] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [weight, setWeight] = useState('1.0')

  const onAdd = async () => {
    if (!label.trim()) {
      toast.show('지표명을 입력하세요.', 'warning')
      return
    }
    try {
      await add.mutateAsync({
        label: label.trim(),
        maxScore: Number(maxScore) || 100,
        weight: Number(weight) || 1,
      })
      setLabel('')
      toast.show('지표를 추가했습니다.', 'success')
    } catch {
      toast.show('추가에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-title-sm font-medium text-gray-900">평가 지표</h3>
      {isLoading ? (
        <Spinner size="sm" />
      ) : (
        <ul className="space-y-1">
          {(data ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-body"
            >
              <span className="text-gray-800">{c.label}</span>
              <span className="tabular-nums text-caption text-gray-500">
                최대 {c.max_score} · 가중치 {c.weight}
              </span>
            </li>
          ))}
          {(data ?? []).length === 0 && (
            <li className="text-caption text-gray-400">등록된 지표가 없습니다.</li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="text-caption text-gray-500">지표명</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="w-24">
          <label className="text-caption text-gray-500">최대점</label>
          <Input
            inputMode="numeric"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
          />
        </div>
        <div className="w-24">
          <label className="text-caption text-gray-500">가중치</label>
          <Input value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <Button onClick={() => void onAdd()} disabled={add.isPending}>
          추가
        </Button>
      </div>
    </div>
  )
}
