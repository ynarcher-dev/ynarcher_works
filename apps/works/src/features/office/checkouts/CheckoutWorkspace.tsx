import {
  Banner,
  FilterResetButton,
  Input,
  MultiSelectFilter,
  PageHeader,
  Spinner,
  Tabs,
  useToast,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { useAssetPhotoUrls } from '@/features/management/assets/assetPhotos'
import { AssetCheckoutModal, type CheckoutAction } from '@/features/office/checkouts/AssetCheckoutModal'
import { CheckoutActionModal, type PromptAction } from '@/features/office/checkouts/CheckoutActionModal'
import { PortableAssetsTable, type AssetRow } from '@/features/office/checkouts/PortableAssetsTable'
import {
  ASSET_STATE_LABELS,
  ASSET_STATE_ORDER,
  deriveAssetState,
  localToIso,
  remainingNow,
} from '@/features/office/checkouts/checkoutConfig'
import {
  stockErrorMessage,
  useActiveCheckouts,
  useCreateCheckout,
  usePortableAssets,
  useTransitionCheckout,
  type Checkout,
  type CheckoutInput,
} from '@/features/office/checkouts/checkoutsApi'
import { useBranches } from '@/features/office/branches/branchesApi'

const PAGE_SIZE = 30

/**
 * OFFICE 반출대장 — 지사 탭 → 반출 가능 물품 표 → 물품 모달(사진·설명 + 반출/반납).
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 *
 * 회의실 예약과 같은 구조다: 지점 탭 위에 빌릴 수 있는 것들을 늘어놓고, 하나를 열어 그 안에서
 * 잡거나 놓는다. 다른 것은 빌리는 대상이 공간이 아니라 물건이라는 점, 그래서 끝이 저절로
 * 오지 않고 누군가 '반납하기'를 눌러야 비워진다는 점뿐이다.
 *
 * 이 컴포넌트는 목록의 상태(지사·검색·상태 필터·페이지·열린 물품)만 소유한다. 물품의 지금
 * 상태를 반출 건들에서 파생하는 규칙은 checkoutConfig가, 표는 PortableAssetsTable이 갖는다.
 */
export function CheckoutWorkspace() {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const viewer = useMemo(
    () => ({ id: user?.id, isManager: hasWorkspaceWrite(user, 'management') }),
    [user],
  )

  const [branchId, setBranchId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [states, setStates] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [opened, setOpened] = useState<{ row: AssetRow; startInForm: boolean } | null>(null)
  const [prompt, setPrompt] = useState<{ action: PromptAction; row: Checkout } | null>(null)

  const branchesQuery = useBranches()
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])

  const assetsQuery = usePortableAssets(branchId || undefined)
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data])
  const assetIds = useMemo(() => assets.map((a) => a.id), [assets])
  const { data: byAsset } = useActiveCheckouts(assetIds)

  const create = useCreateCheckout()
  const transition = useTransitionCheckout()
  const busy = create.isPending || transition.isPending

  // 첫 진입·지사 목록 변동 시 첫 지사를 고른다(고르고 있던 지사가 비활성화된 경우 포함).
  useEffect(() => {
    if (!branches.length) return
    if (branches.some((b) => b.id === branchId)) return
    setBranchId(branches[0]!.id)
  }, [branches, branchId])

  const statesKey = states.join(',')
  useEffect(() => {
    setPage(0)
  }, [branchId, keyword, statesKey])

  /**
   * 물품 + 그 물건의 점유 건 → 표의 한 줄. 상태는 저장값이 아니라 여기서 파생한다.
   *
   * 기준 시각을 목록과 함께 한 번만 잡는다 — 행마다 new Date()를 부르면 한 화면 안에서
   * 연체 판정의 기준이 갈리고, 첫 행과 마지막 행이 다른 시각을 본다.
   */
  const { rows, now } = useMemo(() => {
    const at = new Date().toISOString()
    const list: AssetRow[] = assets.map((asset) => {
      const checkouts = byAsset?.get(asset.id) ?? []
      const { state, active } = deriveAssetState(checkouts, at, asset.quantity)
      return {
        asset,
        state,
        remaining: remainingNow(asset.quantity, checkouts, at),
        active,
        checkouts,
      }
    })
    return { rows: list, now: at }
  }, [assets, byAsset])

  // 검색·상태 필터는 화면에서 건다 — 조회 단위가 지사 하나라 서버로 되돌아갈 만큼 크지 않고,
  // 상태는 애초에 서버에 저장되어 있지 않은 파생값이라 서버가 답할 수 없다.
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return rows.filter((r) => {
      if (states.length && !states.includes(r.state)) return false
      if (!kw) return true
      return [r.asset.name, r.asset.itemType, r.asset.serialNo, r.active?.createdByName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(kw))
    })
  }, [rows, keyword, states])

  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [filtered, page],
  )

  // 목록에 보이는 물품의 대표 사진만 한 번에 서명한다(행마다 요청을 돌리지 않는다).
  const thumbPaths = useMemo(
    () => pageRows.map((r) => r.asset.photoPaths[0]).filter((p): p is string => Boolean(p)),
    [pageRows],
  )
  const { data: thumbUrls } = useAssetPhotoUrls(thumbPaths)

  const branchNameOf = useMemo(() => {
    const byId = new Map(branches.map((b) => [b.id, b.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? null : null)
  }, [branches])

  const submit = async (v: CheckoutInput) => {
    try {
      await create.mutateAsync(v)
      toast.show('반출을 등록했습니다.', 'success')
      setOpened(null)
    } catch (e) {
      // 재고 부족은 서버가 수치까지 담아 보낸다 — 화면이 다시 지어내지 않고 그대로 옮긴다.
      toast.show(
        stockErrorMessage(e) ?? '등록에 실패했습니다. 입력값과 권한을 확인하세요.',
        'danger',
      )
    }
  }

  /** 확인만 받으면 되는 처리(승인·반출 시작·취소)와 한 마디를 더 받아야 하는 처리(반려·반납). */
  const act = async (c: Checkout, action: CheckoutAction) => {
    if (action === 'REJECT' || action === 'RETURN') {
      setPrompt({ action, row: c })
      return
    }
    const ask =
      action === 'APPROVE'
        ? `'${c.assetName}' 반출을 승인할까요?`
        : action === 'START'
          ? `'${c.assetName}'을(를) 지금 반출 처리할까요?`
          : `'${c.assetName}' 반출을 취소할까요?`
    if (!window.confirm(ask)) return
    const status = action === 'APPROVE' ? 'RESERVED' : action === 'START' ? 'OUT' : 'CANCELLED'
    try {
      await transition.mutateAsync({ id: c.id, status })
      toast.show(
        action === 'APPROVE'
          ? '승인했습니다.'
          : action === 'START'
            ? '반출 처리했습니다.'
            : '취소했습니다.',
        'success',
      )
      setOpened(null)
    } catch {
      toast.show('처리에 실패했습니다. 권한과 상태를 확인하세요.', 'danger')
    }
  }

  const confirmPrompt = async (v: { returnedAt: string; note: string }) => {
    if (!prompt) return
    const returning = prompt.action === 'RETURN'
    try {
      await transition.mutateAsync({
        id: prompt.row.id,
        status: returning ? 'RETURNED' : 'REJECTED',
        returnedAt: localToIso(v.returnedAt),
        returnNote: returning ? v.note : undefined,
        decisionNote: returning ? undefined : v.note,
      })
      toast.show(returning ? '반납 처리했습니다.' : '반려했습니다.', 'success')
      setPrompt(null)
      setOpened(null)
    } catch {
      toast.show('처리에 실패했습니다. 권한과 상태를 확인하세요.', 'danger')
    }
  }

  if (branchesQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="반출대장" />

      {branches.length === 0 ? (
        <Banner tone="warning">
          지사가 없어 반출할 물품을 찾을 수 없습니다. 관리자에게 문의하세요.
        </Banner>
      ) : (
        <>
          <Tabs
            items={branches.map((b) => ({ key: b.id, label: b.name }))}
            value={branchId}
            onChange={setBranchId}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-80">
              <Input
                placeholder="물품명·품목·시리얼 번호·반출자 검색"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <MultiSelectFilter
              label="상태"
              options={ASSET_STATE_ORDER.map((s) => ({
                value: s,
                label: ASSET_STATE_LABELS[s],
              }))}
              selected={states}
              onChange={setStates}
            />
            {states.length > 0 && <FilterResetButton onClick={() => setStates([])} />}
          </div>

          {assetsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <PortableAssetsTable
              rows={pageRows}
              viewer={viewer}
              now={now}
              busy={busy}
              urlOf={(p) => (p ? thumbUrls?.[p] : undefined)}
              onOpen={(row) => setOpened({ row, startInForm: false })}
              onCheckout={(row) => setOpened({ row, startInForm: true })}
              onReturn={(row) => row.active && setPrompt({ action: 'RETURN', row: row.active })}
              pagination={{
                page,
                pageSize: PAGE_SIZE,
                total: filtered.length,
                totalAll: rows.length,
                onChange: setPage,
              }}
            />
          )}
        </>
      )}

      <AssetCheckoutModal
        open={opened !== null}
        row={opened?.row ?? null}
        branchName={branchNameOf(opened?.row.asset.branchId ?? null)}
        viewer={viewer}
        busy={busy}
        startInForm={opened?.startInForm ?? false}
        onAction={(c, action) => void act(c, action)}
        onSubmit={(v) => void submit(v)}
        onClose={() => setOpened(null)}
      />

      <CheckoutActionModal
        open={prompt !== null}
        action={prompt?.action ?? 'RETURN'}
        row={prompt?.row ?? null}
        busy={busy}
        onClose={() => setPrompt(null)}
        onConfirm={(v) => void confirmPrompt(v)}
      />
    </div>
  )
}
