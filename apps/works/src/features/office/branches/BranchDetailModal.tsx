import { Badge, Button, InfoField, Modal } from '@ynarcher/ui'
import type { Branch } from '@/features/office/branches/branchesApi'

interface Props {
  /** 열람 대상 지사(없으면 닫힌 상태). */
  branch: Branch | null
  /** 해당 지사의 배정인력 이름(배정 순서 유지). */
  memberNames: string[]
  onClose: () => void
}

/**
 * OFFICE 지사 상세 모달(조회 전용). 목록 표는 지사명·주소·전화번호만 보여주고,
 * 배정인력을 포함한 전체 항목은 여기서 확인한다. 하단은 닫기 하나만 둔다 —
 * 목록이 한 화면에 다 들어와 순차 이동(이전·다음)이 필요 없다.
 * 원장 수정은 MANAGEMENT '지사 관리'가 소유하므로 이 모달은 편집 수단을 두지 않는다.
 */
export function BranchDetailModal({ branch, memberNames, onClose }: Props) {
  if (!branch) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={branch.name}
      size="md"
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="space-y-2.5">
        <InfoField label="지사명" value={branch.name} />
        <InfoField label="주소" value={branch.address} />
        <InfoField label="전화번호" value={branch.phone} />
        <InfoField
          label="배정인력"
          value={
            memberNames.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {memberNames.map((n) => (
                  <Badge key={n}>{n}</Badge>
                ))}
              </span>
            ) : null
          }
        />
      </div>
    </Modal>
  )
}
