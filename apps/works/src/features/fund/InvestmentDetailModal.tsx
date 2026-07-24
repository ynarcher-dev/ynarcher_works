import { Badge, Button, cardText, InfoField, Modal, type BadgeTone } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import { PhotoBox } from '@/features/networks/PhotoBox'
import {
  MANAGEMENT_STATUS_TONE,
  managementStatusLabel,
  type ManagementStatus,
} from '@/features/startup/startupClassification'
import type { Investment } from '@/features/fund/hooks'

const Info = InfoField

/** YYYY-MM-DD 앞 10자리. 없으면 '-'. */
function shortDate(v: string | null): string {
  return v ? v.slice(0, 10) : '-'
}

/** 숫자 콤마 표기. null이면 '-'. */
function num(v: number | null): string {
  return v == null ? '-' : Number(v).toLocaleString()
}

/**
 * 포트폴리오 투자 건 상세(읽기 전용) 모달. 표의 행을 누르면 열리며, 하단 수정으로 편집 폼(삭제 포함)으로 이어진다.
 * 회사개요·구분·관리현황·딜메이커·아이템은 startups 조인 호출값이라 여기서도 읽기 전용으로만 보여준다.
 */
export function InvestmentDetailModal({
  investment,
  fundName,
  onClose,
  onEdit,
}: {
  /** 열림 대상. null이면 닫힘. */
  investment: Investment | null
  fundName: string
  onClose: () => void
  onEdit: (inv: Investment) => void
}) {
  const inv = investment
  if (!inv) return null

  const categoryLabel = managementStatusLabel(inv.startup_management_status)
  const categoryTone: BadgeTone = inv.startup_management_status
    ? MANAGEMENT_STATUS_TONE[inv.startup_management_status as ManagementStatus] ?? 'neutral'
    : 'neutral'

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="투자 집행 상세"
      footer={<Button onClick={() => onEdit(inv)}>수정</Button>}
    >
      <div className="space-y-4">
        {/* 헤더: 로고 + 이름·업종 배지 + 부제 + 상태·분류 칩 — STARTUP 상세 헤더 구성과 동일.
            업종은 이름 옆(중립), 구분·라운드·관리현황은 부제 아래 칩 줄로 분리해 위계를 만든다. */}
        <div className="flex items-center gap-5">
          <PhotoBox src={inv.startup_logo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {inv.startup_id ? (
                <Link
                  to={`/startup/discovered/${inv.startup_id}`}
                  className="text-title-md font-bold text-info underline underline-offset-2 hover:opacity-80"
                >
                  {inv.startup_name ?? '-'}
                </Link>
              ) : (
                <h3 className="text-title-md font-bold text-gray-900">{inv.startup_name ?? '-'}</h3>
              )}
              {inv.startup_industries.map((ind) => (
                <Badge key={ind} tone="neutral">
                  {ind}
                </Badge>
              ))}
            </div>
            {/* 부제 = startups 한줄소개 */}
            <p className={`mt-1 ${cardText.subtitle}`}>{inv.startup_one_liner || '-'}</p>
            {/* 상태·분류 칩: 라운드=중립(사실), 구분=주 분류, 관리현황=라이브 상태(점). */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {inv.stage && <Badge tone="neutral">{inv.stage}</Badge>}
              {categoryLabel && <Badge tone={categoryTone}>{categoryLabel}</Badge>}
              {inv.startup_pool_status && (
                <Badge tone="success" dot>
                  {inv.startup_pool_status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* 회사개요(startups 호출값) */}
        <div className="grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Info label="대표자" value={inv.startup_representative || '-'} />
          <Info label="설립일" value={shortDate(inv.startup_founded_on)} />
          <Info label="소재지" value={inv.startup_location || '-'} />
        </div>

        {/* 투자 집행 정보 — 딜메이커는 집행액 우측(마지막 행). */}
        <div className="grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Info label="투자펀드" value={fundName} />
          <Info label="투자일" value={shortDate(inv.invested_at)} />
          <Info label="라운드" value={inv.stage || '-'} />
          <Info label="투자방식" value={inv.investment_method || '-'} />
          <Info label="PRE VALUE" value={num(inv.valuation)} />
          <Info label="POST VALUE" value={num(inv.post_valuation)} />
          <Info label="집행액" value={num(inv.amount)} />
          <Info label="딜메이커" value={inv.dealmaker_name || '-'} />
        </div>
      </div>
    </Modal>
  )
}
