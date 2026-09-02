import { Badge, Button, DataTable, ExpandToggleButton, PanelCard } from '@ynarcher/ui'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FUND_PORTFOLIO_CONTENT_KEY } from '@/features/admin/sensitiveContents'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { buildPortfolioColumns } from '@/features/fund/portfolioColumns'
import { InvestmentDetailModal } from '@/features/fund/InvestmentDetailModal'
import type { FundPurpose, Investment } from '@/features/fund/hooks'

/** 카드 안 요약표와 전체보기 오버레이의 페이지 크기. */
const CARD_PAGE_SIZE = 10
const FULL_PAGE_SIZE = 20

/**
 * 포트폴리오 보드 카드(펀드 상세 포트폴리오 탭).
 * 헤더 '전체보기'로 AC 운영보드(칸반/간트)와 동일한 전체화면 오버레이(z-500, Esc 닫힘)를 열어
 * 표를 전체 컬럼으로 펼친다. 카드 축소 상태는 요약보기(핵심 투자 컬럼만)로 둔다.
 * 행을 누르면 상세 모달이 열리고, 거기서 수정·삭제로 이어진다.
 *
 * 페이징은 두 자리가 따로 세되(카드 10건 / 전체보기 20건) **페이저는 양쪽 다 번호줄이고 한
 * 페이지뿐이어도 노출한다.** 포트폴리오는 카드 안에 있어도 이 탭의 작업 대상이라, 목록 화면의
 * 표와 같은 자리·같은 모양의 페이저가 서 있어야 한다(미니 페이저는 한 페이지면 사라져,
 * 건수가 적을 때 표 아래가 다른 화면과 달라 보인다).
 */
export function PortfolioBoardCard({
  fundName,
  investments,
  purposes,
  onAdd,
  onEdit,
}: {
  fundName: string
  investments: Investment[]
  purposes: FundPurpose[]
  onAdd: () => void
  onEdit: (inv: Investment) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<Investment | null>(null)
  const [cardPage, setCardPage] = useState(0)
  const [fullPage, setFullPage] = useState(0)
  // 피투자사(외부 기업) 대표자명 정책. 딜메이커·관리인력은 내부 임직원이라 대상이 아니다.
  const masked = useMaskPolicy(FUND_PORTFOLIO_CONTENT_KEY)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // 카드 축소 상태는 요약 컬럼, 전체보기 오버레이는 전체 컬럼.
  const summaryColumns = buildPortfolioColumns({
    fundName,
    purposes,
    compact: true,
    maskRepresentative: masked.name,
  })
  const fullColumns = buildPortfolioColumns({ fundName, purposes, maskRepresentative: masked.name })

  // 목록이 줄어(삭제 등) 보고 있던 페이지가 사라지면 마지막 페이지로 당긴다.
  const cardPages = Math.max(1, Math.ceil(investments.length / CARD_PAGE_SIZE))
  const safeCardPage = Math.min(cardPage, cardPages - 1)
  const cardRows = investments.slice(safeCardPage * CARD_PAGE_SIZE, (safeCardPage + 1) * CARD_PAGE_SIZE)
  const fullPages = Math.max(1, Math.ceil(investments.length / FULL_PAGE_SIZE))
  const safeFullPage = Math.min(fullPage, fullPages - 1)
  const fullRows = investments.slice(safeFullPage * FULL_PAGE_SIZE, (safeFullPage + 1) * FULL_PAGE_SIZE)

  // 수정: 상세 닫고 편집 폼 열기(삭제는 편집 폼 좌측 하단에서 처리).
  const handleEdit = (inv: Investment) => {
    setDetail(null)
    onEdit(inv)
  }

  const actions = (
    <div className="flex items-center gap-2">
      <ExpandToggleButton
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        expandLabel="전체보기"
        expandIcon={<Maximize2 className="h-4 w-4" />}
        collapseIcon={<Minimize2 className="h-4 w-4" />}
      />
      <Button onClick={onAdd}>투자 집행 등록</Button>
    </div>
  )

  return (
    <>
      <PanelCard title="포트폴리오" count={investments.length} action={actions}>
        <DataTable
          columns={summaryColumns}
          rows={cardRows}
          rowKey={(r) => r.id}
          standardColumns={false}
          stickyLead
          onRowClick={(r) => setDetail(r)}
          emptyText="집행된 투자가 없습니다."
          pagination={{
            page: safeCardPage,
            pageSize: CARD_PAGE_SIZE,
            total: investments.length,
            onChange: setCardPage,
          }}
        />
      </PanelCard>

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-fullscreen flex flex-col bg-gray-25">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-title-sm font-medium text-gray-900">포트폴리오</span>
                <Badge tone="neutral">{fundName}</Badge>
              </div>
              {actions}
            </header>
            <div className="flex-1 overflow-auto px-6 py-6">
              <DataTable
                columns={fullColumns}
                rows={fullRows}
                rowKey={(r) => r.id}
                standardColumns={false}
                stickyLead
                onRowClick={(r) => setDetail(r)}
                emptyText="집행된 투자가 없습니다."
                pagination={{
                  page: safeFullPage,
                  pageSize: FULL_PAGE_SIZE,
                  total: investments.length,
                  onChange: setFullPage,
                }}
              />
            </div>
          </div>,
          document.body,
        )}

      <InvestmentDetailModal
        investment={detail}
        fundName={fundName}
        onClose={() => setDetail(null)}
        onEdit={handleEdit}
      />
    </>
  )
}
