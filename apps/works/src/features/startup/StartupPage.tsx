import { PageHeader, EmptyState } from '@ynarcher/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { StartupPoolTab } from '@/features/startup/StartupPoolTab'

const HEADINGS: Record<string, string> = {
  [LIST_ALL_TAB]: '스타트업 DB',
  mine: '내 업로드 DB',
  archerscan: '아처스캔',
}

/**
 * 2026-08-20에 사이드바에서 내린 구분별 탭. 옛 북마크와 상세 화면의 '목록으로'가 이 키로 들어오므로
 * '스타트업 DB'가 받되, 화면만 바꾸지 않고 주소까지 바로잡는다(AC가 2026-08-03에 한 것과 같다) —
 * 주소에 죽은 탭이 남으면 사이드바에서 활성 항목이 사라져 "지금 어느 메뉴인지"가 보이지 않는다.
 * 구분은 이제 목록의 필터 축이라 진입 단계에서 좁히지 않는다.
 */
const RETIRED_CATEGORY_TABS = new Set(['invested', 'incubated', 'discovered', 'etc'])

/**
 * STARTUP 워크스페이스: 내 업로드 DB / 스타트업 DB / 아처스캔.
 * 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * '내 업로드 DB'는 구분과 무관하게 담당자(startup_managers) 또는 생성자(created_by)가 나인 기업을 모으며,
 * 사이드바 첫 항목이자 탭 없이 진입했을 때의 기본 화면이다(navigation.ts 순서와 일치시킬 것).
 * '스타트업 DB'는 같은 목록을 담당 무관으로 넓힌 것이라 화면을 그대로 공유하고 스코프만 뺀다.
 * 구분(투자·보육·발굴·기타)은 두 화면 모두 목록의 '구분' 필터가 답한다.
 */
export function StartupPage() {
  const [params, setParams] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const raw = resolveListTab(params.get('tab'))
  const retired = RETIRED_CATEGORY_TABS.has(raw)
  const tab = retired ? LIST_ALL_TAB : raw

  useEffect(() => {
    if (retired) setParams({ tab: LIST_ALL_TAB }, { replace: true })
  }, [retired, setParams])

  // 검색창·필터·등록 버튼은 모두 StartupPoolTab의 컨트롤 행이 소유한다.
  return (
    <div className="space-y-5">
      {/* 모든 탭이 '메뉴명 + 구분선'으로 시작한다. */}
      <PageHeader title={HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]} />

      {tab === 'mine' ? (
        <StartupPoolTab key="mine" mineUserId={userId ?? null} />
      ) : tab === LIST_ALL_TAB ? (
        // 내 기업 관리와 같은 목록. 담당자 스코프만 뺀다.
        <StartupPoolTab key={LIST_ALL_TAB} />
      ) : (
        <EmptyState
          title={`${HEADINGS[tab] ?? HEADINGS[LIST_ALL_TAB]} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      )}
    </div>
  )
}
