import { useMemo } from 'react'
import type { EntityRow } from '@/features/networks/hooks'
import {
  RecentRegisteredFeed,
  type RecentItem,
} from '@/features/networks/dashboard/RecentRegisteredFeed'
import {
  MANAGEMENT_STATUS_LABEL,
  MANAGEMENT_STATUS_TONE,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

/**
 * 최근 등록 기업 피드 — 스타트업 원장 행을 구분(management_status) 배지로 매핑해
 * 공용 주간 피드(RecentRegisteredFeed)에 넘긴다. NETWORKS 최근 등록 네트워크와 동일 컴포넌트.
 */
export function RecentStartupsFeed({
  rows,
  onOpen,
}: {
  rows: EntityRow[]
  onOpen: (r: EntityRow) => void
}) {
  const items = useMemo<RecentItem[]>(
    () =>
      rows.map((r) => {
        const status = r.management_status as ManagementStatus
        return {
          id: r.id,
          name: r.name,
          createdAt: typeof r.created_at === 'string' ? r.created_at : null,
          badge: {
            label: MANAGEMENT_STATUS_LABEL[status] ?? '-',
            tone: MANAGEMENT_STATUS_TONE[status] ?? 'neutral',
          },
        }
      }),
    [rows],
  )
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  return (
    <RecentRegisteredFeed
      items={items}
      onOpen={(id) => {
        const row = byId.get(id)
        if (row) onOpen(row)
      }}
    />
  )
}
