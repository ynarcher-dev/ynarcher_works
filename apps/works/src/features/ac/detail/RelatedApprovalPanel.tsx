import { Badge } from '@ynarcher/ui'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'

/**
 * 프로그램에 연결된 전자결재 문서 1건(목록 행).
 * 세부 필드·문서 유형 코드값은 후속 작업(전자결재↔프로그램 연동)에서 확정한다.
 */
export interface RelatedApproval {
  id: string
  /** 기안일(YYYY-MM-DD). */
  date: string
  /** 문서 유형(예: 품의 · 지출). 코드값은 후속 확정. */
  docType: string
  /** 문서 번호. */
  docNo: string
  /** 제목. */
  title: string
}

/**
 * 관련 전자결재 패널(프로그램 상세 우측). 변동 이력과 동일한 리스트 형태로,
 * 날짜·유형·문서 번호·제목을 노출하고 10개 단위로 페이징한다.
 * 데이터(연결된 결재 문서)는 상위에서 조회해 주입하며, 미지정 시 빈 상태를 노출한다.
 */
export function RelatedApprovalPanel({
  approvals = [],
}: {
  approvals?: RelatedApproval[]
}) {
  const { pageItems, page, setPage, pageCount } = usePaged(approvals, 10)

  return (
    <DetailPanelCard title="전자결재" count={approvals.length}>
      {approvals.length > 0 ? (
        <>
          <ul className="space-y-2">
            {pageItems.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 text-body text-gray-800"
              >
                <span className="text-caption tabular-nums text-gray-400">
                  {a.date}
                </span>
                <Badge tone="neutral" size="sm">
                  {a.docType}
                </Badge>
                <span className="text-caption tabular-nums text-gray-500">
                  {a.docNo}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {a.title}
                </span>
              </li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      ) : (
        <p className="text-body text-gray-400">연결된 전자결재가 없습니다.</p>
      )}
    </DetailPanelCard>
  )
}
