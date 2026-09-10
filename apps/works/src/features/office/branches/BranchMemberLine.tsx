import { cardText, cn } from '@ynarcher/ui'
import {
  branchMemberOrgLabel,
  type BranchMemberEntry,
} from '@/features/office/branches/branchMembers'

/**
 * 상주인력 한 사람 — **이름 한 줄, 조직에서 배치된 자리 한 줄**.
 *
 * 이 줄이 서는 자리는 셋이다(OFFICE 상세의 명단, MANAGEMENT 수정 창의 좌·우 기둥). 셋은 조회와
 * 편집으로 갈리지만 담당자가 보는 것은 같은 사람이므로, 자리마다 다르게 생길 이유가 없다.
 *
 * 이름과 자리를 한 줄에 나란히 두지 않는 이유는 폭이다 — 자리는 루트부터의 경로 전체(와이앤아처 ·
 * 지원본부 · 경영지원1실)라 이름보다 길고, 좌우로 가른 기둥 안에서는 한 줄에 둘을 세우면 정작
 * 사람을 가리는 이름이 먼저 잘린다. 두 줄로 세우면 어느 폭에서도 이름은 온전하다.
 */
export function BranchMemberLine({
  entry,
  meta,
}: {
  entry: BranchMemberEntry
  /** 아랫줄 대체 문구. 조직 경로를 답할 수 없는 줄(조회 불가 계정)에만 준다. */
  meta?: string
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-body font-medium text-gray-900">{entry.name}</span>
      <span className={cn('block truncate', cardText.meta)}>
        {meta ?? branchMemberOrgLabel(entry)}
      </span>
    </span>
  )
}
