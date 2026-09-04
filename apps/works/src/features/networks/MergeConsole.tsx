import { Button, EmptyState, Select, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useNetworkList, useMergeNetwork } from '@/features/networks/hooks'
import type { NetworkCategory } from '@/features/networks/config'

/**
 * 중복 병합 콘솔: 중복 레코드를 정본으로 병합(merged_into_id 지정).
 * 구분을 주면 그 구분 안에서만 후보를 세운다 — 원장이 하나라 구분을 주지 않으면 전부가 후보다.
 */
export function MergeConsole({ category }: { category?: NetworkCategory }) {
  const toast = useToast()
  const { data, isLoading } = useNetworkList('', category)
  const merge = useMergeNetwork()
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
      // 이력은 RPC가 양쪽에 남긴다 — 정본에는 아래 사유로, 중복에는 '정본으로 병합됨'으로.
      const dupName = rows.find((r) => r.id === duplicateId)?.name
      await merge.mutateAsync({
        primaryId,
        duplicateId,
        note: dupName ? `중복 '${dupName}' 병합` : undefined,
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
