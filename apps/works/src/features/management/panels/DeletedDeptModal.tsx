import { Button, Modal } from '@ynarcher/ui'
import type { OrgEditing } from '@/features/management/orgEditHooks'
import { DeletedDeptList } from '@/features/management/panels/DeletedDeptList'

interface DeletedDeptModalProps {
  open: boolean
  onClose: () => void
  editing: OrgEditing
}

/**
 * 삭제된 조직 모달 — 복원만 제공한다(물리 삭제는 정책상 금지).
 * 폐지된 조직은 평소 볼 일이 없어 트리 아래 상시 노출 대신 진입점 뒤에 둔다.
 */
export function DeletedDeptModal({ open, onClose, editing }: DeletedDeptModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="삭제된 조직"
      footer={
        <Button variant="outline" onClick={onClose}>
          닫기
        </Button>
      }
    >
      {editing.removed.length === 0 ? (
        <p className="py-6 text-center text-body text-gray-500">삭제된 조직이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          <DeletedDeptList nodes={editing.removed} onRestore={editing.restore} />
          <p className="text-caption text-gray-600">
            · 복원하면 하위 조직까지 함께 되살아납니다. 다만 삭제 시 끊긴 인력 배치는 되돌아오지
            않으므로, 복원 후 다시 배치해야 합니다.
          </p>
        </div>
      )}
    </Modal>
  )
}
