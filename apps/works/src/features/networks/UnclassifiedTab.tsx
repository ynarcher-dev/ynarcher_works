import { Button, ListToolbar, Select, useToast } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { DeactivateReasonModal } from '@/features/networks/DeactivateReasonModal'
import {
  useAssignCategory,
  useDeactivateNetwork,
  useNetworkListPage,
  type NetworkRow,
} from '@/features/networks/hooks'
import {
  CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  NETWORK_UNCLASSIFIED_LIST_COLUMNS,
  suggestCategory,
  type NetworkCategory,
} from '@/features/networks/config'
import { EMPTY_NETWORK_FILTERS, searchPlaceholderFor } from '@/features/networks/filters'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'

/** 목록 페이지당 행 수(통합 목록과 동일). */
const PAGE_SIZE = 30

/** 민감정보 정책 콘텐츠 키(ADMIN '민감정보 관리'). */
const CONTENT_KEY = 'networks.others'

/**
 * 미분류 데이터베이스 — 구분이 아직 정해지지 않은 행(`category is null`)의 작업 대기열.
 *
 * 통합 원장(2026-09-04) 이후 미분류는 별도 원장이 아니라 값이 비어 있는 상태다. 그래서
 * 구분 지정이 **행 이동이 아니라 UPDATE 한 줄**이며 id가 바뀌지 않는다 — 종전에는 이관할
 * 때마다 새 행이 생겨 그 레코드에 붙어 있던 자료·피드백·회의록 링크가 원본을 잃었다.
 *
 * 메뉴를 따로 두는 이유는 분류 대기 건이 조회 조건이 아니라 매일 처리해야 할 일이기 때문이다.
 */
export function UnclassifiedTab() {
  const navigate = useNavigate()
  const toast = useToast()
  const deactivate = useDeactivateNetwork()
  const assign = useAssignCategory()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkCat, setBulkCat] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<MasterRow | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)

  // 검색어 변경 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword])

  // 검색 가능 범위는 이 목록의 마스킹 정책이 정한다 — 가려진 필드는 검색어로도 잡지 않는다.
  const masked = useMaskPolicy(CONTENT_KEY)
  const searchScope = useMemo(
    () => ({ email: !masked.email, phone: !masked.phone }),
    [masked.email, masked.phone],
  )

  const { data, isLoading } = useNetworkListPage(
    'all',
    keyword,
    page,
    PAGE_SIZE,
    EMPTY_NETWORK_FILTERS,
    searchScope,
    // 이 목록이 담는 것은 구분이 비어 있는 행뿐이다.
    true,
  )

  // 선택 행에 구분을 순차로 지정한다(개별 실패는 건너뛰고 계속). 성공 건수 반환.
  const assignMany = async (pairs: { id: string; category: NetworkCategory }[]): Promise<number> => {
    let ok = 0
    setBulkBusy(true)
    for (const p of pairs) {
      try {
        await assign.mutateAsync({ ...p, note: '미분류 일괄 지정' })
        ok += 1
      } catch {
        // 권한 등으로 실패한 건은 미분류에 그대로 남는다.
      }
    }
    setBulkBusy(false)
    setSelected([])
    return ok
  }

  const selectedRows = (): NetworkRow[] => {
    const byId = new Map((data?.rows ?? []).map((r) => [r.id, r]))
    return selected.map((id) => byId.get(id)).filter((r): r is NetworkRow => Boolean(r))
  }

  const applyChosen = async () => {
    if (!bulkCat) {
      toast.show('적용할 구분을 선택하세요.', 'warning')
      return
    }
    const target = bulkCat as NetworkCategory
    const ok = await assignMany(selectedRows().map((row) => ({ id: row.id, category: target })))
    toast.show(`${ok}건을 ${CATEGORY_LABEL[target]}(으)로 지정했습니다.`, ok ? 'success' : 'danger')
  }

  const applySuggested = async () => {
    const rows = selectedRows()
    const pairs = rows
      .map((row) => ({
        id: row.id,
        category: suggestCategory(row.affiliation as string, row.email as string),
      }))
      .filter((p): p is { id: string; category: NetworkCategory } => Boolean(p.category))
    if (pairs.length === 0) {
      toast.show('추천할 수 있는 구분이 없습니다.', 'warning')
      return
    }
    const ok = await assignMany(pairs)
    toast.show(
      `추천 구분으로 ${ok}건 지정했습니다. (미추천 ${rows.length - pairs.length}건 유지)`,
      'success',
    )
  }

  const categorySelect = {
    // 선두 플레이스홀더 + 대상 구분들. 값은 저장되는 코드 그대로다.
    options: [
      { value: '', label: '구분 선택' },
      ...CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
    ],
    disabled: assign.isPending,
    onChange: (row: MasterRow, value: string) => {
      if (!value) return
      const target = value as NetworkCategory
      assign.mutate(
        { id: row.id, category: target, note: '미분류에서 구분 지정' },
        {
          onSuccess: () => toast.show(`${CATEGORY_LABEL[target]}(으)로 지정했습니다.`, 'success'),
          onError: () => toast.show('구분 지정에 실패했습니다. 권한을 확인하세요.', 'danger'),
        },
      )
    },
  }

  // 비활성화 사유 확정 → 사유를 트랜잭션 컨텍스트에 실어 주는 RPC 경유(20260721160000).
  const confirmDeactivate = async (reason: string) => {
    if (!deactivateTarget) return
    setDeactivateBusy(true)
    try {
      await deactivate.mutateAsync({ id: deactivateTarget.id, reason })
      toast.show('비활성화했습니다.', 'success')
      setDeactivateTarget(null)
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setDeactivateBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder={searchPlaceholderFor(searchScope)}
        // 필터 축이 없다 — 이 목록의 열은 전부 인적사항이고 구분은 정의상 비어 있다.
        // 직접 등록도 두지 않는다(분류 전 임시 상태를 일부러 만들 이유가 없다).
        // 다만 업로드가 미분류로 떨어지는 자리라 대용량 업로드는 여기에도 둔다.
        actions={<ListActions bulkTo="/networks/bulk" />}
      />

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-caption font-medium text-gray-700">선택 {selected.length}건</span>
          <div className="w-36">
            <Select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
              <option value="">구분 선택</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </Select>
          </div>
          <Button onClick={() => void applyChosen()} disabled={bulkBusy}>
            일괄 적용
          </Button>
          <Button variant="outline" onClick={() => void applySuggested()} disabled={bulkBusy}>
            추천 구분 자동 적용
          </Button>
          <Button variant="secondary" onClick={() => setSelected([])} disabled={bulkBusy}>
            선택 해제
          </Button>
        </div>
      )}

      <MasterListView
        label="미분류"
        contentKey={CONTENT_KEY}
        columns={NETWORK_UNCLASSIFIED_LIST_COLUMNS}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        // 원장이 하나가 되면서 미분류 행도 같은 상세를 연다 — 분류 전이라도 자료·피드백은
        // 이미 그 행에 붙는다(구분 지정으로 id가 바뀌지 않으므로 그대로 이어진다).
        onRowClick={(r) => navigate(`/networks/record/${r.id}`)}
        onDeactivate={(row) => setDeactivateTarget(row)}
        deactivateWithReason
        categorySelect={categorySelect}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalAll: data?.totalAll ?? 0,
          onChange: setPage,
        }}
      />

      {deactivateTarget && (
        <DeactivateReasonModal
          open
          name={deactivateTarget.name}
          busy={deactivateBusy}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={(reason) => void confirmDeactivate(reason)}
        />
      )}
    </div>
  )
}
