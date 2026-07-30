import { Badge, Banner, Button, DataTable, Spinner, Tabs, useToast, type Column } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import {
  ACQUISITION_LABELS,
  ASSET_LABELS,
  assetTone,
} from '@/features/management/config'
import { formatAmount } from '@/features/management/assets/assetForm'
import { AssetFormModal } from '@/features/management/assets/AssetFormModal'
import {
  useAssets,
  useCreateAsset,
  useDeactivateAsset,
  useUpdateAsset,
  type Asset,
  type AssetInput,
} from '@/features/management/assets/assetsApi'
import { useBranches } from '@/features/office/branches/branchesApi'

/**
 * MANAGEMENT 자산 관리 — 지사 탭 → 자산 표 → 등록/수정 모달.
 * 기획: docs_planning/3_7_2_management_assets.md
 *
 * 지사 탭이 곧 화면 구조다. 자산은 "어느 지사에 있는 물건인가"로 먼저 갈리고, 그 다음에야
 * 품목·상태가 의미를 갖는다. 지사 목록은 '지사 관리'가 소유한 원장을 그대로 쓰며(활성 지사만),
 * 여기서 지사를 만들거나 고치지 않는다.
 *
 * 등록자 열은 두지 않는다 — 자산은 "누가 등록했는가"보다 "지금 누구에게 할당되어 있는가"가
 * 관리 축이고 원장에 created_by가 없다. 수정일만 남긴다.
 */
export function AssetsPanel() {
  const toast = useToast()
  const branchesQuery = useBranches()
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const [branchId, setBranchId] = useState('')
  const { data: employees } = useEmployees()
  const { data: assets, isLoading } = useAssets(branchId)

  const createAsset = useCreateAsset()
  const updateAsset = useUpdateAsset()
  const deactivateAsset = useDeactivateAsset()
  const busy = createAsset.isPending || updateAsset.isPending || deactivateAsset.isPending

  const [form, setForm] = useState<'create' | Asset | null>(null)
  const editing = form && form !== 'create' ? form : undefined

  // 첫 진입·지사 목록 변동 시 첫 번째 지사를 고른다(선택했던 지사가 비활성화된 경우 포함).
  useEffect(() => {
    if (!branches.length) return
    if (branches.some((b) => b.id === branchId)) return
    setBranchId(branches[0]!.id)
  }, [branches, branchId])

  const nameOf = useMemo(() => {
    const byId = new Map((employees ?? []).map((e) => [e.id, e.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? '알 수 없음' : '—')
  }, [employees])

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
  const deactivate = async (a: Asset) => {
    if (!window.confirm(`'${a.name}'을(를) 목록에서 비활성화하시겠습니까? 폐기 처리와는 다릅니다.`))
      return
    try {
      await deactivateAsset.mutateAsync(a.id)
      toast.show('비활성화했습니다.', 'success')
      setForm(null)
    } catch {
      toast.show('비활성화에 실패했습니다.', 'danger')
    }
  }

  const columns: Column<Asset>[] = [
    { key: 'name', header: '자산명', primary: true, align: 'left', className: 'w-56', render: (a) => a.name },
    { key: 'itemType', header: '품목', className: 'w-28', render: (a) => a.itemType ?? '—' },
    {
      key: 'acquisitionType',
      header: '분류',
      className: 'w-20',
      render: (a) => ACQUISITION_LABELS[a.acquisitionType],
    },
    {
      key: 'status',
      header: '상태',
      className: 'w-24',
      render: (a) => <Badge tone={assetTone[a.status]}>{ASSET_LABELS[a.status]}</Badge>,
    },
    { key: 'assignedTo', header: '할당 대상', className: 'w-28', render: (a) => nameOf(a.assignedTo) },
    {
      key: 'acquiredOn',
      header: '취득일자',
      className: 'w-28',
      render: (a) => <span className="tabular-nums text-gray-600">{a.acquiredOn ?? '—'}</span>,
    },
    {
      key: 'disposedOn',
      header: '폐기일자',
      className: 'w-28',
      render: (a) => <span className="tabular-nums text-gray-600">{a.disposedOn ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: '금액',
      align: 'right',
      numeric: true,
      className: 'w-28',
      render: (a) => formatAmount(a.amount),
    },
    {
      key: 'isPortable',
      header: '반출',
      className: 'w-20',
      render: (a) =>
        a.isPortable ? <Badge tone="info">가능</Badge> : <Badge tone="neutral">불가</Badge>,
    },
  ]

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
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setForm('create')}>자산 등록</Button>
      </div>

      <Tabs
        items={branches.map((b) => ({ key: b.id, label: b.name }))}
        value={branchId}
        onChange={setBranchId}
      />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        // 행을 누르면 그 자산을 연다 — 확인과 수정이 같은 화면이라 '수정' 열을 따로 두지 않는다.
        <DataTable
          columns={columns}
          rows={assets ?? []}
          rowKey={(a) => a.id}
          showAuthor={false}
          onRowClick={(a) => setForm(a)}
          // 확인 문구를 이 화면이 갖는다(폐기와 다른 축임을 밝혀야 하므로) — 내장 confirm은 끈다.
          meta={{ onDeactivate: (a) => void deactivate(a), deactivateWithReason: true }}
          emptyText="이 지사에 등록된 자산이 없습니다."
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
        onDeactivate={editing ? () => void deactivate(editing) : undefined}
      />
    </div>
  )
}
