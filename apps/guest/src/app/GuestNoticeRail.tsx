import { Card } from '@ynarcher/ui'
import { useMatch } from 'react-router-dom'
import { useGuestModules } from '@/features/moduleHooks'
import { useModuleNotices } from '@/features/noticeHooks'

/**
 * 콘텐츠 우측 칸의 NOTICE — WORKS 모듈 화면 우측의 NOTICE 패널과 같은 구성
 * (제목·본문·날짜 목록)의 읽기 전용판이다.
 *
 * 메뉴(모듈) 화면에서만 선다. 글쓰기(POST) 메뉴는 제외한다 — 그 화면 자체가 글이라
 * 알림 글이 나란히 서면 어느 쪽이 본문인지 흐려진다. 그 밖의 화면(마이페이지·전문가 뷰)
 * 에서는 아무것도 그리지 않아 우측 칸이 종전처럼 비어 있다.
 */
export function GuestNoticeRail() {
  const match = useMatch('/m/:moduleId')
  const moduleId = match?.params.moduleId
  const { data: modules } = useGuestModules()
  const mod = modules?.find((m) => m.id === moduleId)
  const show = Boolean(mod && mod.module_type !== 'POST')
  const { data: notices } = useModuleNotices(show ? moduleId : undefined)

  if (!show) return null

  const list = notices ?? []
  return (
    <Card title="NOTICE" count={list.length}>
      <div className="space-y-2">
        {list.map((notice) => (
          <div key={notice.id} className="rounded-radius-md border border-gray-300 px-3 py-2">
            <p className="text-body font-medium text-gray-900">{notice.title}</p>
            {notice.body && (
              <p className="mt-1 whitespace-pre-line text-caption text-gray-700">
                {notice.body}
              </p>
            )}
            <p className="mt-1 text-caption tabular-nums text-gray-500">
              {notice.created_at.slice(0, 10)}
            </p>
          </div>
        ))}
        {list.length === 0 && (
          <p className="py-4 text-center text-caption text-gray-500">등록된 알림이 없습니다.</p>
        )}
      </div>
    </Card>
  )
}
