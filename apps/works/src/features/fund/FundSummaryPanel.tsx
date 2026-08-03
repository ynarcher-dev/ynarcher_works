import { PanelCard, Skeleton, badgeToneFill, badgeToneText, cn, type BadgeTone } from '@ynarcher/ui'
import { AlertTriangle, CalendarClock, ChevronRight, type LucideIcon } from 'lucide-react'
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
 * 펀드 목록 요약 카드 — 자금 흐름 4단과 조치 알림.
 *
 * 사업 워크스페이스의 진행 현황 카드(ProgramPipeline)와 같은 자리·같은 규격을 쓰되 축이 다르다.
 * 사업은 "어느 단계에 몰려 있나"가 질문이라 건수 분포가 답이지만, 펀드는 애초에 개수가 적어
 * 그 분포가 `1, 0, 0, 0`으로만 찍힌다. 펀드에서 셀 것은 건수가 아니라 돈이고, 그 돈은 이미
 * 한 줄로 흐른다 — 약정 → 출자 → 집행, 그리고 그 옆에 남은 잔액.
 *
 * 잔액만 점선 뒤에 세우는 이유는 그것이 집행의 다음 단계가 아니라 약정에서 갈라진 잔여이기
 * 때문이다. 화살표로 이으면 "집행 → 잔액"으로 읽혀 흐름이 거짓말을 한다(파이프라인의 이탈
 * 칸과 같은 판단).
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
  if (isPending) return <Skeleton className="h-[7.5rem] w-full rounded-radius-lg" />
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
    <PanelCard title="자금 흐름" count={data.fundCount}>
      <div className="flex items-stretch gap-1.5">
        <MoneyTile
          label="약정총액"
          amount={data.totalCommitment}
          caption="비율 기준"
          share={1}
          tone="neutral"
        />
        <FlowArrow />
        <MoneyTile
          label="실출자금액"
          amount={data.paidIn}
          caption={ratioCaption('약정 대비', data.paidIn, data.totalCommitment)}
          share={share(data.paidIn, data.totalCommitment)}
          tone="info"
        />
        <FlowArrow />
        <MoneyTile
          label="집행액"
          amount={data.drawn}
          // 집행률의 분모는 약정이 아니라 출자다 — 약정으로 나누면 미납이 많은 펀드에서
          // 운용역이 일을 안 한 것처럼 보인다. 출자 기록이 없으면 비율을 말하지 않는다.
          caption={ratioCaption('출자 대비', data.drawn, data.paidIn)}
          share={share(data.drawn, data.totalCommitment)}
          tone="success"
        />
        <SplitDivider />
        <MoneyTile
          label="잔액"
          amount={data.balance}
          caption={ratioCaption('약정 대비', data.balance, data.totalCommitment)}
          share={share(data.balance, data.totalCommitment)}
          tone="neutral"
          aside
        />
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

/** 단계와 단계 사이의 진행 방향 표시(파이프라인과 같은 기호·같은 자리). */
function FlowArrow() {
  return <ChevronRight className="size-4 shrink-0 self-center text-gray-400" aria-hidden />
}

/**
 * 흐름과 잔여를 가르는 점선 경계. 화살표를 쓰지 않아 '이어지지 않음'을 형태로 말한다.
 * 화살표와 같은 눈높이(세로 가운데)에 짧게 세운다 — 어긋나면 줄이 끊겨 보인다.
 */
function SplitDivider() {
  return (
    <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden>
      <span className="h-8 border-l border-dashed border-gray-300" />
    </span>
  )
}

/** 분모가 없거나 0이면 비율을 말하지 않는다(0%는 사실을 단정하는 표기다). */
function share(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base <= 0) return null
  return Math.min(1, Math.max(0, value / base))
}

function ratioCaption(basis: string, value: number | null, base: number | null): string {
  const s = share(value, base)
  return s == null ? `${basis} –` : `${basis} ${Math.round(s * 100)}%`
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
  /** null이면 '아직 아무도 안 적음' — 0원과 다른 말이라 값 자리에 –를 세운다. */
  amount: number | null
  caption: string
  /** 약정총액 대비 비율(0~1). 막대 길이의 근거. null이면 트랙만 남긴다. */
  share: number | null
  tone: BadgeTone
  /** 흐름 밖(잔여) 여부. 점선 테두리로 한 단계 물러난다. */
  aside?: boolean
}

/** 금액 타일 — 라벨(위) · 금액(가운데) · 비율 캡션과 막대. 파이프라인 StepTile과 같은 글자 위계. */
function MoneyTile({ label, amount, caption, share, tone, aside }: MoneyTileProps) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-radius-md border px-2.5 py-2 text-left',
        aside ? 'border-dashed border-gray-300 bg-gray-25' : 'border-gray-300 bg-white',
      )}
    >
      <p className={cn('truncate text-caption', aside ? 'text-gray-500' : 'text-gray-700')}>
        {label}
      </p>
      <p className="truncate text-title-sm font-bold tabular-nums text-gray-900">
        {amount == null ? (
          <span className="text-gray-400">–</span>
        ) : (
          <>
            {millionNumber(amount)}
            <span className="ml-0.5 font-normal text-gray-500">백만원</span>
          </>
        )}
      </p>
      <p className="mt-0.5 truncate text-caption text-gray-500">{caption}</p>
      <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <span
          className={cn('block h-full rounded-full', badgeToneFill[tone])}
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
