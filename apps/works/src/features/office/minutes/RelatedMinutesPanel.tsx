import { Badge } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@ynarcher/ui'
import { MINUTE_VISIBILITY_LABEL } from '@/features/office/minutes/minutesApi'
import type { MinuteLinkTargetType } from '@/features/office/minutes/minuteLinks'
import { useRelatedMinutes } from '@/features/office/minutes/relatedMinutesApi'

/**
 * 관련 회의록 패널(사업/스타트업 상세 우측). 이 대상에 연동된, 요청자가 열람 가능한 회의록을
 * 최신순으로 보여준다(열람 불가·삭제된 회의록은 RLS가 애초에 제외 — relatedMinutesApi 참조).
 * 항목 클릭 시 OFFICE 회의록 딥링크(?tab=minutes&minute=)로 이동한다.
 *
 * 한 건을 한 줄로 마감한다 — 공개범위·제목은 왼쪽, 일자·작성자는 오른쪽 끝에 붙인다. 상세의
 * 곁다리 패널이라 세로 자리를 아낄수록 본문이 먼저 보이며, 제목이 길어지면 줄을 늘리는 대신
 * 잘라낸다(전체 제목은 이동한 회의록 상세가 답한다).
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
          <ul className="space-y-1.5">
            {pageItems.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/office?tab=minutes&minute=${m.id}`}
                  className="flex min-w-0 items-center gap-2 rounded-radius-md border border-gray-300 bg-white px-3 py-2 transition-colors hover:bg-gray-50"
                >
                  <Badge tone={m.visibility === 'OFFICE' ? 'info' : 'neutral'}>
                    {MINUTE_VISIBILITY_LABEL[m.visibility]}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                    {m.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-x-2 text-caption text-gray-700">
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
        // 빈 안내는 상자를 두르지 않는다 — 이미 패널 카드 안이라 테두리를 하나 더 그리면
        // 흰 상자 안에 흰 상자가 생기고, 같은 상세 화면의 다른 패널(자료·코멘트·변동 이력)이
        // 전부 문장 한 줄만 두는 것과도 어긋난다.
        <p className="text-body text-gray-600">연동된 회의록이 없습니다.</p>
      )}
    </DetailPanelCard>
  )
}
