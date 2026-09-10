import {
  Button,
  Card,
  InfoField,
  InfoGrid,
  Modal,
  PickLine,
  PickList,
  cn,
  panelRowBox,
} from '@ynarcher/ui'
import {
  branchMemberOrgLabel,
  type BranchMemberEntry,
} from '@/features/office/branches/branchMembers'
import type { Branch } from '@/features/office/branches/branchesApi'

interface Props {
  /** 열람 대상 지사(없으면 닫힌 상태). */
  branch: Branch | null
  /** 해당 지사의 상주인력(배정 순서 유지). */
  members: BranchMemberEntry[]
  onClose: () => void
}

/**
 * OFFICE 지사 상세 모달(조회 전용). 목록 표는 지사명·주소·전화번호와 상주인력 '수'까지만
 * 보여주고, 누가 있는지는 여기서 확인한다.
 *
 * **MANAGEMENT '지사 관리'의 수정 창과 같은 구성이다**(2026-09-10) — 위에 지사 정보 카드,
 * 아래에 상주인력 카드이고 사람 한 줄의 생김새도 같다. 두 화면이 같은 원장을 보는데 항목 순서와
 * 줄 모양이 갈리면, 오가는 사람이 매번 같은 값을 다른 자리에서 찾게 된다. 갈리는 것은 고칠 수
 * 있는가 하나뿐이다 — 원장 수정은 MANAGEMENT가 소유하므로 이 모달에는 편집 수단이 없고,
 * 상주인력도 좌우로 가르지 않고 결과 목록 하나만 선다.
 *
 * 하단은 닫기 하나만 둔다 — 목록이 한 화면에 다 들어와 순차 이동(이전·다음)이 필요 없다.
 */
export function BranchDetailModal({ branch, members, onClose }: Props) {
  if (!branch) return null

  return (
    <Modal
      open
      onClose={onClose}
      title={branch.name}
      size="md"
      sectioned
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <Card title="지사 정보">
        {/* 짧은 값 둘은 한 줄에 나란히, 주소는 길이의 상한을 몰라 전폭을 받는다(수정 창과 같은 배치). */}
        <InfoGrid columns={2}>
          <InfoField label="지사명" value={branch.name} />
          <InfoField label="전화번호" value={branch.phone} />
          <InfoField label="주소" value={branch.address} className="sm:col-span-2" />
        </InfoGrid>
      </Card>

      <Card title="상주인력" count={members.length}>
        <div className="overflow-hidden rounded-radius-md border border-gray-200">
          <PickList isEmpty={members.length === 0} empty="배정된 상주인력이 없습니다.">
            {members.map((m) => (
              // 고를 수 없는 줄이라 버튼(PickRow)이 아니다 — 눌리지 않는 것에 눌리는 생김새를
              // 주면 담당자가 눌러 보고서야 조회 전용임을 안다. 여백만 같은 값을 쓴다.
              <li key={m.id} className={cn('flex items-center gap-3', panelRowBox)}>
                <PickLine name={m.name} meta={branchMemberOrgLabel(m)} />
              </li>
            ))}
          </PickList>
        </div>
      </Card>
    </Modal>
  )
}
