import { Button } from '@ynarcher/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DealFormModal } from '@/features/mna/DealFormModal'
import { KanbanBoard } from '@/features/mna/KanbanBoard'
import { MatchingMatrix } from '@/features/mna/MatchingMatrix'

/** M&A 워크스페이스: 딜 소싱 칸반 / 매칭 매트릭스. 섹션 전환은 사이드바(?tab). */
export function MnaPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'kanban'
  const [creating, setCreating] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-title-lg font-bold text-gray-900">
          M&amp;A · {tab === 'matching' ? '매칭 매트릭스' : '딜 소싱 칸반'}
        </h1>
        {tab !== 'matching' && (
          <Button onClick={() => setCreating(true)}>딜 생성</Button>
        )}
      </div>

      {tab === 'matching' ? <MatchingMatrix /> : <KanbanBoard />}

      <DealFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
