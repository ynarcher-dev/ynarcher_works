import { EmptyState, ListToolbar, PageHeader, Spinner } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { activeOrgVersionId, useOrgVersions } from '@/features/management/hooks'
import { OrgDirectory } from '@/features/management/panels/OrgDirectory'

/**
 * OFFICE 임직원 정보(조회 전용) — 목록은 조직(부서)으로 펴고, 상세는 임직원으로 들어간다.
 *
 * 사람을 이름 순 표로 늘어놓으면 "누가 어디 소속인가"를 매번 소속 칸에서 되읽어야 한다. 전사에서
 * 사람을 찾는 실제 경로는 대개 조직이므로, 목록 자리에는 조직 트리와 그 조직의 인물 카드를 두고
 * 카드를 누르면 임직원 상세로 간다. 그래서 부서 정보와 임직원 정보를 한 메뉴로 합쳤다.
 *
 * 보이는 조직은 언제나 **현재 조직(오늘의 유효 버전)** 하나다. 전사에서 사람을 찾는 화면이
 * 답해야 하는 질문은 "지금 누가 어디 있나"이고, 과거·예정 조직까지 고를 수 있게 하면 지금 보는
 * 배치가 현재인지 되짚어야 한다. 조직 개편 전후를 비교하는 일은 MANAGEMENT 조직 관리의 몫이다.
 *
 * 원장과 쓰기 권한은 MANAGEMENT(인사·조직 관리)가 갖는다. 여기엔 편집 진입점을 두지 않으며,
 * 권한 강제는 서버(RLS/RPC)가 담당한다.
 */
export function OfficeManagersPanel() {
  const { data: versionRows, isLoading: versionLoading } = useOrgVersions()
  const versions = useMemo(() => versionRows ?? [], [versionRows])
  // 현재 조직 = 오늘의 유효 버전. 공백 구간이면 직전 버전을 유지한다(activeOrgVersionId 규칙).
  const versionId = useMemo(() => activeOrgVersionId(versions), [versions])

  const [keyword, setKeyword] = useState('')

  if ((versionLoading && !versionRows) || !versionId) {
    return (
      <div className="space-y-5">
        <PageHeader title="임직원 정보" />
        {versionLoading || !versionRows ? (
          <Spinner />
        ) : (
          <EmptyState
            title="발행된 조직 버전이 없습니다"
            description="조직관리에서 조직 버전을 발행하세요."
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="임직원 정보" />
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="이름, 직급·직책, 소속 검색"
      />
      <OrgDirectory versionId={versionId} keyword={keyword} detailBasePath="/office/managers" />
    </div>
  )
}
