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
 * 관련 전자결재 패널(프로그램 상세 우측). 운영 프로그램 보드와 동일하게 항목마다
 * 테두리 박스로 경계를 뚜렷이 하고(상단 유형·제목 / 하단 구분선 + 기안일·문서번호),
 * 빈 상태도 박스로 마감해 리스트의 끝이 명확히 보이도록 한다. 10개 단위로 페이징한다.
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
          <ul className="space-y-2.5">
            {pageItems.map((a) => (
              <li
                key={a.id}
                className="rounded-radius-md border border-gray-300 bg-white px-4 py-3"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {a.docType}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {a.title}
                  </span>
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-gray-200 pt-2 text-caption text-gray-700">
                  <span className="tabular-nums">{a.date}</span>
                  <span className="border-l border-gray-200 pl-2 tabular-nums">
                    {a.docNo}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      ) : (
        <p className="rounded-radius-md border border-gray-300 bg-white px-4 py-6 text-center text-body text-gray-600">
          연결된 전자결재가 없습니다.
        </p>
      )}
    </DetailPanelCard>
  )
}
