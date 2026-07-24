import { Badge, Button, CardShell, DataTable } from '@ynarcher/ui'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildPortfolioColumns } from '@/features/fund/portfolioColumns'
import { InvestmentDetailModal } from '@/features/fund/InvestmentDetailModal'
import type { FundPurpose, Investment } from '@/features/fund/hooks'

/**
 * 포트폴리오 보드 카드(펀드 상세 포트폴리오 탭).
 * 헤더 '크게보기'로 AC 운영보드(칸반/간트)와 동일한 전체화면 오버레이(z-500, Esc 닫힘)를 열어
 * 같은 표를 크게 편다. 행을 누르면 상세 모달이 열리고, 거기서 수정·삭제로 이어진다.
 */
export function PortfolioBoardCard({
  fundName,
  investments,
  purposes,
  onAdd,
  onEdit,
  onDelete,
}: {
  fundName: string
  investments: Investment[]
  purposes: FundPurpose[]
  onAdd: () => void
  onEdit: (inv: Investment) => void
  onDelete: (inv: Investment) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<Investment | null>(null)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  // 기본 표·크게보기 모두 같은 컬럼(크게보기는 같은 표를 큰 캔버스에 펼칠 뿐).
  const columns = buildPortfolioColumns({ fundName, purposes })

  // 수정: 상세 닫고 편집 폼 열기. 삭제: 상세 닫고 삭제(확인창은 onDelete 내부).
  const handleEdit = (inv: Investment) => {
    setDetail(null)
    onEdit(inv)
  }
  const handleDelete = (inv: Investment) => {
    setDetail(null)
    onDelete(inv)
  }

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title={expanded ? '축소' : '크게보기'}
        aria-label={expanded ? '축소' : '크게보기'}
        onClick={() => setExpanded((v) => !v)}
        className="flex h-ctl-card items-center gap-1.5 rounded-radius-md border border-gray-300 bg-white px-2.5 text-caption font-medium text-gray-600 transition-colors duration-fast hover:bg-gray-25 hover:text-gray-700"
      >
        {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        <span>{expanded ? '축소' : '크게보기'}</span>
      </button>
      <Button onClick={onAdd}>투자 집행 등록</Button>
    </div>
  )

  return (
    <>
      <CardShell>
        <div className="mb-3 flex justify-end">{actions}</div>
        <DataTable
          columns={columns}
          rows={investments}
          rowKey={(r) => r.id}
          standardColumns={false}
          onRowClick={(r) => setDetail(r)}
          emptyText="집행된 투자가 없습니다."
        />
      </CardShell>

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-[500] flex flex-col bg-gray-25">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-title-sm font-medium text-gray-900">포트폴리오</span>
                <Badge tone="neutral">{fundName}</Badge>
              </div>
              {actions}
            </header>
            <div className="flex-1 overflow-auto px-6 py-6">
              <DataTable
                columns={columns}
                rows={investments}
                rowKey={(r) => r.id}
                standardColumns={false}
                onRowClick={(r) => setDetail(r)}
                emptyText="집행된 투자가 없습니다."
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
        onDelete={handleDelete}
      />
    </>
  )
}
