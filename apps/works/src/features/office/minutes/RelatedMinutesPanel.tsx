import { Badge } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import { MINUTE_VISIBILITY_LABEL } from '@/features/office/minutes/minutesApi'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'
import { useRelatedMinutes } from '@/features/office/minutes/relatedMinutesApi'

/**
 * 관련 회의록 패널(사업/스타트업 상세 우측). 이 대상에 연동된, 요청자가 열람 가능한 회의록을
 * 최신순으로 보여준다(열람 불가·삭제된 회의록은 RLS가 애초에 제외 — relatedMinutesApi 참조).
 * 항목 클릭 시 OFFICE 회의록 딥링크(?tab=minutes&minute=)로 이동한다.
 * RelatedApprovalPanel과 동일한 박스형 리스트·빈 상태·5개 페이징을 따른다.
 */
export function RelatedMinutesPanel({
  targetType,
  targetId,
}: {
  targetType: MinuteLinkTargetType
  targetId: string
}) {
  const { data: minutes = [] } = useRelatedMinutes(targetType, targetId)
  const { pageItems, page, setPage, pageCount } = usePaged(minutes, 5)

  return (
    <DetailPanelCard title="관련 회의록" count={minutes.length}>
      {minutes.length > 0 ? (
        <>
          <ul className="space-y-2.5">
            {pageItems.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/office?tab=minutes&minute=${m.id}`}
                  className="block rounded-radius-md border border-gray-300 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={m.visibility === 'OFFICE' ? 'info' : 'neutral'}>
                      {MINUTE_VISIBILITY_LABEL[m.visibility]}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                      {m.title}
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-gray-200 pt-2 text-caption text-gray-700">
                    <span className="tabular-nums">{m.meetingDate ?? '일자 미정'}</span>
                    {m.authorName && (
                      <span className="border-l border-gray-200 pl-2">{m.authorName}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      ) : (
        <p className="rounded-radius-md border border-gray-300 bg-white px-4 py-6 text-center text-body text-gray-600">
          연동된 회의록이 없습니다.
        </p>
      )}
    </DetailPanelCard>
  )
}
