import { Badge } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import { DOC_STATUS_LABEL, DOC_STATUS_TONE } from '@/features/approval/config'
import type { ProgramLinkType } from '@/features/approval/programLinkApi'
import { useRelatedApprovals } from '@/features/approval/relatedApprovalsApi'

/**
 * 관련 전자결재 패널(사업 상세 우측) — 결재 문서의 '워크스페이스 연동'을 **받는 쪽**이다.
 *
 * 연동은 결재 문서가 자기 소속을 밝히는 한 방향으로 저장되지만, 읽기는 양쪽에서 이뤄진다:
 * 문서를 열면 "어느 사업 건인가"(ApprovalProgramPanel), 사업을 열면 "무슨 결재가 오갔나"(여기).
 * 같은 한 행을 두 질문으로 읽는 것이므로 사업 쪽에 링크를 복제해 두지 않는다.
 *
 * **여기서 걸고 떼지 않는다.** 연동을 만드는 자리는 기안·수정 화면 하나뿐이다 — 이미 도장이
 * 찍히기 시작한 문서의 소속을 사업 화면에서 바꿀 수 있으면, 결재자가 무엇을 보고 승인했는지
 * 판정할 근거가 사라진다.
 *
 * 한 건이 한 줄짜리 링크다(관련 회의록 패널과 같은 규격) — 상태 배지·제목은 왼쪽, 종류·기안일은
 * 오른쪽 끝. 배지가 종류가 아니라 **상태**를 말하는 이유는, 사업 담당자가 이 목록에서 먼저 묻는
 * 것이 "그 건 결재 났나"이기 때문이다. 문서 번호는 싣지 않는다 — 좁은 곁다리 열에 식별자를
 * 둘씩 세우면 제목이 먹히고, 번호를 찾는 사람은 이미 문서를 열고 있다.
 * 열람 불가·삭제·임시저장 문서는 조회 단계에서 빠진다(relatedApprovalsApi 참조).
 */
export function RelatedApprovalPanel({
  targetType,
  targetId,
}: {
  targetType: ProgramLinkType
  targetId: string
}) {
  const { data: approvals = [] } = useRelatedApprovals(targetType, targetId)
  const { pageItems, page, setPage, pageCount } = usePaged(approvals, 5)

  return (
    <DetailPanelCard title="전자결재" count={approvals.length}>
      {approvals.length > 0 ? (
        <>
          <ul className="space-y-1.5">
            {pageItems.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/office?tab=approval&doc=${a.id}`}
                  className="flex min-w-0 items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-50"
                >
                  <Badge tone={DOC_STATUS_TONE[a.status]}>{DOC_STATUS_LABEL[a.status]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {a.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-x-2 text-caption text-gray-700">
                    <span>{a.docType}</span>
                    <span className="border-l border-gray-200 pl-2 tabular-nums">
                      {a.createdAt.slice(0, 10)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      ) : (
        // 빈 안내는 상자를 두르지 않는다 — 이미 패널 카드 안이라 테두리를 하나 더 그리면
        // 흰 상자 안에 흰 상자가 생기고, 같은 상세의 다른 패널들과도 어긋난다.
        <p className="text-body text-gray-600">연결된 전자결재가 없습니다.</p>
      )}
    </DetailPanelCard>
  )
}
