import { Button, InlineSelect, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EntityFormModal } from '@/features/networks/EntityFormModal'
import { DeactivateReasonModal } from '@/features/networks/DeactivateReasonModal'
import {
  recordContribution,
  useEntityPage,
  useReassignCategory,
  useUpdateEntity,
  type EntityRow,
} from '@/features/networks/hooks'
import {
  CATEGORY_OPTIONS,
  resolveEntityFromCategory,
  suggestCategory,
  usesDetailPage,
  ENTITIES,
  type EntityConfig,
  type EntityKey,
} from '@/features/networks/config'
import { MasterListView } from '@/features/master/MasterListView'
import type { MasterRow } from '@/features/master/types'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

interface DirectoryTabProps {
  config: EntityConfig
  keyword: string
  /**
   * 상세페이지가 없는 엔티티(스타트업)의 등록 모달 제어.
   * NETWORKS 8종 마스터는 상세페이지로 등록하므로 전달하지 않는다.
   */
  creating?: boolean
  setCreating?: (c: boolean) => void
}

/**
 * 엔티티 디렉토리 탭: 목록(공용 리스트뷰) + 등록.
 * 상세페이지 엔티티(프로필·조직 마스터)는 행 클릭 시 상세페이지로 진입해 등록/편집한다.
 * 그 외 엔티티(스타트업)는 등록 모달을 사용한다.
 */
export function DirectoryTab({ config, keyword, creating, setCreating }: DirectoryTabProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const update = useUpdateEntity(config.table)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [bulkCat, setBulkCat] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  // 비활성화 사유 입력 모달 대상(열림 = 값 존재).
  const [deactivateTarget, setDeactivateTarget] = useState<MasterRow | null>(null)
  const [deactivateBusy, setDeactivateBusy] = useState(false)
  // 검색어·엔티티 전환 시 첫 페이지로 되돌리고 선택을 비운다(빈 페이지·유령 선택 방지).
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword, config.table])
  const { data, isLoading } = useEntityPage(config.table, keyword, page, PAGE_SIZE)
  // 미분류(others)는 분류 전 임시 저장소이므로 상세페이지로 진입하지 않는다(행 클릭 비활성).
  const hasDetailPage = usesDetailPage(config.key) && config.key !== 'others'

  // 미분류(others)는 목록에서 구분을 골라 대상 네트워크로 이관하는 임시 저장소로 동작한다.
  const isOthers = config.key === 'others'
  const reassign = useReassignCategory(config.table)

  // 선택 행을 대상 구분들로 일괄 이관한다(순차 처리 후 요약). 성공 건수 반환.
  const reassignMany = async (pairs: { row: EntityRow; to: EntityKey }[]): Promise<number> => {
    let ok = 0
    setBulkBusy(true)
    for (const p of pairs) {
      try {
        await reassign.mutateAsync(p)
        ok += 1
      } catch {
        // 개별 실패는 건너뛰고 계속 진행(권한/중복 등).
      }
    }
    setBulkBusy(false)
    setSelected([])
    return ok
  }

  const selectedRows = (): EntityRow[] => {
    const byId = new Map((data?.rows ?? []).map((r) => [r.id, r as EntityRow]))
    return selected.map((id) => byId.get(id)).filter((r): r is EntityRow => Boolean(r))
  }

  const applyChosen = async () => {
    const target = resolveEntityFromCategory(bulkCat)
    if (!bulkCat || target === 'others') {
      toast.show('적용할 구분을 선택하세요.', 'warning')
      return
    }
    const ok = await reassignMany(selectedRows().map((row) => ({ row, to: target })))
    toast.show(`${ok}건을 ${ENTITIES[target].label} 네트워크로 이관했습니다.`, ok ? 'success' : 'danger')
  }

  const applySuggested = async () => {
    const rows = selectedRows()
    const pairs = rows
      .map((row) => ({
        row,
        to: suggestCategory(row.affiliation as string, row.email as string),
      }))
      .filter((p): p is { row: EntityRow; to: EntityKey } => Boolean(p.to))
    if (pairs.length === 0) {
      toast.show('추천할 수 있는 구분이 없습니다.', 'warning')
      return
    }
    const ok = await reassignMany(pairs)
    toast.show(
      `추천 구분으로 ${ok}건 이관했습니다. (미추천 ${rows.length - pairs.length}건 유지)`,
      'success',
    )
  }
  const categorySelect = isOthers
    ? {
        // 선두 플레이스홀더 + 미분류를 제외한 대상 구분들.
        options: [
          { value: '', label: '구분 선택' },
          ...CATEGORY_OPTIONS.filter((o) => o.key !== 'others').map((o) => ({
            value: o.label,
            label: o.label,
          })),
        ],
        disabled: reassign.isPending,
        onChange: (row: MasterRow, value: string) => {
          const target = resolveEntityFromCategory(value)
          // 플레이스홀더(빈 값)이거나 동일 엔티티면 무시한다.
          if (!value || target === config.key) return
          reassign.mutate(
            { row: row as EntityRow, to: target },
            {
              onSuccess: () =>
                toast.show(`${ENTITIES[target].label} 네트워크로 이관했습니다.`, 'success'),
              onError: () =>
                toast.show('이관에 실패했습니다. 권한을 확인하세요.', 'danger'),
            },
          )
        },
      }
    : undefined

  // 비활성화 사유 확정 → 기여 로그(사유·행위자)를 먼저 남기고 soft-delete한다.
  // 기여를 먼저 기록해 파괴적 가드(기여자 검사)를 통과시키고, 사유·비활성화자를 함께 보존한다.
  const confirmDeactivate = async (reason: string) => {
    if (!deactivateTarget) return
    const target = deactivateTarget
    setDeactivateBusy(true)
    try {
      await recordContribution({
        table: config.table,
        id: target.id,
        action: 'deactivated',
        source: 'manual',
        note: reason,
      })
      await update.mutateAsync({
        id: target.id,
        values: { deleted_at: new Date().toISOString() },
      })
      toast.show(`${config.label}을(를) 비활성화했습니다.`, 'success')
      setDeactivateTarget(null)
    } catch {
      toast.show('비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    } finally {
      setDeactivateBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {isOthers && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-radius-md border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-caption font-medium text-gray-700">선택 {selected.length}건</span>
          <div className="w-36">
            <InlineSelect value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
              <option value="">구분 선택</option>
              {CATEGORY_OPTIONS.filter((o) => o.key !== 'others').map((o) => (
                <option key={o.key} value={o.label}>{o.label}</option>
              ))}
            </InlineSelect>
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
        label={config.label}
        columns={config.listColumns ?? config.fields}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        onRowClick={
          hasDetailPage
            ? (r) => navigate(`/networks/${config.key}/${r.id}`)
            : undefined
        }
        onDeactivate={(row) => setDeactivateTarget(row)}
        deactivateWithReason
        categorySelect={categorySelect}
        selectedKeys={isOthers ? selected : undefined}
        onSelectionChange={isOthers ? setSelected : undefined}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalAll: data?.totalAll ?? 0,
          onChange: setPage,
        }}
      />

      {/* 상세페이지 엔티티는 상세페이지에서 등록하므로 모달을 렌더하지 않는다. */}
      {!hasDetailPage && setCreating && (
        <EntityFormModal
          config={config}
          open={Boolean(creating)}
          onClose={() => setCreating(false)}
          initial={null}
        />
      )}

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
