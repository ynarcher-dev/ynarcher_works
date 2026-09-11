import { Button, DataTable, ListToolbar, Modal, Spinner, type Column } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { InactiveLedgerDeleteModal } from '@/features/master/InactiveLedgerDeleteModal'
import { InactiveLedgerRestoreModal } from '@/features/master/InactiveLedgerRestoreModal'
import {
  useInactiveLedgerCount,
  useInactiveLedgerPage,
  type InactiveLedgerKey,
  type InactiveLedgerRow,
} from '@/features/master/inactiveLedgerHooks'
import { categoryLabel } from '@/features/networks/config'
import { managementStatusLabel } from '@/features/startup/startupClassification'
import { useDebounced } from '@/lib/useDebounced'

const PAGE_SIZE = 20

const LEDGER_META: Record<InactiveLedgerKey, {
  noun: string
  detailHeader: string
  searchPlaceholder: string
  categoryLabel: (value: string | null) => string
}> = {
  startups: {
    noun: '스타트업',
    detailHeader: '대표자',
    searchPlaceholder: '기업명·대표자 검색',
    categoryLabel: (value) => managementStatusLabel(value) ?? '-',
  },
  networks: {
    noun: '네트워크',
    detailHeader: '소속',
    searchPlaceholder: '이름·소속 검색',
    categoryLabel: (value) => categoryLabel(value) || '-',
  },
}

interface ModalProps {
  ledger: InactiveLedgerKey
  open: boolean
  onClose: () => void
}

/** 비활성 원장을 검색·검토하고 단건·다중 복구/삭제하는 ADMIN 전용 목록 모달. */
export function InactiveLedgerModal({ ledger, open, onClose }: ModalProps) {
  const meta = LEDGER_META[ledger]
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [restoreTargets, setRestoreTargets] = useState<InactiveLedgerRow[]>([])
  const [bulkRestore, setBulkRestore] = useState(false)
  const [deleteTargets, setDeleteTargets] = useState<InactiveLedgerRow[]>([])
  const [bulkDelete, setBulkDelete] = useState(false)
  const debouncedKeyword = useDebounced(keyword)
  const { data, isLoading } = useInactiveLedgerPage(
    ledger,
    debouncedKeyword,
    page,
    PAGE_SIZE,
    open,
  )

  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [debouncedKeyword, ledger])

  useEffect(() => setSelected([]), [page])

  const selectedRows = (data?.rows ?? []).filter((row) => selected.includes(row.entity_id))

  const close = () => {
    setKeyword('')
    setPage(0)
    setSelected([])
    setRestoreTargets([])
    setBulkRestore(false)
    setDeleteTargets([])
    setBulkDelete(false)
    onClose()
  }

  const askRestore = (row: InactiveLedgerRow) => {
    setRestoreTargets([row])
    setBulkRestore(false)
  }

  const columns = useMemo<Column<InactiveLedgerRow>[]>(() => [
    { key: 'entity_name', header: meta.noun, type: 'name', render: (r) => r.entity_name },
    {
      key: 'category',
      header: '구분',
      type: 'code',
      render: (r) => meta.categoryLabel(r.category),
    },
    {
      key: 'detail',
      header: meta.detailHeader,
      type: 'text',
      render: (r) => r.detail || '-',
    },
    {
      key: 'deleted_at',
      header: '비활성일',
      type: 'date',
      render: (r) => r.deleted_at.slice(0, 10),
    },
    {
      key: 'deactivated_by',
      header: '처리자',
      type: 'person',
      render: (r) => r.deactivated_by || '-',
    },
    {
      key: 'deactivation_reason',
      header: '사유',
      type: 'long',
      render: (r) => (
        <span className="block truncate" title={r.deactivation_reason ?? undefined}>
          {r.deactivation_reason || '-'}
        </span>
      ),
    },
    {
      key: 'restore',
      header: '',
      widthRem: 10,
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="outline" onClick={() => askRestore(r)}>
            복구
          </Button>
          <Button
            variant="outline-danger"
            onClick={() => {
              setDeleteTargets([r])
              setBulkDelete(false)
            }}
          >
            영구 삭제
          </Button>
        </div>
      ),
    },
  ], [meta])

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={`비활성 ${meta.noun} 원장`}
        help="비활성화된 미병합 데이터만 표시합니다. 복구하면 활성 목록과 변동 이력에 즉시 반영됩니다."
        size="2xl"
        footer={<Button variant="secondary" onClick={close}>닫기</Button>}
      >
        <div className="space-y-3">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            searchPlaceholder={meta.searchPlaceholder}
          />
          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
              <span className="text-body font-semibold text-gray-900">
                {selectedRows.length}건 선택
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRestoreTargets(selectedRows)
                    setBulkRestore(true)
                  }}
                >
                  선택 복구
                </Button>
                <Button
                  variant="outline-danger"
                  onClick={() => {
                    setDeleteTargets(selectedRows)
                    setBulkDelete(true)
                  }}
                >
                  선택 영구 삭제
                </Button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <DataTable
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(r) => r.entity_id}
              numbered
              selectable
              selectedKeys={selected}
              onSelectionChange={setSelected}
              standardColumns={false}
              layout="fixed"
              meta={{ active: () => true }}
              pagination={{
                page,
                pageSize: PAGE_SIZE,
                total: data?.total ?? 0,
                onChange: setPage,
              }}
              emptyText={`비활성 ${meta.noun} 데이터가 없습니다.`}
            />
          )}
        </div>
      </Modal>

      {restoreTargets.length > 0 && (
        <InactiveLedgerRestoreModal
          ledger={ledger}
          targets={restoreTargets}
          bulk={bulkRestore}
          onClose={() => {
            setRestoreTargets([])
            setBulkRestore(false)
          }}
          onRestored={() => {
            if (restoreTargets.length === (data?.rows.length ?? 0) && page > 0) {
              setPage((p) => p - 1)
            }
            setSelected([])
            setRestoreTargets([])
            setBulkRestore(false)
          }}
        />
      )}

      {deleteTargets.length > 0 && (
        <InactiveLedgerDeleteModal
          ledger={ledger}
          targets={deleteTargets}
          bulk={bulkDelete}
          onClose={() => {
            setDeleteTargets([])
            setBulkDelete(false)
          }}
          onDeleted={() => {
            if (deleteTargets.length === (data?.rows.length ?? 0) && page > 0) {
              setPage((p) => p - 1)
            }
            setSelected([])
            setDeleteTargets([])
            setBulkDelete(false)
          }}
        />
      )}
    </>
  )
}

/** 각 공용 DB 목록 툴바에 놓이는 관리자 전용 진입 버튼. */
export function InactiveLedgerButton({ ledger }: { ledger: InactiveLedgerKey }) {
  const isAdmin = useAuthStore((s) => s.user?.role === 'super_admin')
  const [open, setOpen] = useState(false)
  const { data: count } = useInactiveLedgerCount(ledger, isAdmin)
  if (!isAdmin) return null

  return (
    <>
      <Button variant="outline" density="page" onClick={() => setOpen(true)}>
        비활성 원장{count == null ? '' : ` (${count.toLocaleString()})`}
      </Button>
      <InactiveLedgerModal ledger={ledger} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
