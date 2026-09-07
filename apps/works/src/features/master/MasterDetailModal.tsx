import { Button, InfoRows, Modal } from '@ynarcher/ui'
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
export function MasterDetailModal({ label, columns, row, open, onClose }: MasterDetailModalProps) {
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
      {/* 라벨:값 규격은 화면이 아니라 `InfoRows`가 소유한다 — 여기서 라벨 축 폭을 직접 잡으면
          카드·상세와 다른 세 번째 규격이 된다. 빈 값 처리도 이 컴포넌트가 함께 답한다. */}
      {row && (
        <InfoRows
          items={columns.map((c) => ({
            label: c.label,
            value: (row[c.name] as string | null | undefined) ?? '',
          }))}
        />
      )}
    </Modal>
  )
}
