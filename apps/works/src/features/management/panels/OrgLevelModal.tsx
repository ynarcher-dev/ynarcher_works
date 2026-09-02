import { Button, Modal } from '@ynarcher/ui'
import type { OrgEditing } from '@/features/management/orgEditHooks'
import { OrgLevelEditor } from '@/features/management/panels/OrgLevelEditor'

interface OrgLevelModalProps {
  open: boolean
  onClose: () => void
  editing: OrgEditing
}

/**
 * 조직 레벨(= 인사관리 컬럼) 정의 모달.
 *
 * 레벨은 조직 하나가 아니라 이 버전 전체의 눈금이라 트리 옆에 상시로 펴 두지 않는다 —
 * 한 번 정하면 오래 안 건드리는 설정이 화면 위쪽을 계속 차지하면 정작 자주 하는 일(조직·인력)이
 * 아래로 밀린다. 그래서 조직 운영 기간 옆 진입점에서 필요할 때만 연다.
 */
export function OrgLevelModal({ open, onClose, editing }: OrgLevelModalProps) {
  const close = () => {
    void editing.save()
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="조직 레벨"
      help={
        '오른쪽으로 갈수록 하위 계층이고, 세로로 쌓인 것은 같은 계층의 병렬 레벨(본부·실 같은 볼륨)입니다.\n\n조직 레벨은 이 버전에만 적용되는 스냅샷입니다. 예정 버전에서의 변경은 발효 전까지 현재 조직·인사에 영향을 주지 않습니다.'
      }
      footer={<Button onClick={close}>완료</Button>}
    >
      <div className="space-y-2">
        <OrgLevelEditor
          levels={editing.levels}
          draftNames={editing.levelDraftNames}
          onDraftNameChange={editing.changeLevelDraftName}
          onAddTier={editing.addTier}
          onAddParallel={editing.addParallel}
          onRemove={editing.removeLevel}
          onSave={() => void editing.save()}
          onCancel={editing.cancel}
        />
      </div>
    </Modal>
  )
}
