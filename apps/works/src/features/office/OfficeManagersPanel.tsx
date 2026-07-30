import { ListToolbar, PageHeader, Spinner } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { activeOrgVersionId, useOrgVersions } from '@/features/management/hooks'
import { OrgVersionBar } from '@/features/management/panels/OrgVersionBar'
import { OrgDirectory } from '@/features/management/panels/OrgDirectory'

/**
 * OFFICE 임직원 정보(조회 전용) — 목록은 조직(부서)으로 펴고, 상세는 임직원으로 들어간다.
 *
 * 사람을 이름 순 표로 늘어놓으면 "누가 어디 소속인가"를 매번 소속 칸에서 되읽어야 한다. 전사에서
 * 사람을 찾는 실제 경로는 대개 조직이므로, 목록 자리에는 조직 트리와 그 조직의 인물 카드를 두고
 * 카드를 누르면 임직원 상세로 간다. 그래서 부서 정보와 임직원 정보를 한 메뉴로 합쳤다.
 *
 * 원장과 쓰기 권한은 MANAGEMENT(인사·조직 관리)가 갖는다. 여기엔 편집 진입점을 두지 않으며,
 * 권한 강제는 서버(RLS/RPC)가 담당한다.
 *
 * 검색과 조직 운영 기간(버전) 선택은 한 줄에 나란히 둔다 — 둘 다 "무엇을 보여줄지"를 정하는
 * 같은 층의 조건이라, 위아래로 나누면 기간 선택이 화면의 결과물처럼 읽힌다.
 */
export function OfficeManagersPanel() {
  const { data: versionRows, isLoading: versionLoading } = useOrgVersions()
  const versions = useMemo(() => versionRows ?? [], [versionRows])
  const activeVersionId = useMemo(() => activeOrgVersionId(versions), [versions])

  const [versionId, setVersionId] = useState('')
  useEffect(() => {
    if (!versionId && versions.length) setVersionId(activeVersionId ?? versions[0]!.id)
  }, [versions, activeVersionId, versionId])

  const [keyword, setKeyword] = useState('')

  if ((versionLoading && !versionRows) || !versionId) {
    return (
      <div className="space-y-5">
        <PageHeader title="임직원 정보" />
        <Spinner />
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
        filters={
          <OrgVersionBar
            versions={versions}
            selectedId={versionId}
            activeId={activeVersionId}
            onSelect={setVersionId}
            showClone={false}
          />
        }
      />
      <OrgDirectory versionId={versionId} keyword={keyword} detailBasePath="/office/managers" />
    </div>
  )
}
