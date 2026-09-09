import {
  Badge,
  Button,
  Card,
  CardHeading,
  cardText,
  InfoField,
  InfoGrid,
  Modal,
  type BadgeTone,
} from '@ynarcher/ui'
import {
  FUND_PORTFOLIO_CONTENT_KEY,
  type SensitiveField,
} from '@/features/admin/sensitiveContents'
import { SensitiveValue } from '@/features/master/SensitiveValue'
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

  /**
   * 회사개요의 개인정보 세 칸 — 정책 키와 로그 컨텍스트를 세 번 적지 않는다.
   * 컴포넌트가 아니라 값을 돌려주는 함수인 이유는 열람 상태다: 렌더마다 새 컴포넌트 타입이
   * 만들어지면 '보기'로 연 원본이 다음 렌더에서 다시 가려진다.
   */
  const masked = (field: SensitiveField, value: string | null) => (
    <SensitiveValue
      field={field}
      contentKey={FUND_PORTFOLIO_CONTENT_KEY}
      value={value}
      resourceType="fund_investment"
      resourceId={inv.id}
    />
  )

  const categoryLabel = managementStatusLabel(inv.startup_management_status)
  const categoryTone: BadgeTone = inv.startup_management_status
    ? MANAGEMENT_STATUS_TONE[inv.startup_management_status as ManagementStatus] ?? 'neutral'
    : 'neutral'

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      sectioned
      title="투자 집행 상세"
      footer={<Button onClick={() => onEdit(inv)}>수정</Button>}
    >
      <>
        {/* 헤더: 로고 + 이름·업종 배지 + 부제 + 상태·분류 칩 — STARTUP 상세 헤더 구성과 동일.
            업종은 이름 옆(중립), 구분·라운드·관리현황은 부제 아래 칩 줄로 분리해 위계를 만든다.
            카드 밖에 서서 이 모달 전체가 어느 기업에 대한 것인지 먼저 답한다. */}
        <div className="flex items-center gap-5">
          <PhotoBox src={inv.startup_logo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-title-md font-bold text-gray-900">{inv.startup_name ?? '-'}</h3>
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

        {/* 회사개요(startups 호출값). 대표자·이메일·연락처는 STARTUP 상세와 같은 순서로 선다 —
            같은 값을 두 화면에서 보는 눈이 자리를 다시 찾지 않아야 한다. */}
        <Card title="회사 개요">
          <InfoGrid>
            {/* 대표자·이메일·연락처는 외부 기업 정보 — ADMIN '민감정보 관리'의 fund.portfolio 정책을 따른다. */}
            <Info label="대표자" value={masked('name', inv.startup_representative)} />
            <Info label="이메일" value={masked('email', inv.startup_email)} />
            <Info label="연락처" value={masked('phone', inv.startup_phone)} />
            <Info label="설립일" value={shortDate(inv.startup_founded_on)} />
            <Info label="소재지" value={inv.startup_location || '-'} />
          </InfoGrid>
        </Card>

        {/* 투자 집행 정보 + 딜메이커. */}
        <Card title="투자 집행 정보">
          <InfoGrid>
            <Info label="투자펀드" value={fundName} />
            <Info label="투자일" value={shortDate(inv.invested_at)} />
            <Info label="라운드" value={inv.stage || '-'} />
            <Info label="투자방식" value={inv.investment_method || '-'} />
            <Info label="PRE VALUE" value={num(inv.valuation)} />
            <Info label="POST VALUE" value={num(inv.post_valuation)} />
            <Info label="집행액" value={num(inv.amount)} />
          </InfoGrid>

          {/* 딜메이커는 금액·조건과 같은 줄에 섞이지 않는다 — 저 값들은 이 건의 조건이고 여기는
              사람이라, 한 격자에 두면 '이메일'이 무엇의 이메일인지 라벨이 스스로 답하지 못한다.
              이름만 요약 규격('외 N')이고 이메일·연락처는 딜메이커(리드) 본인 것이다 — 연락처는
              사람 하나에 붙는 값이라 접을 수 없다. 내부 임직원이므로 마스킹하지 않는다. */}
          <CardHeading level="subhead" className="mt-4">
            딜메이커
          </CardHeading>
          <InfoGrid className="mt-2">
            <Info label="이름" value={inv.dealmaker_name || '-'} />
            <Info label="이메일" value={inv.dealmaker_email || '-'} />
            <Info label="연락처" value={inv.dealmaker_phone || '-'} />
          </InfoGrid>
        </Card>
      </>
    </Modal>
  )
}
