import { PageHeader } from '@ynarcher/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { FundListTab } from '@/features/fund/FundListTab'

/** 사이드바 탭 → 페이지 제목. 사이드바 라벨과 같은 말이어야 한다. */
const HEADINGS: Record<string, string> = {
  [LIST_ALL_TAB]: '전체 운용펀드',
  mine: '내 운용펀드',
}

/**
 * FUND 워크스페이스: 내 운용펀드 / 전체 운용펀드. 섹션 전환은 좌측 사이드바(?tab).
 * 두 목록 모두 같은 리스트 테이블(FundListTab)을 쓰고 거는 조건만 다르다 —
 * '내 운용펀드'는 생성자 또는 담당자(대표펀드매니저·운용인력·관리인력)가 나인 펀드로 좁히고,
 * '전체 운용펀드'는 아무것도 걸지 않는다. '내 운용펀드'가 탭 없이 진입했을 때의 기본 화면이다.
 * (StartupPage 패턴 미러링)
 *
 * 펀드 종류(AC/VC/PE)별 탭은 2026-08-20에 내렸고 구분은 목록 필터의 축 하나가 되었다.
 * 옛 링크(`?tab=ac_fund` 등)와 구 `?tab=dashboard`가 그 값으로 들어오므로, 모르는 탭은
 * 화면만 '전체'로 그리는 데 그치지 않고 주소까지 바로잡는다 — 주소에 죽은 탭이 남아 있으면
 * 사이드바에서 활성 항목이 사라져 "내가 지금 어느 메뉴에 있는지"가 보이지 않는다.
 * (ProgramWorkspacePage와 같은 처리)
 */
export function FundPage() {
  const [params, setParams] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.id)
  const tab = resolveListTab(params.get('tab'))
  const known = tab === 'mine' || tab === LIST_ALL_TAB

  useEffect(() => {
    if (!known) setParams({ tab: LIST_ALL_TAB }, { replace: true })
  }, [known, setParams])

  const mine = tab === 'mine'

  return (
    <div className="space-y-5">
      <PageHeader title={mine ? HEADINGS.mine : HEADINGS[LIST_ALL_TAB]} />

      {mine ? (
        <FundListTab key="mine" mineUserId={userId ?? null} />
      ) : (
        // 내 운용펀드와 같은 목록. 담당자 스코프를 걸지 않는다.
        <FundListTab key={LIST_ALL_TAB} />
      )}
    </div>
  )
}
