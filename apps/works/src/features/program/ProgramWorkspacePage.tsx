import { PageHeader } from '@ynarcher/ui'
import { Navigate, useSearchParams } from 'react-router-dom'
import { PROGRAM_LIST_LABEL } from '@/config/navigation'
import { ProgramListTab } from '@/features/program/ProgramListTab'
import { useProgramWorkspace } from '@/features/program/workspace'
import { listPathOf, useListScope } from '@/lib/listScope'

/**
 * 사업 워크스페이스 페이지 컨테이너(AC/M&A/PROJECT 공용) — 메뉴 하나, 범위는 목록 안의
 * 토글이 정한다.
 *
 * 2026-09-05: '내 프로젝트'와 '전체 프로젝트' 두 메뉴를 한 줄로 합쳤다. 둘은 같은 목록을
 * 담당 스코프만 달리해 보던 것이라(mine = 내가 담당자·생성자인 사업), 범위를 메뉴로 두면
 * 그것이 '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없다 — 사업구분이
 * 2026-08-03에 먼저 밟은 길과 같다.
 *
 * 옛 주소(`?tab=mine`·`?tab=sell` 같은 구분별 탭·구 `?tab=dashboard`)는 이 화면으로
 * 흡수한다. 주소에 죽은 탭이 남아 있으면 사이드바에서 활성 항목이 사라져 "내가 지금 어느
 * 메뉴에 있는지"가 보이지 않는다.
 */
export function ProgramWorkspacePage() {
  const config = useProgramWorkspace()
  const [params] = useSearchParams()
  const [scope, setScope] = useListScope()

  const legacyTab = params.get('tab')
  if (legacyTab) {
    return (
      <Navigate to={listPathOf(config.basePath, legacyTab === 'mine' ? 'mine' : 'all')} replace />
    )
  }

  return (
    <div className="space-y-5">
      {/* 화면은 '메뉴명 + 구분선'으로 시작한다. 구분선은 PageHeader가 그린다. */}
      <PageHeader title={PROGRAM_LIST_LABEL} />
      <ProgramListTab scope={scope} onScopeChange={setScope} />
    </div>
  )
}
