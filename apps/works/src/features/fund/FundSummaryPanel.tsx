import { PanelCard, Skeleton, badgeToneFill, badgeToneText, cn, type BadgeTone } from '@ynarcher/ui'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { FundListFilterState } from '@/features/fund/fundListHooks'
import { useFundListTotals, type FundListTotals } from '@/features/fund/fundSummaryHooks'

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
 * 펀드 목록 요약 카드 — 자금 현황 4종과 조치 알림.
 *
 * 사업 워크스페이스의 진행 현황 카드(ProgramPipeline)와 같은 자리·같은 타일 규격(아이콘+라벨 /
 * 값 / 편중 막대 3층)을 쓰되 축이 다르다. 사업은 "어느 단계에 몰려 있나"가 질문이라 건수 분포가
 * 답이지만, 펀드는 애초에 개수가 적어 그 분포가 `1, 0, 0, 0`으로만 찍힌다. 펀드에서 셀 것은
 * 건수가 아니라 돈이다.
 *
 * 다만 규격만 빌려 오고 진행 방향 꺾쇠는 쓰지 않는다 — 이 넷은 거쳐 가는 단계가 아니라 지금
 * 동시에 참인 네 가지 현황이다. 한 펀드의 약정·출자·집행은 서로를 밀어내며 옮겨 가지 않고
 * 늘 함께 있다. 꺾쇠를 두면 "출자가 끝나야 집행"처럼 읽혀 없는 순서를 만든다.
 *
 * 잔액만 점선 뒤에 세우는 이유는 그것이 나머지 셋과 같은 층의 측정값이 아니라 약정에서 집행을
 * 뺀 파생값이기 때문이다(파이프라인이 이탈 칸을 가르는 것과 같은 장치).
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
  // AC 진행 현황과 같은 구조(제목 + 묶음 라벨 줄 + 3층 타일)라 같은 높이를 쓴다.
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

  const alerts = alertTiles(data)

  return (
    <PanelCard title="자금 현황" count={data.fundCount}>
      {/* 묶음 라벨. 아래 타일 줄과 같은 flex 비율을 써서 열이 정확히 겹친다(AC와 같은 규약).
          점선이 무엇을 가르는지 여기서 이름 붙는다 — 이름이 없으면 그 경계가 그냥 여백으로 읽힌다.
          묶음 라벨은 자기가 이끄는 타일 라벨(gray-700)보다 연해지지 않아야 한다. */}
      <div className="flex gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2" style={{ flexGrow: 3 }}>
          <span className="shrink-0 text-caption font-medium text-gray-800">조성과 집행</span>
          <span className="flex-1 border-t border-gray-200" aria-hidden />
        </div>
        <span className="size-4 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 items-center gap-2" style={{ flexGrow: 1 }}>
          <span className="shrink-0 text-caption font-medium text-gray-800">잔여</span>
          <span className="flex-1 border-t border-gray-200" aria-hidden />
        </div>
      </div>

      <div className="mt-1.5 flex items-stretch gap-1.5">
        <div className="flex min-w-0 flex-1 items-stretch gap-1.5" style={{ flexGrow: 3 }}>
          <MoneyTile
            label="약정총액"
            icon={Wallet}
            amount={data.totalCommitment}
            // 나머지 셋의 분모라 자기 비율은 말할 것이 없다. 막대가 꽉 찬 이유를 대신 적는다.
            ratio="비율 기준"
            share={1}
            tone="neutral"
            baseline
          />
          <MoneyTile
            label="실출자금액"
            icon={ArrowDownToLine}
            amount={data.paidIn}
            ratio={ratioText('약정 대비', data.paidIn, data.totalCommitment)}
            share={share(data.paidIn, data.totalCommitment)}
            tone="info"
          />
          <MoneyTile
            label="집행액"
            icon={ArrowUpFromLine}
            amount={data.drawn}
            // 집행률의 분모는 약정이 아니라 출자다 — 약정으로 나누면 미납이 많은 펀드에서
            // 운용역이 일을 안 한 것처럼 보인다. 출자 기록이 없으면 비율을 말하지 않는다.
            ratio={ratioText('출자 대비', data.drawn, data.paidIn)}
            // 막대만은 약정을 기준으로 그린다 — 네 칸의 막대가 같은 자로 재야 서로 비교된다.
            share={share(data.drawn, data.totalCommitment)}
            tone="success"
          />
        </div>
        <SplitDivider />
        <div className="flex min-w-0 flex-1 items-stretch gap-1.5" style={{ flexGrow: 1 }}>
          <MoneyTile
            label="잔액"
            icon={PiggyBank}
            amount={data.balance}
            ratio={ratioText('약정 대비', data.balance, data.totalCommitment)}
            share={share(data.balance, data.totalCommitment)}
            tone="neutral"
            aside
          />
        </div>
      </div>

      {/* 조치 알림 — 하나도 없으면 줄 자체를 그리지 않는다. 늘 있는 현황(위)과 달리
          이쪽은 '지금 할 일이 있다'는 사실 자체가 정보라, 0을 늘어놓으면 그 사실이 묽어진다. */}
      {alerts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-gray-200 pt-2">
          {alerts.map(({ key, ...tile }) => (
            <AlertTile key={key} {...tile} />
          ))}
        </div>
      )}
    </PanelCard>
  )
}

/**
 * 측정값 셋과 파생값(잔액)을 가르는 점선 경계.
 * 타일 전체 높이로 늘리지 않고 세로 가운데에 짧게 세운다 — 칸 사이에 벽을 세우는 게 아니라
 * 여기서 층이 갈린다는 표시라, 길면 네 칸이 두 묶음으로 끊겨 보인다.
 */
function SplitDivider() {
  return (
    <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden>
      <span className="h-8 border-l border-dashed border-gray-300" />
    </span>
  )
}

/**
 * 막대 길이(0~1). 트랙을 넘을 수 없어 여기서만 상한을 건다.
 * 분모가 없거나 0이면 그릴 근거가 없다 — 0으로 채우지 않고 트랙만 남긴다.
 */
function share(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base <= 0) return null
  return Math.min(1, Math.max(0, value / base))
}

/**
 * 비율 표기. 막대와 달리 상한을 걸지 않는다 — 100%를 넘는 비율(실출자보다 큰 집행액)은
 * 잘라 낼 값이 아니라 드러내야 할 이상 신호다. 막대 상한에 맞춰 100%로 적으면 화면이
 * '정상적으로 다 썼다'고 거짓말을 한다.
 *
 * 반올림이 사실을 덮는 두 구간은 부등호로 적는다 — 0.4%를 0%로, 99.6%를 100%로 적으면
 * '아직 없음'과 '전부'라는 다른 말이 된다.
 */
function ratioText(basis: string, value: number | null, base: number | null): string {
  if (value == null || base == null || base <= 0) return `${basis} –`
  const ratio = value / base
  const percent = Math.round(ratio * 100)
  if (percent === 0 && ratio > 0) return `${basis} <1%`
  if (percent === 100 && ratio < 1) return `${basis} >99%`
  return `${basis} ${percent.toLocaleString()}%`
}

/**
 * 백만원 표기의 숫자 부분. 단위(백만원)는 타일이 따로 세워 크기를 같게 두고 굵기·색으로만
 * 물린다 — 한 줄 안에서 크기를 가르면 숫자와 단위가 서로 다른 층으로 읽힌다.
 * 단위 규약 자체는 fundListHooks의 formatMillion이 소유한다(목록 표기와 같아야 한다).
 */
function millionNumber(won: number): string {
  return Math.round(won / 1_000_000).toLocaleString()
}

interface MoneyTileProps {
  label: string
  /** 라벨 앞에 서는 글리프. 무엇을 재는 돈인지를 형태로 말한다(파이프라인 StepTile과 같은 자리). */
  icon: LucideIcon
  /** null이면 '아직 아무도 안 적음' — 0원과 다른 말이라 값 자리에 –를 세운다. */
  amount: number | null
  /** 라벨 줄 오른쪽 끝에 붙는 비율 문구. */
  ratio: string
  /** 약정총액 대비 비율(0~1). 막대 길이의 근거. null이면 트랙만 남긴다. */
  share: number | null
  tone: BadgeTone
  /** 측정값 밖(파생) 여부. 점선 테두리로 한 단계 물러난다. */
  aside?: boolean
  /**
   * 나머지 칸이 자기를 기준으로 재는 칸(약정총액). 막대가 구조적으로 늘 100%라 재는 값이
   * 아니라 눈금이다 — 톤 색으로 꽉 채우면 아무 말도 하지 않는 굵은 밑줄만 남고, 실제로
   * 뭔가를 말하는 옆 칸의 막대보다 눈에 먼저 든다.
   */
  baseline?: boolean
}

/**
 * 금액 타일 — 라벨(위) · 금액(가운데) · 막대. 파이프라인 StepTile과 같은 3층 규격이라
 * 같은 자리에 놓았을 때 카드 높이가 어긋나지 않는다.
 *
 * 비율을 별도 줄로 내리지 않고 라벨 줄 끝에 붙인 것도 그래서다 — 네 번째 층을 만들면 이
 * 카드만 사업 진행 현황보다 높아진다. 라벨과 같은 크기를 쓰고 색으로만 물러나게 한다
 * (한 줄 안에서 크기를 갈라 위계를 만들지 않는다).
 */
function MoneyTile({
  label,
  icon: Icon,
  amount,
  ratio,
  share,
  tone,
  aside,
  baseline,
}: MoneyTileProps) {
  return (
    <div
      title={`${label} ${amount == null ? '미입력' : `${millionNumber(amount)}백만원`} · ${ratio}`}
      className={cn(
        'min-w-0 flex-1 rounded-radius-md border px-2.5 py-2 text-left',
        aside ? 'border-dashed border-gray-300 bg-gray-25' : 'border-gray-300 bg-white',
      )}
    >
      {/* 아이콘 색은 언제나 타일의 톤이다(막대와 같은 표) — 값이 비어 있어도 바꾸지 않는다.
          아이콘이 답하는 것은 '무엇을 재는가'이지 '지금 얼마인가'가 아니다. */}
      {/* 비율은 라벨 오른쪽 끝이 아니라 라벨 바로 뒤에 붙인다 — 칸이 넓어지면 양끝 정렬은
          두 섬으로 갈려 눈이 두 번 움직이고, AC의 왼쪽 뭉침과도 어긋난다. 라벨의 수식어처럼
          같은 크기로 이어 두고 색으로만 물러나게 한다. */}
      <p
        className={cn(
          'flex items-center gap-1 text-caption',
          aside ? 'text-gray-500' : 'text-gray-700',
        )}
      >
        <Icon className={cn('size-3.5 shrink-0', badgeToneText[tone])} aria-hidden />
        <span className="truncate">{label}</span>
        <span className="truncate tabular-nums text-gray-500">{ratio}</span>
      </p>
      <p className="truncate text-title-sm font-bold tabular-nums text-gray-900">
        {amount == null ? (
          <span className="text-gray-400">–</span>
        ) : (
          <>
            {millionNumber(amount)}
            {/* 단위는 크기를 낮추지 않고 굵기·색으로만 물린다(파이프라인의 '건'과 같은 처리). */}
            <span className="ml-0.5 font-normal text-gray-500">백만원</span>
          </>
        )}
      </p>
      <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <span
          className={cn('block h-full rounded-full', baseline ? 'bg-gray-200' : badgeToneFill[tone])}
          style={{ width: `${Math.round((share ?? 0) * 100)}%` }}
        />
      </span>
    </div>
  )
}

interface AlertTileSpec {
  key: string
  label: string
  value: string
  icon: LucideIcon
  tone: BadgeTone
}

/** 값이 있는 알림만 골라 낸다. 0건은 타일을 만들지 않는다. */
function alertTiles(data: FundListTotals): AlertTileSpec[] {
  const tiles: AlertTileSpec[] = []
  if (data.overdueCount > 0)
    tiles.push({
      key: 'overdue',
      label: '연체 캐피탈 콜',
      // 건수와 미납액을 함께 적는다 — 한 건이라도 금액이 크면 순서가 달라진다.
      value: `${data.overdueCount}건 · ${millionNumber(data.overdueAmount)}백만원 미납`,
      icon: AlertTriangle,
      tone: 'danger',
    })
  if (data.expiringCount > 0)
    tiles.push({
      key: 'expiring',
      label: '존속기간 만료 임박',
      value: `${data.expiringCount}건 · 1년 내`,
      icon: CalendarClock,
      tone: 'warning',
    })
  return tiles
}

/** 알림 타일 — 한 줄(아이콘 + 라벨 + 값). 금액 타일과 달리 세로로 쌓지 않는다(줄 하나로 읽힌다). */
function AlertTile({ label, value, icon: Icon, tone }: Omit<AlertTileSpec, 'key'>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-radius-md border border-gray-300 bg-white px-2.5 py-1.5">
      <Icon className={cn('size-3.5 shrink-0', badgeToneText[tone])} aria-hidden />
      <span className="text-caption text-gray-700">{label}</span>
      <span className="truncate text-caption font-semibold tabular-nums text-gray-900">{value}</span>
    </span>
  )
}
