import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { ASSET_LABELS, assetTone } from '@/features/management/config'
import { useAssets, type Asset } from '@/features/management/hooks'

/** 사내 자산/비품 관리 대시보드(할당 상태·회수 예정일 트래킹). */
export function AssetsPanel() {
  const { data, isLoading } = useAssets()

  const columns: Column<Asset>[] = [
    { key: 'name', header: '자산명', render: (r) => r.name },
    { key: 'category', header: '분류', render: (r) => r.category ?? '-' },
    {
      key: 'status',
      header: '상태',
      render: (r) => <Badge tone={assetTone[r.status]}>{ASSET_LABELS[r.status]}</Badge>,
    },
    {
      key: 'assigned_to',
      header: '할당 대상',
      render: (r) => (r.assigned_to ? r.assigned_to.slice(0, 8) : '-'),
    },
    {
      key: 'return_due',
      header: '회수 예정일',
      render: (r) => r.return_due ?? '-',
    },
  ]

  if (isLoading) return <Spinner />

  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="등록된 자산이 없습니다."
    />
  )
}
