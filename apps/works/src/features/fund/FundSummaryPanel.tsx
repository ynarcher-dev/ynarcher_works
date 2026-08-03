import { PanelCard, Skeleton, badgeToneFill, badgeToneText, cn, type BadgeTone } from '@ynarcher/ui'
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank, Wallet, type LucideIcon } from 'lucide-react'
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
 * 쓴다 — 칸마다 분모가 다르면 캡션과 막대가 서로 다른 것을 재게 되고(막대는 늘 약정 기준이다),
 * 실제로 그렇게 두었더니 막대가 0.4%를 그리는 옆에서 캡션이 40,000%를 적는 화면이 나왔다.
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
  if (isPending) return <Skeleton className="h-[10.5rem] w-full rounded-radius-lg" />
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

  return (
    <PanelCard title="자금 현황" count={data.fundCount}>
      {/* 칸 사이는 타일 안쪽 여백(10px)보다 넓어야 네 상자가 각각으로 읽힌다 —
          6px에서는 칸과 칸 사이가 글자와 테두리 사이보다 좁아 한 덩어리로 뭉쳐 보였다. */}
      <div className="flex items-stretch gap-4">
        <MoneyTile
          label="약정총액"
          icon={Wallet}
          amount={base}
          // 나머지 셋의 분모다. 자기 비율은 늘 100%라 말할 것이 없어 그 사실을 대신 적는다.
          ratio="기준 100%"
          share={1}
          tone="neutral"
          baseline
        />
        <MoneyTile
          label="실출자금액"
          icon={ArrowDownToLine}
          amount={data.paidIn}
          ratio={ratioText(data.paidIn, base)}
          share={share(data.paidIn, base)}
          tone="info"
        />
        <MoneyTile
          label="집행액"
          icon={ArrowUpFromLine}
          amount={data.drawn}
          ratio={ratioText(data.drawn, base)}
          share={share(data.drawn, base)}
          tone="success"
        />
        <MoneyTile
          label="잔액"
          icon={PiggyBank}
          amount={data.balance}
          ratio={ratioText(data.balance, base)}
          share={share(data.balance, base)}
          tone="neutral"
        />
      </div>
    </PanelCard>
  )
}

/**
 * 막대 길이(0~1). 트랙을 넘을 수 없어 여기서만 상한을 건다.
 * 분모가 없거나 0이면 그릴 근거가 없다 — 0으로 채우지 않고 트랙만 남긴다.
 */
function share(value: number | null, base: number): number | null {
  if (value == null || base <= 0) return null
  return Math.min(1, Math.max(0, value / base))
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

/**
 * 백만원 표기의 숫자 부분. 단위 문자열은 타일이 따로 세워 크기를 같게 두고 굵기·색으로만
 * 물린다 — 한 줄 안에서 크기를 가르면 숫자와 단위가 서로 다른 층으로 읽힌다.
 * 단위 규약 자체는 fundListHooks의 formatMillion이 소유한다(목록 표기와 같아야 한다).
 */
function millionNumber(won: number): string {
  return Math.round(won / 1_000_000).toLocaleString()
}

interface MoneyTileProps {
  label: string
  /** 라벨 앞에 서는 글리프. 무엇을 재는 돈인지를 형태로 말한다. */
  icon: LucideIcon
  /** null이면 '아직 아무도 안 적음' — 0원과 다른 말이라 값 자리에 –를 세운다. */
  amount: number | null
  ratio: string
  /** 약정총액 대비 비율(0~1). 막대 길이의 근거. null이면 트랙만 남긴다. */
  share: number | null
  tone: BadgeTone
  /**
   * 나머지 칸이 자기를 기준으로 재는 칸(약정총액). 막대가 구조적으로 늘 100%라 재는 값이
   * 아니라 눈금이다 — 톤 색으로 꽉 채우면 아무 말도 하지 않는 굵은 밑줄만 남고, 실제로
   * 뭔가를 말하는 옆 칸의 막대보다 눈에 먼저 든다.
   */
  baseline?: boolean
}

/**
 * 금액 타일 — 라벨 / 금액 / 비율 / 막대 4층.
 *
 * 라벨·금액·비율에 각자 한 줄을 준다. 종전에는 비율을 라벨 줄에 얹어 3층으로 눌렀는데,
 * 칸이 넓어(≈320px) 라벨과 비율이 한 줄에서 붙거나 양끝으로 갈려 둘 다 읽기 나빴다.
 * 이 카드는 층이 하나 늘어도 될 만큼 얇다(묶음 라벨·알림 줄이 없다).
 */
function MoneyTile({ label, icon: Icon, amount, ratio, share, tone, baseline }: MoneyTileProps) {
  return (
    <div className="min-w-0 flex-1 rounded-radius-md border border-gray-300 bg-white px-3 py-2.5 text-left">
      {/* 아이콘 색은 언제나 타일의 톤이다(막대와 같은 표) — 값이 비어 있어도 바꾸지 않는다.
          아이콘이 답하는 것은 '무엇을 재는가'이지 '지금 얼마인가'가 아니다. */}
      <p className="flex items-center gap-1 text-caption text-gray-700">
        <Icon className={cn('size-3.5 shrink-0', badgeToneText[tone])} aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate text-title-sm font-bold tabular-nums text-gray-900">
        {amount == null ? (
          <span className="text-gray-400">–</span>
        ) : (
          <>
            {millionNumber(amount)}
            {/* 단위는 숫자보다 한 단 작게(20 → 14px) 둔다. 디자인 규약의 기본은 '한 줄 안에서
                크기를 갈라 위계를 만들지 않는다'이지만, 여기서 크게 읽혀야 하는 것은 자릿수이고
                '백만원'은 네 칸에 똑같이 반복되는 고정 문자열이라 같은 크기로 두면 숫자만큼
                자리를 먹는다(50,000보다 백만원이 길다). 사용자 판단으로 예외를 둔다. */}
            <span className="ml-1 text-body font-normal text-gray-500">백만원</span>
          </>
        )}
      </p>
      <p className="mt-0.5 truncate text-caption tabular-nums text-gray-500">{ratio}</p>
      <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <span
          className={cn('block h-full rounded-full', baseline ? 'bg-gray-200' : badgeToneFill[tone])}
          style={{ width: `${Math.round((share ?? 0) * 100)}%` }}
        />
      </span>
    </div>
  )
}
