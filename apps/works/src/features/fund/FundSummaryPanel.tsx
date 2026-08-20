import { CardShell, Skeleton, StatStrip, type StripTile } from '@ynarcher/ui'
import type { FundListFilterState } from '@/features/fund/fundListHooks'
import { useFundListTotals } from '@/features/fund/fundSummaryHooks'

interface FundSummaryPanelProps {
  /** 아래 목록과 같은 모수를 만들기 위한 값들. 하나라도 다르면 카드가 다른 집합을 말한다. */
  keyword: string
  filters: FundListFilterState
  strategy?: 'AC' | 'VC' | 'PE' | null
  mineUserId?: string | null
  /** 목록이 센 건수. 집계의 fund_count와 대조해 조건 드리프트를 잡는다. */
  listTotal?: number
}

/**
 * 펀드 목록 요약 카드 — 약정총액·실출자금액·집행액·잔액 넷의 금액과 비율.
 *
 * 사업 워크스페이스의 진행 현황 카드처럼 목록 위에 앉지만 구조는 훨씬 얇다. 그쪽은 "어느
 * 단계에 몰려 있나"를 답하느라 단계 흐름·묶음·이탈이 필요했지만, 펀드는 애초에 개수가 적어
 * 분포가 `1, 0, 0, 0`으로만 찍힌다. 여기서 답할 것은 하나다 — **지금 이 모수에 돈이 얼마씩
 * 있나.** 그래서 진행 방향 꺾쇠도, 묶음 라벨도, 조치 알림도 두지 않는다(사용자 판단).
 *
 * 네 칸은 같은 층의 네 현황이며 서로 순서가 없다. 비율도 넷 다 **약정총액 하나를 분모로**
 * 쓴다 — 칸마다 분모가 다르면 문구가 서로 다른 것을 재게 되고, 실제로 그렇게 두었더니
 * 한 칸이 0.4%를 말하는 옆에서 다른 칸이 40,000%를 적는 화면이 나왔다.
 *
 * 표기는 공용 지표 띠(`StatStrip`)를 그대로 쓴다(2026-08-20). 한때 이 카드만 테두리 상자 넷에
 * 아이콘과 진행 막대를 얹은 자체 타일을 썼는데, 지표를 상자에 가두면 비교가 아니라 열거로
 * 읽히고, 아이콘과 막대는 라벨·비율 문구가 이미 하는 말을 형태로 한 번 더 하는 것이었다.
 */
export function FundSummaryPanel({
  keyword,
  filters,
  strategy,
  mineUserId,
  listTotal,
}: FundSummaryPanelProps) {
  const { data, isPending } = useFundListTotals(keyword, filters, strategy, mineUserId)

  // 첫 조회 중에는 카드 높이만큼 자리를 잡아 둔다(도착하는 순간 목록이 밀려 내려가지 않게).
  if (isPending) return <Skeleton className="h-[8.5rem] w-full rounded-radius-lg" />
  if (!data) return null

  // 조건이 어긋나면 카드와 목록이 서로 다른 집합을 말한다. 값이 아니라 '일치'를 보는 검사라
  // 시드가 바뀌어도 깨지지 않는다. 운영에서 화면을 막을 일은 아니라 개발 중에만 알린다.
  if (import.meta.env.DEV && listTotal !== undefined && listTotal !== data.fundCount) {
    console.warn(
      `[FUND] 요약 집계와 목록 건수가 어긋납니다(목록 ${listTotal} / 집계 ${data.fundCount}). ` +
        'fundListHooks.ts의 조건과 fund_list_totals RPC 중 한쪽이 드리프트했습니다.',
    )
  }

  const base = data.totalCommitment

  const tiles: StripTile[] = [
    {
      key: 'commitment',
      label: '약정총액',
      value: millionNumber(base),
      unit: '백만원',
      // 나머지 셋의 분모다. 자기 비율은 늘 100%라 말할 것이 없어 그 사실을 대신 적는다.
      note: '기준 100%',
    },
    {
      key: 'paidIn',
      label: '실출자금액',
      value: amountText(data.paidIn),
      unit: '백만원',
      note: ratioText(data.paidIn, base),
    },
    {
      key: 'drawn',
      label: '집행액',
      value: amountText(data.drawn),
      unit: '백만원',
      note: ratioText(data.drawn, base),
    },
    {
      key: 'balance',
      label: '잔액',
      value: amountText(data.balance),
      unit: '백만원',
      note: ratioText(data.balance, base),
    },
  ]

  return (
    /*
      카드 제목('자금 현황 [n]')은 두지 않는다(2026-08-20, 사용자 판단). 네 칸이 각자 라벨로
      무엇을 재는지 말하고 있어 제목이 더할 사실이 없고, 상자 안에 제목을 넣으면 테두리 → 제목
      → 지표로 층이 셋이 되는데 지표 띠는 상자를 걷어내 지표를 앞으로 내보내려고 쓰는 규격이라
      같은 카드 안에서 층을 다시 쌓으면 그 취지가 상쇄된다.

      건수는 아래 목록의 페이저가 같은 모수로 이미 세고 있다.
    */
    <CardShell>
      <StatStrip
        tiles={tiles}
        className="grid grid-cols-2 divide-gray-200 sm:grid-cols-4 sm:divide-x"
      />
    </CardShell>
  )
}

/**
 * 약정총액 대비 비율 문구. 분모가 넷 다 같으므로 문구도 한 형태로 통일한다.
 *
 * 반올림이 사실을 덮는 두 구간은 부등호로 적는다 — 0.4%를 0%로, 99.6%를 100%로 적으면
 * '아직 없음'과 '전부'라는 다른 말이 된다.
 */
function ratioText(value: number | null, base: number): string {
  if (value == null || base <= 0) return '약정 대비 –'
  const ratio = value / base
  const percent = Math.round(ratio * 100)
  if (percent === 0 && ratio > 0) return '약정 대비 <1%'
  if (percent === 100 && ratio < 1) return '약정 대비 >99%'
  return `약정 대비 ${percent.toLocaleString()}%`
}

/** null은 '아직 아무도 안 적음' — 0원과 다른 말이라 값 자리에 –를 세운다. */
function amountText(won: number | null): string {
  return won == null ? '–' : millionNumber(won)
}

/**
 * 백만원 표기의 숫자 부분. 단위 문자열은 지표 띠가 따로 세운다.
 * 단위 규약 자체는 fundListHooks의 formatMillion이 소유한다(목록 표기와 같아야 한다).
 */
function millionNumber(won: number): string {
  return Math.round(won / 1_000_000).toLocaleString()
}
