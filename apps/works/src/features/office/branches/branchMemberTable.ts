import type { Column } from '@ynarcher/ui'
import {
  branchMemberOrgLabel,
  type BranchMemberEntry,
} from '@/features/office/branches/branchMembers'

/** 조회할 수 없는 계정(퇴사·권한)의 자리. 이름을 못 읽어도 줄은 남는다 — 없애면 저장이 곧 삭제가 된다. */
const UNKNOWN_ORG = '조회할 수 없는 계정'

/** 상주인력 표의 한 줄. 이름을 못 읽은 줄인지까지가 이 표가 세우는 사실이다. */
export interface BranchMemberRow {
  entry: BranchMemberEntry
  unknown: boolean
}

/** 원장에서 읽은 사람을 표 한 줄로. 못 읽은 id도 줄을 잃지 않는다. */
export function toBranchMemberRow(
  id: string,
  entry: BranchMemberEntry | null,
): BranchMemberRow {
  return entry
    ? { entry, unknown: false }
    : { entry: { id, name: '알 수 없음', orgPath: [] }, unknown: true }
}

/**
 * 상주인력 표의 열 — OFFICE 상세와 MANAGEMENT 수정 창이 **같은 한 벌**을 쓴다.
 *
 * 두 화면이 같은 원장을 보고 갈리는 것은 고칠 수 있는가 하나뿐이라, 열 구성이 갈리면 오가는
 * 사람이 같은 값을 다른 자리에서 찾게 된다. 조직을 이름 옆 회색 글자가 아니라 자기 열로 세운
 * 것은 **배치 전인 사람이 눈에 띄어야** 하기 때문이다(2026-09-10) — 이어 붙인 한 줄에서는
 * 빈 값이 자리를 남기지 않고 사라진다.
 */
export const BRANCH_MEMBER_COLUMNS: Column<BranchMemberRow>[] = [
  { key: 'name', header: '이름', primary: true, type: 'person', render: (r) => r.entry.name },
  {
    key: 'org',
    header: '조직',
    type: 'long',
    // 배치 전이면 그 사실을 적는다 — 빈 칸은 '아직 안 읽었다'와 '없다'를 가르지 못한다.
    render: (r) => (r.unknown ? UNKNOWN_ORG : branchMemberOrgLabel(r.entry)),
  },
]
