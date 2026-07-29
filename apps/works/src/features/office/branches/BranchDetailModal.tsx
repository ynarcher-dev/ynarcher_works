import { Button, InfoField, Modal } from '@ynarcher/ui'
import type { BranchMemberEntry } from '@/features/office/branches/branchMembers'
import type { Branch } from '@/features/office/branches/branchesApi'

interface Props {
  /** 열람 대상 지사(없으면 닫힌 상태). */
  branch: Branch | null
  /** 해당 지사의 상주인력(배정 순서 유지). */
  members: BranchMemberEntry[]
  onClose: () => void
}

/**
 * OFFICE 지사 상세 모달(조회 전용). 목록 표는 지사명·주소·전화번호만 보여주고,
 * 상주인력을 포함한 전체 항목은 여기서 확인한다. 하단은 닫기 하나만 둔다 —
 * 목록이 한 화면에 다 들어와 순차 이동(이전·다음)이 필요 없다.
 * 원장 수정은 MANAGEMENT '지사 관리'가 소유하므로 이 모달은 편집 수단을 두지 않는다.
 */
export function BranchDetailModal({ branch, members, onClose }: Props) {
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
        {/*
          이름과 조직관리에서 배치된 자리를 한 사람 한 줄로 세운다(태그 나열은 자리 정보를 담지 못한다).
          자리는 직접 소속만이 아니라 최상위 조직까지의 경로 전체다 — 레벨 수가 조직관리에서
          동적으로 늘고 줄기 때문에 몇 단이든 그대로 따라 붙는다.
        */}
        <InfoField
          label="상주인력"
          value={
            members.length > 0 ? (
              <span className="flex flex-col gap-1">
                {members.map((m) => (
                  <span key={m.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-gray-900">{m.name}</span>
                    <span className="text-gray-500">
                      {m.orgPath.length > 0
                        ? m.orgPath.map((step) => step.name).join(' · ')
                        : '조직 미배치'}
                    </span>
                  </span>
                ))}
              </span>
            ) : null
          }
        />
      </div>
    </Modal>
  )
}
