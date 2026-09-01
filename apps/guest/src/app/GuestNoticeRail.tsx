import { Card } from '@ynarcher/ui'
import { useModuleNotices } from '@/features/noticeHooks'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 메뉴 본문 우측의 NOTICE — WORKS 모듈 화면 우측의 NOTICE 패널과 같은 구성
 * (제목·본문·날짜 목록)의 읽기 전용판이다.
 *
 * 어느 메뉴에 세울지는 ModulePage가 정한다 — 머리(이름·안내·진행기간)와 그 밑 구분선은
 * 전체 폭으로 서고, NOTICE는 구분선 아래에서 본문과 나란히 선다. 글쓰기(POST) 메뉴는
 * 제외한다(그 화면 자체가 글이라 알림 글이 나란히 서면 어느 쪽이 본문인지 흐려진다).
 */
export function GuestNoticeRail({ moduleId }: { moduleId: string }) {
  const { data: notices } = useModuleNotices(moduleId)
  const list = notices ?? []

  return (
    <Card title="NOTICE" count={list.length}>
      <div className="space-y-2">
        {list.map((notice) => {
          // 본문은 WORKS 공용 에디터가 쓴 HTML — 글쓰기 본문과 같은 정화기·조판을 태운다.
          const body = sanitizeRichText(notice.body)
          return (
            <div key={notice.id} className="rounded-radius-md border border-gray-300 px-3 py-2">
              {/* 머리(공지명·게시일)와 본문을 헤어라인으로 가른다 — WORKS NOTICE 행과 같은 구성. */}
              <p className="text-body font-medium text-gray-900">{notice.title}</p>
              <p className="mt-0.5 text-caption tabular-nums text-gray-500">
                {notice.created_at.slice(0, 10)}
              </p>
              {body && (
                <div
                  className={`mt-2 border-t border-gray-200 pt-2 ${RICH_BODY_CLASS}`}
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              )}
            </div>
          )
        })}
        {list.length === 0 && (
          <p className="py-4 text-center text-caption text-gray-500">등록된 알림이 없습니다.</p>
        )}
      </div>
    </Card>
  )
}
