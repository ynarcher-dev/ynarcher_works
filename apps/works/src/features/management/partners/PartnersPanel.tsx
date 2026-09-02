import {
  Button,
  FilterResetButton,
  Input,
  MultiSelectFilter,
  Spinner,
  useToast,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import { ListActions } from '@/components/ListActions'
import {
  PARTNER_TYPE_LABELS,
  PARTNER_TYPE_ORDER,
} from '@/features/management/partners/config'
import { PartnerFormModal } from '@/features/management/partners/PartnerFormModal'
import { PartnersTable } from '@/features/management/partners/PartnersTable'
import {
  EMPTY_PARTNER_FILTERS,
  hasActivePartnerFilters,
  useCreatePartner,
  usePartnersPage,
  useSetPartnersActive,
  useUpdatePartner,
  type PartnerFilters,
  type TradePartner,
  type TradePartnerInput,
} from '@/features/management/partners/partnersApi'

/** 목록 페이지당 행 수(서버 사이드 페이지네이션). */
const PAGE_SIZE = 30

const ACTIVE_OPTIONS = [
  { value: 'true', label: '사용' },
  { value: 'false', label: '중단' },
]

/**
 * MANAGEMENT 거래처 정보 — 검색·필터 → 거래처 표 → 등록/수정 모달.
 * 기획: docs_planning/3_7_4_management_partners.md
 *
 * 이 화면이 지급 상대의 단일 원천이다. NETWORKS 외주/거래 마스터(vendors)가 "누구와 일하는가"를
 * 담는다면 여기는 "누구에게 어느 계좌로 보내는가"를 담는다 — 계좌와 증빙이 붙어 있어 접근 주체가
 * 좁으므로 원장을 나눠 두었다(migration 20260903210000의 머리말).
 *
 * 이 컴포넌트는 목록의 상태(검색어·필터·페이지·선택)만 소유한다. 표는 PartnersTable이,
 * 값 규칙은 partnerForm이, 서류 업로드·열람은 partnerDocs가 갖는다.
 */
export function PartnersPanel() {
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<PartnerFilters>(EMPTY_PARTNER_FILTERS)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])

  const { data, isLoading } = usePartnersPage(keyword, filters, page, PAGE_SIZE)
  const rows = useMemo(() => data?.rows ?? [], [data])

  const createPartner = useCreatePartner()
  const updatePartner = useUpdatePartner()
  const setActive = useSetPartnersActive()
  const busy = createPartner.isPending || updatePartner.isPending || setActive.isPending

  const [form, setForm] = useState<'create' | TradePartner | null>(null)
  const editing = form && form !== 'create' ? form : undefined

  // 검색·필터가 바뀌면 첫 페이지로 되돌린다(있지도 않은 3페이지에 머무르지 않게).
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
  }, [keyword, filtersKey])

  // 선택은 화면에 보이는 것에 대한 선택이다 — 목록이 바뀌면 비운다.
  useEffect(() => {
    setSelected([])
  }, [keyword, filtersKey, page])

  const selectedRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r] as const))
    return selected.map((id) => byId.get(id)).filter((r): r is TradePartner => Boolean(r))
  }, [rows, selected])

  const submit = async (v: TradePartnerInput) => {
    try {
      if (editing) {
        await updatePartner.mutateAsync({ ...v, id: editing.id })
        toast.show('거래처를 수정했습니다.', 'success')
      } else {
        await createPartner.mutateAsync(v)
        toast.show('거래처를 등록했습니다.', 'success')
      }
      setForm(null)
    } catch {
      toast.show('저장에 실패했습니다. 입력값과 권한을 확인하세요.', 'danger')
    }
  }

  const applyActive = async (isActive: boolean) => {
    if (!selectedRows.length) return
    try {
      await setActive.mutateAsync({ ids: selectedRows.map((r) => r.id), isActive })
      toast.show(
        `${selectedRows.length}건을 ${isActive ? '사용으로 되돌렸습니다' : '거래 중단으로 바꿨습니다'}.`,
        'success',
      )
      setSelected([])
    } catch {
      toast.show('사용 여부 변경에 실패했습니다.', 'danger')
    }
  }

  return (
    <div className="space-y-3">
      {/* 검색과 필터는 같은 층의 조건이라 한 줄에 세운다(자산 관리와 같은 규격). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <Input
            placeholder="거래처명·코드·사업자등록번호·예금주 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <MultiSelectFilter
          label="구분"
          options={PARTNER_TYPE_ORDER.map((v) => ({ value: v, label: PARTNER_TYPE_LABELS[v] }))}
          selected={filters.types}
          onChange={(types) => setFilters({ ...filters, types })}
        />
        <MultiSelectFilter
          label="사용 여부"
          options={ACTIVE_OPTIONS}
          selected={filters.active}
          onChange={(active) => setFilters({ ...filters, active })}
        />
        {hasActivePartnerFilters(filters) && (
          <FilterResetButton onClick={() => setFilters(EMPTY_PARTNER_FILTERS)} />
        )}
        <div className="sm:ml-auto">
          {/* 대용량 업로드는 두지 않는다 — 계좌·증빙 서류가 한 벌로 붙는 원장이라 표 한 장으로
              옮겨지지 않고, 서류 없이 들어온 행은 결국 한 건씩 다시 열어 채워야 한다. */}
          <ListActions createLabel="거래처 등록" onCreate={() => setForm('create')} />
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-body font-semibold text-gray-900">
            {selectedRows.length}건 선택
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => void applyActive(true)} disabled={busy}>
              사용으로 전환
            </Button>
            <Button variant="outline" onClick={() => void applyActive(false)} disabled={busy}>
              거래 중단
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        // 행을 누르면 그 거래처를 연다 — 확인과 수정이 같은 화면이라 '수정' 열을 따로 두지 않는다.
        <PartnersTable
          rows={rows}
          selectedKeys={selected}
          onSelectionChange={setSelected}
          onRowClick={(p) => setForm(p)}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalAll: data?.totalAll ?? 0,
            onChange: setPage,
          }}
        />
      )}

      <PartnerFormModal
        open={form !== null}
        partner={editing}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={submit}
      />
    </div>
  )
}
