import { Banner, Input, Spinner, Tabs, useToast } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { ListActions } from '@/components/ListActions'
import { useEmployees } from '@/features/hub/hooks'
import { costBasisFromAsset } from '@/features/management/assets/assetCost'
import { AssetFormModal } from '@/features/management/assets/AssetFormModal'
import { AssetImportModal } from '@/features/management/assets/AssetImportModal'
import { AssetsFilterBar } from '@/features/management/assets/AssetsFilterBar'
import { AssetsSelectionBar } from '@/features/management/assets/AssetsSelectionBar'
import { AssetsTable } from '@/features/management/assets/AssetsTable'
import {
  EMPTY_ASSET_FILTERS,
  useAssetsPage,
  useCreateAsset,
  useDeactivateAssets,
  useSetAssetsApproval,
  useUpdateAsset,
  type Asset,
  type AssetFilters,
  type AssetInput,
} from '@/features/management/assets/assetsApi'
import { useBranches } from '@/features/office/branches/branchesApi'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

/**
 * MANAGEMENT 자산 관리 — 지사 탭 → 검색·필터 → 자산 표 → 등록/수정 모달.
 * 기획: docs_planning/3_7_2_management_assets.md
 *
 * 지사 탭이 곧 화면 구조다. 자산은 "어느 지사에 있는 물건인가"로 먼저 갈리고, 그 다음에야
 * 품목·상태가 의미를 갖는다. 그래서 지사는 필터가 아니라 자리다. 지사 목록은 '지사 관리'가
 * 소유한 원장을 그대로 쓰며(활성 지사만), 여기서 지사를 만들거나 고치지 않는다.
 *
 * 이 컴포넌트는 목록의 상태(지사·검색어·필터·페이지·선택)만 소유한다. 표는 AssetsTable이,
 * 비용 합계는 assetCost가, CSV 해석은 assetImport가 갖는다.
 */
export function AssetsPanel() {
  const toast = useToast()
  const branchesQuery = useBranches()
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const [branchId, setBranchId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<AssetFilters>(EMPTY_ASSET_FILTERS)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])

  const { data: employees } = useEmployees()
  const { data, isLoading } = useAssetsPage(branchId, keyword, filters, page, PAGE_SIZE)
  const rows = useMemo(() => data?.rows ?? [], [data])

  const createAsset = useCreateAsset()
  const updateAsset = useUpdateAsset()
  const deactivateAssets = useDeactivateAssets()
  const setApproval = useSetAssetsApproval()
  const busy =
    createAsset.isPending ||
    updateAsset.isPending ||
    deactivateAssets.isPending ||
    setApproval.isPending

  const [form, setForm] = useState<'create' | Asset | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const editing = form && form !== 'create' ? form : undefined

  // 첫 진입·지사 목록 변동 시 첫 번째 지사를 고른다(선택했던 지사가 비활성화된 경우 포함).
  useEffect(() => {
    if (!branches.length) return
    if (branches.some((b) => b.id === branchId)) return
    setBranchId(branches[0]!.id)
  }, [branches, branchId])

  // 검색·필터·지사가 바뀌면 첫 페이지로 되돌린다(있지도 않은 3페이지에 머무르지 않게).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
  }, [keyword, filtersKey, branchId])

  // 선택은 화면에 보이는 것에 대한 선택이다 — 목록이 바뀌면 비운다. 페이지를 넘긴 뒤에도
  // 선택이 남아 있으면 합계와 일괄 처리의 대상이 눈에 보이지 않는 행까지 번진다.
  useEffect(() => {
    setSelected([])
  }, [keyword, filtersKey, branchId, page])

  const nameOf = useMemo(() => {
    const byId = new Map((employees ?? []).map((e) => [e.id, e.name] as const))
    // 할당 대상이 없으면 null이다 — 빈 칸을 무슨 글자로 채울지는 표가 정한다.
    return (id: string | null) => (id ? byId.get(id) ?? '알 수 없음' : null)
  }, [employees])

  // 선택 id를 현재 페이지의 행으로 되돌린다 — 합계와 일괄 처리가 같은 집합을 본다.
  const selectedRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r] as const))
    return selected.map((id) => byId.get(id)).filter((r): r is Asset => Boolean(r))
  }, [rows, selected])

  const submit = async (v: AssetInput) => {
    try {
      if (editing) {
        await updateAsset.mutateAsync({ ...v, id: editing.id })
        toast.show('자산을 수정했습니다.', 'success')
      } else {
        await createAsset.mutateAsync(v)
        toast.show('자산을 등록했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 입력값과 권한을 확인하세요.', 'danger')
    }
  }

  // 비활성화는 목록 정리이고 폐기는 실물 상태다 — 확인 문구에서 그 차이를 밝힌다.
  const deactivate = async (targets: Asset[]) => {
    if (!targets.length) return
    const what =
      targets.length === 1 ? `'${targets[0]!.name}'을(를)` : `선택한 자산 ${targets.length}건을`
    if (!window.confirm(`${what} 목록에서 비활성화하시겠습니까? 폐기 처리와는 다릅니다.`)) return
    try {
      await deactivateAssets.mutateAsync(targets.map((t) => t.id))
      toast.show(`${targets.length}건을 비활성화했습니다.`, 'success')
      setSelected([])
      setForm(null)
    } catch {
      toast.show('비활성화에 실패했습니다.', 'danger')
    }
  }

  // 승인 설정은 반출 가능한 자산에만 건다 — 대상이 아닌 선택은 세어서 알린다(말없이 지나가면
  // 12건을 골랐는데 3건만 바뀐 것을 눈치채지 못한다).
  const portableSelected = useMemo(() => selectedRows.filter((r) => r.isPortable), [selectedRows])

  const applyApproval = async (requiresApproval: boolean) => {
    if (!portableSelected.length) return
    try {
      await setApproval.mutateAsync({
        ids: portableSelected.map((r) => r.id),
        requiresApproval,
      })
      const skipped = selectedRows.length - portableSelected.length
      toast.show(
        `${portableSelected.length}건의 반출 승인을 ${requiresApproval ? '필요로 설정' : '해제'}했습니다.` +
          (skipped ? ` 반출 불가 ${skipped}건은 제외했습니다.` : ''),
        'success',
      )
    } catch {
      toast.show('반출 승인 설정에 실패했습니다.', 'danger')
    }
  }

  if (branchesQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  // 지사가 없으면 자산을 등록할 자리가 없다(귀속이 필수다) — 먼저 할 일을 알린다.
  if (!branches.length) {
    return (
      <Banner tone="warning">
        지사가 없어 자산을 등록할 수 없습니다. 지사 관리에서 지사를 먼저 등록하세요.
      </Banner>
    )
  }

  return (
    <div className="space-y-3">
      <Tabs
        items={branches.map((b) => ({ key: b.id, label: b.name }))}
        value={branchId}
        onChange={setBranchId}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            placeholder="자산명·품목·시리얼 번호 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <AssetsFilterBar filters={filters} onChange={setFilters} />
        <div className="sm:ml-auto">
          {/* 지사 컨텍스트를 이 목록이 이미 들고 있어 업로드는 페이지 이동 없이 모달로 연다. */}
          <ListActions
            createLabel="자산 등록"
            onCreate={() => setForm('create')}
            onBulk={() => setImportOpen(true)}
          />
        </div>
      </div>

      <AssetsSelectionBar
        items={selectedRows.map(costBasisFromAsset)}
        portableCount={portableSelected.length}
        busy={busy}
        onSetApproval={(v) => void applyApproval(v)}
        onDeactivate={() => void deactivate(selectedRows)}
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        // 행을 누르면 그 자산을 연다 — 확인과 수정이 같은 화면이라 '수정' 열을 따로 두지 않는다.
        <AssetsTable
          rows={rows}
          nameOf={nameOf}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          onRowClick={(a) => setForm(a)}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalAll: data?.totalAll ?? 0,
            onChange: setPage,
          }}
        />
      )}

      <AssetFormModal
        open={form !== null}
        asset={editing}
        defaultBranchId={branchId}
        branches={branches}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={submit}
        onDeactivate={editing ? () => void deactivate([editing]) : undefined}
      />

      <AssetImportModal
        open={importOpen}
        branches={branches}
        onClose={() => setImportOpen(false)}
      />
    </div>
  )
}
