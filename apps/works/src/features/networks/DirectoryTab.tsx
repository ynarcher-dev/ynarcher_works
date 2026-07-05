import {
  Badge,
  Button,
  DataTable,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { EntityFormModal } from '@/features/networks/EntityFormModal'
import { useEntityList, type EntityRow } from '@/features/networks/hooks'
import type { EntityConfig } from '@/features/networks/config'

interface DirectoryTabProps {
  config: EntityConfig
  keyword: string
  creating: boolean
  setCreating: (c: boolean) => void
}

/** 엔티티 디렉토리 탭: 검색 + 목록 + 등록/수정. */
export function DirectoryTab({ config, keyword, creating, setCreating }: DirectoryTabProps) {
  const [editing, setEditing] = useState<EntityRow | null>(null)
  const { data, isLoading } = useEntityList(config.table, keyword)

  const columns = useMemo<Column<EntityRow>[]>(() => {
    const base: Column<EntityRow>[] = config.fields.map((f) => ({
      key: f.name,
      header: f.label,
      render: (r) => (r[f.name] as string) ?? '-',
    }))
    base.push({
      key: '_status',
      header: '상태',
      render: (r) =>
        r.is_provisional ? <Badge tone="warning">임시</Badge> : <Badge tone="success">정본</Badge>,
    })
    base.push({
      key: '_action',
      header: '',
      align: 'right',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
          수정
        </Button>
      ),
    })
    return base
  }, [config])

  return (
    <div className="space-y-3">
      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(r) => r.id}
          emptyText={`등록된 ${config.label}이(가) 없습니다.`}
        />
      )}

      <EntityFormModal
        config={config}
        open={creating}
        onClose={() => setCreating(false)}
        initial={null}
      />
      <EntityFormModal
        config={config}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        initial={editing}
      />
    </div>
  )
}
