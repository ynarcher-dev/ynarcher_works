import { Badge, type BadgeTone, type Column } from '@ynarcher/ui'
import { Link } from 'react-router-dom'
import {
  MANAGEMENT_STATUS_TONE,
  managementStatusLabel,
  type ManagementStatus,
} from '@/features/startup/startupClassification'
import type { Investment } from '@/features/fund/hooks'

/** YYYY-MM-DD 앞 10자리. 없으면 '-'. */
function shortDate(v: string | null): string {
  return v ? v.slice(0, 10) : '-'
}

/** 숫자 콤마 표기. null이면 '-'. */
function num(v: number | null): string {
  return v == null ? '-' : Number(v).toLocaleString()
}

/**
 * 포트폴리오 표 컬럼 팩토리(단일 순서). 기본 표·크게보기 모두 같은 컬럼을 쓴다(크게보기는 같은 표를 크게 볼 뿐).
 * 회사개요·구분·관리현황·딜메이커·아이템은 startups 마스터 조인 호출값(investments 중복 저장 안 함, §2.3).
 * 행 클릭 시 상세 모달이 열리므로 수정/삭제는 컬럼이 아니라 모달에서 처리한다.
 */
export function buildPortfolioColumns({ fundName }: { fundName: string }): Column<Investment>[] {
  // 기업명 = 스타트업 상세(/startup/discovered/:id) 하이퍼링크. id 없으면 링크 없이 텍스트.
  // 링크 클릭은 stopPropagation — 행 클릭(상세 모달)과 분리해 이름은 스타트업 상세로만 이동한다.
  const startupColumn: Column<Investment> = {
    key: 'startup',
    header: '기업명',
    primary: true,
    render: (r) =>
      r.startup_id ? (
        <Link
          to={`/startup/discovered/${r.startup_id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-info underline underline-offset-2 transition-opacity duration-fast hover:opacity-80"
        >
          {r.startup_name ?? '-'}
        </Link>
      ) : (
        (r.startup_name ?? '-')
      ),
  }

  // 아이템 = startups 한줄소개(business_profile.oneLiner).
  const itemColumn: Column<Investment> = {
    key: 'item',
    header: '아이템',
    render: (r) => (
      <span className="block max-w-[16rem] truncate text-gray-600" title={r.startup_one_liner ?? ''}>
        {r.startup_one_liner || '-'}
      </span>
    ),
  }

  // 회사개요(startups 호출값) — 대표자·설립일·소재지·업종.
  const representativeColumn: Column<Investment> = {
    key: 'representative',
    header: '대표자',
    render: (r) => r.startup_representative || '-',
  }
  const foundedColumn: Column<Investment> = {
    key: 'founded_on',
    header: '설립일',
    render: (r) => shortDate(r.startup_founded_on),
  }
  const locationColumn: Column<Investment> = {
    key: 'location',
    header: '소재지',
    render: (r) => r.startup_location || '-',
  }
  const industriesColumn: Column<Investment> = {
    key: 'industries',
    header: '업종',
    render: (r) =>
      r.startup_industries.length ? (
        <span className="flex flex-wrap gap-1">
          {r.startup_industries.map((ind) => (
            <Badge key={ind} tone="info">
              {ind}
            </Badge>
          ))}
        </span>
      ) : (
        '-'
      ),
  }

  const investedAtColumn: Column<Investment> = {
    key: 'invested_at',
    header: '투자일',
    render: (r) => shortDate(r.invested_at),
  }
  // 투자펀드 = 현재 펀드(포트폴리오는 이 펀드로 필터된 목록이라 상수).
  const fundColumn: Column<Investment> = { key: 'fund', header: '투자펀드', render: () => fundName }
  const stageColumn: Column<Investment> = { key: 'stage', header: '라운드', render: (r) => r.stage ?? '-' }
  // 투자방식 = 취득 증권 종류(보통주/CPS/RCPS/CB/BW 등). 라운드와 별개 축.
  const methodColumn: Column<Investment> = {
    key: 'investment_method',
    header: '투자방식',
    render: (r) => (r.investment_method ? <Badge tone="neutral">{r.investment_method}</Badge> : '-'),
  }
  const preColumn: Column<Investment> = {
    key: 'valuation',
    header: 'PRE VALUE',
    align: 'right',
    numeric: true,
    render: (r) => num(r.valuation),
  }
  const postColumn: Column<Investment> = {
    key: 'post_valuation',
    header: 'POST VALUE',
    align: 'right',
    numeric: true,
    render: (r) => num(r.post_valuation),
  }
  const amountColumn: Column<Investment> = {
    key: 'amount',
    header: '집행액',
    align: 'right',
    numeric: true,
    render: (r) => num(r.amount),
  }
  // 딜메이커(전권 담당자) = startup_managers 리드. networks 읽기 권한 없으면 RLS로 '-'.
  const dealmakerColumn: Column<Investment> = {
    key: 'dealmaker',
    header: '딜메이커',
    render: (r) => r.dealmaker_name || '-',
  }
  // 구분 = startups.management_status(포트폴리오는 항상 투자기업).
  const categoryColumn: Column<Investment> = {
    key: 'category',
    header: '구분',
    render: (r) => {
      const label = managementStatusLabel(r.startup_management_status)
      if (!label) return '-'
      const tone: BadgeTone = r.startup_management_status
        ? MANAGEMENT_STATUS_TONE[r.startup_management_status as ManagementStatus] ?? 'neutral'
        : 'neutral'
      return <Badge tone={tone}>{label}</Badge>
    },
  }
  // 관리현황 = startups.pool_status(진행중/보류/종료/제외) 그대로 호출.
  const poolStatusColumn: Column<Investment> = {
    key: 'pool_status',
    header: '관리현황',
    render: (r) => (r.startup_pool_status ? <Badge tone="neutral">{r.startup_pool_status}</Badge> : '-'),
  }

  // 사용자 확정 순서(No.는 DataTable 표준, 좌측 자동). 수정/삭제는 행 클릭 상세 모달에서 처리.
  // …·라운드·투자방식·집행액·투자일·딜메이커
  return [
    startupColumn,
    industriesColumn,
    representativeColumn,
    foundedColumn,
    itemColumn,
    locationColumn,
    categoryColumn,
    poolStatusColumn,
    fundColumn,
    preColumn,
    postColumn,
    stageColumn,
    methodColumn,
    amountColumn,
    investedAtColumn,
    dealmakerColumn,
  ]
}
