import {
  Badge,
  Button,
  DataTable,
  Input,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { EntityFormModal } from '@/features/networks/EntityFormModal'
import { useEntityList, type EntityRow } from '@/features/networks/hooks'
import type { EntityConfig } from '@/features/networks/config'

/** 엔티티 디렉토리 탭: 검색 + 목록 + 등록/수정. */
export function DirectoryTab({ config }: { config: EntityConfig }) {
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<EntityRow | null>(null)
  const [creating, setCreating] = useState(false)
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
      <div className="flex items-center gap-2">
        <Input
          placeholder={`${config.label} 이름 검색`}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)}>{config.label} 등록</Button>
      </div>

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
