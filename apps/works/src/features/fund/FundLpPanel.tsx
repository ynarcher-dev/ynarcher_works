import {
  Badge,
  Button,
  CardShell,
  DataTable,
  EmptyState,
  ListToolbar,
  type Column,
} from '@ynarcher/ui'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FundLpRosterModal } from '@/features/fund/FundLpRosterModal'
import { FUND_LP_TYPE_LABEL, FUND_LP_TYPE_TONE } from '@/features/fund/fundListHooks'
import type { FundLp } from '@/features/fund/hooks'

/** 카드 안 표의 페이지 크기(포트폴리오 카드와 같은 규격). */
const PAGE_SIZE = 10

// 폭·정렬·수치서식은 열마다의 종류(type)가 정한다(2026-08 디자인 리프레시).
const lpColumns: Column<FundLp>[] = [
  { key: 'name', header: '조합원명', primary: true, type: 'name', render: (r) => r.name },
  {
    key: 'lp_type',
    // 두 어절은 붙여 적지 않는다 — 고정폭 열의 머리글은 공백에서만 접힌다(break-keep).
    header: '조합원 유형',
    type: 'badge',
    render: (r) => (
      <Badge tone={FUND_LP_TYPE_TONE[r.lp_type] ?? 'neutral'}>
        {FUND_LP_TYPE_LABEL[r.lp_type] ?? r.lp_type}
      </Badge>
    ),
  },
  {
    key: 'commitment_amount',
    header: '약정액',
    type: 'money',
    render: (r) => r.commitment_amount.toLocaleString(),
  },
  {
    // 지분율은 약정액 ÷ 약정총액의 파생값(sync_fund_lp_ownership 트리거).
    key: 'ownership_pct',
    header: '지분율',
    type: 'count',
    render: (r) => (r.ownership_pct == null ? '-' : `${r.ownership_pct}%`),
  },
  {
    // 납입액·납입률은 캐피탈 콜에서 집계된 파생값(fund_lps.paid_amount).
    key: 'paid_amount',
    header: '납입액',
    type: 'money',
    render: (r) => r.paid_amount.toLocaleString(),
  },
  {
    key: 'paid_pct',
    header: '납입률',
    type: 'count',
    render: (r) =>
      r.commitment_amount > 0
        ? `${Math.round((r.paid_amount / r.commitment_amount) * 100)}%`
        : '-',
  },
  {
    key: 'contact',
    header: '담당자',
    type: 'person',
    render: (r) => r.contact?.manager ?? '-',
  },
]

/**
 * 출자자(LP) 탭 — 조합원 원장의 유일한 입력 표면.
 *
 * 약정액은 캐스케이드의 천장이라 여기서만 입력받는다(§2.2). 지분율은 약정액에서, 납입액은
 * 캐피탈 콜에서 파생되므로 표에서 읽기 전용으로만 보여준다. 등록·수정·삭제는 모두 명부 모달
 * 한 곳에서 하고, 표의 행을 눌러도 같은 모달이 열린다.
 *
 * 지분율 도넛은 두지 않는다 — 비율은 표의 '지분율' 열이 이미 정확한 숫자로 말하고, 조합원이
 * 한둘이면 도넛이 100%/0% 한 덩어리가 되어 아무것도 보태지 못한다(§2.2 "표만으로 충분").
 * (근거: docs_planning/3_5_workspace_fund.md §2.2)
 *
 * 검색·페이저는 원장 목록과 같은 규격이다 — 카드 안에 있어도 이 탭의 작업 대상이라 표 아래가
 * 다른 화면과 달라 보이면 안 된다. 그래서 **한 페이지뿐이어도 번호줄 페이저를 세운다**(미니
 * 페이저는 한 페이지면 사라진다). 좌측 건수는 검색이 걸리면 '반영 수 / 전체 수'로 답한다.
 */
export function FundLpPanel({ fundId, lps }: { fundId: string; lps: FundLp[] }) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)

  const openLabel = lps.length > 0 ? '명부 편집' : '출자자 등록'

  // 검색은 조합원명 부분일치 한 축(placeholder가 답하는 그 축이다).
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (kw === '') return lps
    return lps.filter((r) => r.name.toLowerCase().includes(kw))
  }, [lps, keyword])

  // 검색·삭제로 목록이 줄어 보고 있던 페이지가 사라지면 마지막 페이지로 당긴다.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <>
      <CardShell>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-body font-semibold text-gray-700">조합원 구성</h4>
            <Button density="card" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              {openLabel}
            </Button>
          </div>

          {lps.length > 0 ? (
            <>
              <ListToolbar
                keyword={keyword}
                onKeywordChange={(v) => {
                  setKeyword(v)
                  setPage(0)
                }}
                searchPlaceholder="조합원명으로 검색"
                dense
              />
              {/* 표는 읽기 전용 — 편집은 명부 모달 한 곳에서만 한다(행 클릭도 같은 모달을 연다). */}
              <DataTable
                columns={lpColumns}
                rows={rows}
                rowKey={(r) => r.id}
                standardColumns={false}
                onRowClick={() => setOpen(true)}
                emptyText="검색 결과가 없습니다."
                pagination={{
                  page: safePage,
                  pageSize: PAGE_SIZE,
                  total: filtered.length,
                  // 검색이 걸렸을 때만 '반영 수 / 전체 수'로 답한다(안 걸렸으면 둘이 같은 수다).
                  totalAll: keyword.trim() === '' ? undefined : lps.length,
                  onChange: setPage,
                }}
              />
            </>
          ) : (
            <EmptyState
              title="등록된 출자자(LP)가 없습니다."
              description="조합원과 약정액을 먼저 등록하면 캐피탈 콜에서 차수별 요청액을 배정할 수 있습니다."
              action={<Button onClick={() => setOpen(true)}>출자자 등록</Button>}
            />
          )}
        </div>
      </CardShell>

      <FundLpRosterModal fundId={fundId} open={open} onClose={() => setOpen(false)} lps={lps} />
    </>
  )
}
