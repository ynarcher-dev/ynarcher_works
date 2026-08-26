import { Banner, Input, PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
// 사진 서명은 자산 원장이 소유한 헬퍼를 그대로 쓴다 — 같은 버킷을 두 곳에서 다르게 다루면
// 만료 시간과 실패 처리가 갈린다(상세 모달과 같은 이유).
import { useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'
import { AssetDetailModal } from '@/features/office/assets/AssetDetailModal'
import { PortableAssetsGrid } from '@/features/office/assets/PortableAssetsGrid'
import {
  useAssetBranchIds,
  usePortableAssets,
  usePortableAssetBranch,
  type PortableAsset,
} from '@/features/office/assets/portableAssetsApi'
import { useBranches } from '@/features/office/branches/branchesApi'

// 카드 격자가 한 줄에 2·3·4장이라 24는 세 배치 모두에서 줄을 딱 맞게 채운다 —
// 마지막 줄만 한두 장 남는 이 빠진 격자가 되지 않는다.
const PAGE_SIZE = 24

/**
 * OFFICE 자산 현황 — 지사 탭 → 공용 물품 카드 격자 → 물품 상세 모달. **조회 전용 화면이다.**
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 *
 * 답하는 질문은 하나다: **회사에 이런 물건이 있나, 있다면 어느 지사에 있고 누가 맡고 있나.**
 *
 * 2026-08-25에 예약·반출 흐름을 통째로 걷어냈다. 실제로 빌려 가고 돌려놓는 일은 창고의
 * 오프라인 현황판이 맡는다 — 앱이 그 흐름을 담으려면 누군가 반납을 눌러 주어야 하는데,
 * 그 한 번의 클릭에 재고 전체가 걸려 있는 구조는 한 사람이 잊는 순간 원장이 굳는다.
 * 물품의 등록·수정·수량·폐기는 MANAGEMENT `자산 관리`가 소유하고 이 화면은 읽기만 한다.
 *
 * 목록을 표에서 카드로 바꾼 것은 2026-08-26이다. 근거는 `PortableAssetsGrid`에 적었다 — 요지는
 * 이 화면에 세로로 훑어 비교할 열이 없고, 정작 답해야 할 식별 질문의 답은 사진이 쥐고 있다는 것이다.
 *
 * 이 컴포넌트는 목록의 상태(지사·검색·페이지·열린 물품)만 소유한다.
 *
 * `initialAssetId`는 딥링크(`/office?tab=outbound&asset=`)로 들어온 물품이다. 통합검색이 이
 * 경로로 보내며, 지사 탭과 무관하게 그 물건을 곧바로 연다 — 검색 결과를 눌렀는데 목록만
 * 나오면 찾던 물건을 다시 찾아야 한다.
 */
export function AssetListWorkspace({ initialAssetId }: { initialAssetId?: string } = {}) {
  const [branchId, setBranchId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [opened, setOpened] = useState<PortableAsset | null>(null)

  const { data: employees } = useEmployees()
  const branchesQuery = useBranches()
  const withAssetsQuery = useAssetBranchIds()
  // 물품이 있는 지사만 탭에 세운다(집합이 오기 전에는 탭을 그리지 않는다 —
  // 전체 지사를 먼저 보였다가 줄이면 눌러 둔 탭이 사라진다).
  const branches = useMemo(() => {
    const withAssets = withAssetsQuery.data
    if (!withAssets) return []
    return (branchesQuery.data ?? []).filter((b) => withAssets.has(b.id))
  }, [branchesQuery.data, withAssetsQuery.data])

  const assetsQuery = usePortableAssets(branchId || undefined)
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data])

  // 딥링크로 지정된 물품이 어느 지사에 있는지. 목록 조회 단위가 지사라, 지사를 모르면 그
  // 물건이 애초에 목록에 없다(검색 결과를 눌렀는데 다른 지사 탭이 열려 있으면 빈손이다).
  const { data: deepLinkedBranchId } = usePortableAssetBranch(initialAssetId)

  // 첫 진입·지사 목록 변동 시 첫 지사를 고른다(고르고 있던 지사가 비활성화된 경우 포함).
  // 딥링크로 들어왔다면 그 물건이 있는 지사를 첫 지사보다 앞세운다.
  useEffect(() => {
    if (!branches.length) return
    if (branches.some((b) => b.id === branchId)) return
    const wanted = branches.find((b) => b.id === deepLinkedBranchId)
    setBranchId(wanted?.id ?? branches[0]!.id)
  }, [branches, branchId, deepLinkedBranchId])

  useEffect(() => {
    setPage(0)
  }, [branchId, keyword])

  // 검색은 화면에서 건다 — 조회 단위가 지사 하나라 서버로 되돌아갈 만큼 크지 않다.
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return assets
    return assets.filter((a) =>
      [a.name, a.itemType, a.serialNo, a.note]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(kw)),
    )
  }, [assets, keyword])

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  )

  // 이 페이지에 보이는 물품의 **대표사진 한 장씩**을 한 번에 서명한다. 카드마다 훅을 부르면
  // 스물네 장이 스물네 번의 왕복이 되므로, 경로를 여기서 모아 `createSignedUrls` 한 번으로 받는다.
  // 사진은 선택 항목이라 없는 물품은 애초에 이 목록에서 빠진다(카드가 그 자리에 자리표시를 둔다).
  const coverPaths = useMemo(
    () => pageRows.map((a) => a.photoPaths[0]).filter((p): p is string => Boolean(p)),
    [pageRows],
  )
  const { data: coverUrls } = useAssetPhotoUrls(coverPaths)

  // 딥링크로 지정된 물품을 목록이 도착하는 대로 연다. 이미 처리한 id는 기억해 두어
  // 닫은 뒤에 되살아나지 않게 한다.
  const [deepLinkDone, setDeepLinkDone] = useState<string | null>(null)
  useEffect(() => {
    if (!initialAssetId || deepLinkDone === initialAssetId) return
    const target = assets.find((a) => a.id === initialAssetId)
    if (!target) return
    setDeepLinkDone(initialAssetId)
    setOpened(target)
  }, [initialAssetId, assets, deepLinkDone])

  const branchNameOf = useMemo(() => {
    const byId = new Map(branches.map((b) => [b.id, b.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? null : null)
  }, [branches])

  // 자산 관리자 이름. 뷰는 id만 내려주고 이름은 임직원 디렉토리에서 붙인다 —
  // 누가 맡았는가는 MANAGEMENT 자산 관리가 정하고 이 화면은 읽기만 한다.
  const managerNameOf = useMemo(() => {
    const byId = new Map((employees ?? []).map((e) => [e.id, e.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? '알 수 없음' : null)
  }, [employees])

  if (branchesQuery.isLoading || withAssetsQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="자산 현황"
        search={
          <Input
            placeholder="물품명·품목·시리얼 번호 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />

      {branches.length === 0 ? (
        <Banner tone="warning">
          공용 물품이 등록된 지사가 없습니다. 물품 등록은 MANAGEMENT 자산 관리에서 합니다.
        </Banner>
      ) : (
        <>
          <Tabs
            items={branches.map((b) => ({ key: b.id, label: b.name }))}
            value={branchId}
            onChange={setBranchId}
          />

          {assetsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <PortableAssetsGrid
              rows={pageRows}
              urlOf={(p) => coverUrls?.[p]}
              nameOf={managerNameOf}
              onOpen={setOpened}
              pagination={{
                page,
                pageSize: PAGE_SIZE,
                total: filtered.length,
                totalAll: assets.length,
                onChange: setPage,
              }}
            />
          )}
        </>
      )}

      <AssetDetailModal
        open={opened !== null}
        asset={opened}
        branchName={branchNameOf(opened?.branchId ?? null)}
        managerName={managerNameOf(opened?.managerId ?? null)}
        onClose={() => setOpened(null)}
      />
    </div>
  )
}
