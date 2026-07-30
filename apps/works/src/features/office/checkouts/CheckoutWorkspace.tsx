import {
  Button,
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
import { useEmployees } from '@/features/hub/hooks'
import { CheckoutActionModal, type PromptAction } from '@/features/office/checkouts/CheckoutActionModal'
import { CheckoutDetailModal } from '@/features/office/checkouts/CheckoutDetailModal'
import { CheckoutFormModal } from '@/features/office/checkouts/CheckoutFormModal'
import { CheckoutsTable, type CheckoutAction } from '@/features/office/checkouts/CheckoutsTable'
import { CHECKOUT_VIEWS, type CheckoutView } from '@/features/office/checkouts/checkoutConfig'
import {
  isOverlapError,
  useCheckoutsPage,
  useCreateCheckout,
  useTransitionCheckout,
  type Checkout,
  type CheckoutInput,
} from '@/features/office/checkouts/checkoutsApi'
import { useBranches } from '@/features/office/branches/branchesApi'

const PAGE_SIZE = 30

/**
 * OFFICE 반출대장 — 뷰 탭 → 검색·지사 필터 → 반출 표 → 등록/상세/처리 모달.
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 *
 * 지사는 탭이 아니라 필터다. 자산 관리에서 지사가 탭인 것은 "이 지사에 무엇이 있는가"가
 * 그 화면의 질문이기 때문이고, 여기서의 질문("이 물건이 지금 어디 있는가")은 지사를 가로지른다 —
 * 탭으로 두면 다른 지사 물건을 빌린 기록이 목록에서 사라진다. 탭 자리는 뷰가 쓴다.
 */
export function CheckoutWorkspace() {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const viewer = useMemo(
    () => ({ id: user?.id, isManager: hasWorkspaceWrite(user, 'management') }),
    [user],
  )

  const [view, setView] = useState<CheckoutView>('OUT')
  const [keyword, setKeyword] = useState('')
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [page, setPage] = useState(0)

  const branchesQuery = useBranches()
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const { data: employees } = useEmployees()

  const { data, isLoading } = useCheckoutsPage({
    view,
    keyword,
    branchIds,
    page,
    pageSize: PAGE_SIZE,
    myId: viewer.id,
  })
  const rows = useMemo(() => data?.rows ?? [], [data])

  const create = useCreateCheckout()
  const transition = useTransitionCheckout()
  const busy = create.isPending || transition.isPending

  const [formOpen, setFormOpen] = useState(false)
  const [detail, setDetail] = useState<Checkout | null>(null)
  const [prompt, setPrompt] = useState<{ action: PromptAction; row: Checkout } | null>(null)

  // 조건이 바뀌면 첫 페이지로 되돌린다(있지도 않은 3페이지에 머무르지 않게).
  const branchKey = branchIds.join(',')
  useEffect(() => {
    setPage(0)
  }, [view, keyword, branchKey])

  const branchNameOf = useMemo(() => {
    const byId = new Map(branches.map((b) => [b.id, b.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? null : null)
  }, [branches])

  const nameOf = useMemo(() => {
    const byId = new Map((employees ?? []).map((e) => [e.id, e.name] as const))
    return (id: string | null) => (id ? byId.get(id) ?? null : null)
  }, [employees])

  const submit = async (v: CheckoutInput) => {
    try {
      await create.mutateAsync(v)
      toast.show('반출을 등록했습니다.', 'success')
      setFormOpen(false)
    } catch (e) {
      toast.show(
        isOverlapError(e)
          ? '그 기간에는 이미 예약이 있습니다. 날짜를 확인하세요.'
          : '등록에 실패했습니다. 입력값과 권한을 확인하세요.',
        'danger',
      )
    }
  }

  /** 확인만 받으면 되는 처리(승인·반출 시작·취소)와 한 마디를 더 받아야 하는 처리(반려·반납). */
  const act = async (row: Checkout, action: CheckoutAction) => {
    if (action === 'REJECT' || action === 'RETURN') {
      setPrompt({ action, row })
      return
    }
    const ask =
      action === 'APPROVE'
        ? `'${row.assetName}' 반출을 승인할까요?`
        : action === 'START'
          ? `'${row.assetName}'을(를) 지금 반출 처리할까요?`
          : `'${row.assetName}' 반출을 취소할까요?`
    if (!window.confirm(ask)) return
    const status = action === 'APPROVE' ? 'RESERVED' : action === 'START' ? 'OUT' : 'CANCELLED'
    try {
      await transition.mutateAsync({ id: row.id, status })
      toast.show(
        action === 'APPROVE' ? '승인했습니다.' : action === 'START' ? '반출 처리했습니다.' : '취소했습니다.',
        'success',
      )
      setDetail(null)
    } catch {
      toast.show('처리에 실패했습니다. 권한과 상태를 확인하세요.', 'danger')
    }
  }

  const confirmPrompt = async (v: { returnedOn: string; note: string }) => {
    if (!prompt) return
    const returning = prompt.action === 'RETURN'
    try {
      await transition.mutateAsync({
        id: prompt.row.id,
        status: returning ? 'RETURNED' : 'REJECTED',
        returnedOn: v.returnedOn,
        returnNote: returning ? v.note : undefined,
        decisionNote: returning ? undefined : v.note,
      })
      toast.show(returning ? '반납 처리했습니다.' : '반려했습니다.', 'success')
      setPrompt(null)
      setDetail(null)
    } catch {
      toast.show('처리에 실패했습니다. 권한과 상태를 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="반출대장" />

      <Tabs
        items={CHECKOUT_VIEWS.map((v) => ({ key: v.key, label: v.label }))}
        value={view}
        onChange={(k) => setView(k as CheckoutView)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            placeholder="물품명·시리얼 번호·반출자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <MultiSelectFilter
          label="지사"
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          selected={branchIds}
          onChange={setBranchIds}
        />
        {branchIds.length > 0 && <FilterResetButton onClick={() => setBranchIds([])} />}
        <div className="sm:ml-auto">
          <Button className="h-ctl-page" onClick={() => setFormOpen(true)}>
            반출 등록
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <CheckoutsTable
          rows={rows}
          branchNameOf={branchNameOf}
          viewer={viewer}
          busy={busy}
          onAction={(row, action) => void act(row, action)}
          onRowClick={setDetail}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
          }}
        />
      )}

      <CheckoutFormModal
        open={formOpen}
        busy={busy}
        branchNameOf={branchNameOf}
        onClose={() => setFormOpen(false)}
        onSubmit={(v) => void submit(v)}
      />

      <CheckoutDetailModal
        open={detail !== null}
        row={detail}
        branchNameOf={branchNameOf}
        nameOf={nameOf}
        viewer={viewer}
        busy={busy}
        onAction={(row, action) => void act(row, action)}
        onClose={() => setDetail(null)}
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
