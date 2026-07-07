import { Button, EmptyState, Select, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { recordContribution, useEntityList, useMergeEntity } from '@/features/networks/hooks'
import type { EntityConfig } from '@/features/networks/config'

/** 중복 병합 콘솔: 중복 레코드를 정본으로 병합(merged_into_id 지정). */
export function MergeConsole({ config }: { config: EntityConfig }) {
  const toast = useToast()
  const { data, isLoading } = useEntityList(config.table, '')
  const merge = useMergeEntity(config.table)
  const [primaryId, setPrimaryId] = useState('')
  const [duplicateId, setDuplicateId] = useState('')

  if (isLoading) return <Spinner />
  const rows = data ?? []
  if (rows.length < 2) {
    return <EmptyState title="병합할 레코드가 충분하지 않습니다." />
  }

  const onMerge = async () => {
    if (!primaryId || !duplicateId || primaryId === duplicateId) {
      toast.show('서로 다른 정본/중복 레코드를 선택하세요.', 'warning')
      return
    }
    try {
      await merge.mutateAsync({ primaryId, duplicateId })
      const dupName = rows.find((r) => r.id === duplicateId)?.name
      await recordContribution({
        table: config.table,
        id: primaryId,
        action: 'merged',
        source: 'manual',
        note: dupName ? `중복 '${dupName}' 병합` : '중복 병합',
      })
      toast.show('중복 레코드를 병합했습니다.', 'success')
      setDuplicateId('')
    } catch {
      toast.show('병합에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-body text-gray-600">
        중복 레코드를 정본(Primary)으로 병합합니다. 병합된 레코드는 목록에서 숨겨지며 병합 이력이 감사 로그에 기록됩니다.
      </p>
      <div>
        <label className="text-body font-medium text-gray-800">정본(Primary)</label>
        <Select value={primaryId} onChange={(e) => setPrimaryId(e.target.value)}>
          <option value="">선택</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="text-body font-medium text-gray-800">중복(Duplicate)</label>
        <Select value={duplicateId} onChange={(e) => setDuplicateId(e.target.value)}>
          <option value="">선택</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      <Button onClick={() => void onMerge()} disabled={merge.isPending}>
        병합 실행
      </Button>
    </div>
  )
}
