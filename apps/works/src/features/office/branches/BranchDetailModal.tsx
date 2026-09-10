import { Button, Card, DataTable, InfoField, InfoGrid, Modal } from '@ynarcher/ui'
import type { BranchMemberEntry } from '@/features/office/branches/branchMembers'
import {
  BRANCH_MEMBER_COLUMNS,
  toBranchMemberRow,
} from '@/features/office/branches/branchMemberTable'
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
        {/* 수정 창의 담긴 기둥과 같은 표다 — 고를 수 없다는 것만 다르다(체크 칸이 서지 않는다). */}
        <DataTable
          columns={BRANCH_MEMBER_COLUMNS}
          rows={members.map((m) => toBranchMemberRow(m.id, m))}
          rowKey={(row) => row.entry.id}
          numbered={false}
          standardColumns={false}
          selectable={false}
          emptyText="배정된 상주인력이 없습니다."
        />
      </Card>
    </Modal>
  )
}
