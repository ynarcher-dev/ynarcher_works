import { Button, Modal } from '@ynarcher/ui'
import type { MasterColumn, MasterRow } from '@/features/master/types'

interface MasterDetailModalProps {
  label: string
  columns: MasterColumn[]
  row: MasterRow | null
  open: boolean
  onClose: () => void
}

/**
 * 마스터 상세 보기(읽기 전용). 목록은 마스킹하지만 상세에서는 개인정보 원본을 노출한다.
 * NETWORKS·HUB 공용.
 */
export function MasterDetailModal({
  label,
  columns,
  row,
  open,
  onClose,
}: MasterDetailModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${label} 상세`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      {row && (
        <dl className="space-y-2.5">
          {columns.map((c) => (
            <div key={c.name} className="flex gap-3">
              <dt className="w-28 shrink-0 text-caption font-medium text-gray-600">
                {c.label}
              </dt>
              <dd className="text-body text-gray-800">
                {(row[c.name] as string | null | undefined) ?? '-'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  )
}
