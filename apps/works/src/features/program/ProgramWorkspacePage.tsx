import { PageHeader } from '@ynarcher/ui'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { ProgramListTab } from '@/features/program/ProgramListTab'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 워크스페이스 페이지 컨테이너(AC/M&A/PROJECT 공용). 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * - mine: 내가 담당자/생성자인 사업만. 사이드바 첫 항목이자 탭 없이 진입했을 때의 기본 화면이다.
 * - all: 전체 ~. 위와 같은 목록을 담당 스코프 없이 넓힌 것이다.
 * 섹션 제목의 도메인 명칭은 워크스페이스 config(mineLabel/allLabel)로 조립한다.
 *
 * 사업구분(카테고리)별 세분화 탭은 2026-08-03에 내렸다. 옛 링크(`?tab=sell` 등)와 상세
 * 뒤로가기가 그 값으로 들어오므로, 모르는 탭은 화면만 '전체'로 그리는 데 그치지 않고 주소까지
 * 바로잡는다 — 주소에 죽은 탭이 남아 있으면 사이드바에서 활성 항목이 사라져 "내가 지금 어느
 * 메뉴에 있는지"가 보이지 않는다.
 */
export function ProgramWorkspacePage() {
  const config = useProgramWorkspace()
  const [params, setParams] = useSearchParams()
  const tab = resolveListTab(params.get('tab'))
  const known = tab === 'mine' || tab === LIST_ALL_TAB

  useEffect(() => {
    if (!known) setParams({ tab: LIST_ALL_TAB }, { replace: true })
  }, [known, setParams])

  const mine = tab === 'mine'

  return (
    <div className="space-y-5">
      {/* 모든 탭이 '메뉴명 + 구분선'으로 시작한다. 구분선은 PageHeader가 그린다. */}
      <PageHeader title={mine ? config.mineLabel : config.allLabel} />

      {mine ? (
        // key로 스코프 전환 시 검색·필터·페이지를 초기화한다.
        <ProgramListTab key="mine" scope="mine" backTab="mine" />
      ) : (
        <ProgramListTab key={LIST_ALL_TAB} scope="all" backTab={LIST_ALL_TAB} />
      )}
    </div>
  )
}
