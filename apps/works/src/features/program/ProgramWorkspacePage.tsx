import { PageHeader, EmptyState } from '@ynarcher/ui'
import { useSearchParams } from 'react-router-dom'
import { LIST_ALL_TAB, resolveListTab } from '@/config/navigation'
import { categoryFromTab } from '@/config/programCategories'
import { ProgramListTab } from '@/features/program/ProgramListTab'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 워크스페이스 페이지 컨테이너(AC/M&A/PROJECT 공용). 섹션 전환은 좌측 사이드바(?tab)가 구동한다.
 * - mine: 내가 담당자/생성자인 사업만. 사이드바 첫 항목이자 탭 없이 진입했을 때의 기본 화면이다.
 * - all: 전체 ~. 위와 같은 목록을 담당 스코프 없이 넓힌 것이다.
 * - 그 외: 사업구분(카테고리) 세분화 목록. tab이 소문자 카테고리 값(예: pe_fund)일 때 매칭된다.
 * 섹션 제목의 도메인 명칭은 워크스페이스 config(entityNoun)로 조립한다.
 */
export function ProgramWorkspacePage() {
  const config = useProgramWorkspace()
  const [params] = useSearchParams()
  const tab = resolveListTab(params.get('tab'))
  const category = categoryFromTab(config.categories, tab)

  const headings: Record<string, string> = {
    [LIST_ALL_TAB]: config.allLabel,
    mine: config.mineLabel,
  }
  const heading = headings[tab] ?? category?.menuLabel ?? null

  return (
    <div className="space-y-5">
      {/* 모든 탭이 '메뉴명 + 구분선'으로 시작한다. 구분선은 PageHeader가 그린다. */}
      <PageHeader title={heading ?? headings[LIST_ALL_TAB]} />

      {tab === 'mine' ? (
        // key로 스코프 전환 시 검색·필터·페이지를 초기화한다.
        <ProgramListTab key="mine" scope="mine" backTab="mine" />
      ) : tab === LIST_ALL_TAB ? (
        <ProgramListTab key={LIST_ALL_TAB} scope="all" backTab={LIST_ALL_TAB} />
      ) : category ? (
        <ProgramListTab
          key={tab}
          scope="all"
          category={category.value}
          includeUnclassified={category.includeUnclassified}
          backTab={tab}
        />
      ) : (
        <EmptyState
          title={`${heading ?? headings[LIST_ALL_TAB]} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      )}
    </div>
  )
}
