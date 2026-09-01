import { Card } from '@ynarcher/ui'
import { useModuleNotices } from '@/features/noticeHooks'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 메뉴 본문 우측의 NOTICE — WORKS 모듈 화면 우측의 NOTICE 패널과 같은 구성의 읽기 전용판이다.
 *
 * **메뉴 하나 = 알림 하나**(WORKS와 같은 판정 — 최신 미삭제 한 건이 곧 알림)이며, 등록된
 * 알림이 없으면 카드 자체를 세우지 않는다 — 늘 비어 있는 카드는 아무에게도 답하는 것이
 * 없다(작성 버튼이 서야 하는 WORKS와 다른 점). 머리는 [브랜드 바 | 공지명 | 게시일] 한 줄,
 * 본문은 바 폭만큼 들여 머리와 같은 축에 선다.
 *
 * 어느 메뉴에 세울지는 ModulePage가 정한다. 글쓰기(POST) 메뉴는 제외한다(그 화면 자체가
 * 글이라 알림 글이 나란히 서면 어느 쪽이 본문인지 흐려진다).
 */
export function GuestNoticeRail({ moduleId }: { moduleId: string }) {
  const { data: notices } = useModuleNotices(moduleId)
  const notice = (notices ?? [])[0]
  if (!notice) return null

  // 본문은 WORKS 공용 에디터가 쓴 HTML — 글쓰기 본문과 같은 정화기·조판을 태운다.
  const body = sanitizeRichText(notice.body)

  return (
    <Card title="NOTICE">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
        <p className="min-w-0 flex-1 truncate text-body font-medium text-gray-900">
          {notice.title}
        </p>
        <span className="shrink-0 text-caption tabular-nums text-gray-500">
          {notice.created_at.slice(0, 10)}
        </span>
      </div>
      {body && (
        <div
          className={`mt-1.5 pl-2.5 ${RICH_BODY_CLASS}`}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      )}
    </Card>
  )
}
