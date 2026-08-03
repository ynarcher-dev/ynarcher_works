import { Badge } from '@ynarcher/ui'
import { ActivityCard, Dash, type ActivityColumn } from '@/features/management/ActivityCard'
import {
  useEmployeeFunds,
  useEmployeePrograms,
  useEmployeeStartups,
  type ActivityFund,
  type ActivityProgram,
  type ActivityStartup,
  type FundSeat,
  type ProgramLedgerKey,
} from '@/features/management/employeeActivity'
import { formatMillion, fundPeriod } from '@/features/fund/fundListHooks'
import { SectionHeading } from '@/features/startup/SectionHeading'

/**
 * 남는 폭을 전부 흡수하고 넘치면 말줄임하는 서술 열(한 줄 소개·설명).
 * 이 열이 폭을 다 가져가므로 나머지 열은 자기 내용의 최소 폭으로 눌린다 — 그래서 다른 열은
 * 모두 `NOWRAP`을 달아 한 줄로 세운다(안 달면 이름·태그가 글자 단위로 접힌다).
 */
const FILLER = 'w-full max-w-0 truncate'

/** 접히면 안 되는 열(이름·기간·역할·태그). 폭은 필러 열이 알아서 양보한다. */
const NOWRAP = 'whitespace-nowrap'

/** 기간 "YYYY-MM-DD ~ YYYY-MM-DD". 둘 다 없으면 null(빈 값 표기로 넘긴다). */
function period(start: string | null, end: string | null): string | null {
  if (!start && !end) return null
  return `${start ?? '?'} ~ ${end ?? '?'}`
}

/** 서술 열 셀: 말줄임되므로 마우스를 올려 전체를 볼 수 있어야 한다. */
function Text({ value }: { value: string | null | undefined }) {
  if (!value) return <Dash />
  return <span title={value}>{value}</span>
}

/**
 * 분야/사업 태그 열. 최대 3개까지만 늘어놓는다(원장 상한과 같은 수).
 * 줄바꿈하지 않는다 — 접히면 태그 3개가 행 높이를 세 배로 밀어 올려 표가 목록이 아니라
 * 카드 묶음처럼 읽힌다. 폭은 옆의 서술 열이 양보한다.
 */
function Tags({ items }: { items: string[] }) {
  if (items.length === 0) return <Dash />
  return (
    <div className="flex flex-nowrap gap-1">
      {items.slice(0, 3).map((t) => (
        <Badge key={t} tone="neutral">
          {t}
        </Badge>
      ))}
    </div>
  )
}

/** 이 사람이 그 사업에서 가진 자리 + 투입률. 목록의 '담당자' 열을 사람 기준으로 뒤집은 값이다. */
function seatText(r: ActivityProgram): string {
  const seat = r.isPm ? 'PM' : '팀원'
  return r.rate > 0 ? `${seat} (${r.rate}%)` : seat
}

/**
 * 사업 열 구성은 원장별로 두 벌이다. 스키마는 셋 다 같지만 **부르는 이름이 다르다** —
 * AC는 수주해 운영하는 '사업'이고, M&A·PROJECT는 착수해서 끝내는 '프로젝트'다.
 * 분야 태그도 AC만 운용 축으로 쓰므로(어느 분야의 기업을 발굴하는 사업인가) 거기에만 둔다.
 */
const AC_PROGRAM_COLUMNS: ActivityColumn<ActivityProgram>[] = [
  { header: '사업명', primary: true, className: NOWRAP, render: (r) => r.title },
  {
    header: '운영기간',
    className: `${NOWRAP} tabular-nums`,
    render: (r) => period(r.start_date, r.end_date) ?? <Dash />,
  },
  { header: '역할', className: NOWRAP, render: (r) => seatText(r) },
  { header: '분야', className: NOWRAP, render: (r) => <Tags items={r.industries} /> },
  { header: '설명', className: FILLER, render: (r) => <Text value={r.description} /> },
]

const DEAL_PROGRAM_COLUMNS: ActivityColumn<ActivityProgram>[] = [
  { header: '프로젝트명', primary: true, className: NOWRAP, render: (r) => r.title },
  {
    header: '진행기간',
    className: `${NOWRAP} tabular-nums`,
    render: (r) => period(r.start_date, r.end_date) ?? <Dash />,
  },
  { header: '역할', className: NOWRAP, render: (r) => seatText(r) },
  { header: '설명', className: FILLER, render: (r) => <Text value={r.description} /> },
]

/** 사업 카드(AC 운영사업 · M&A · 프로젝트). 워크스페이스와 상세 경로만 갈아 끼운다. */
function ProgramActivityCard({
  title,
  workspace,
  basePath,
  columns,
  userId,
}: {
  title: string
  workspace: ProgramLedgerKey
  basePath: string
  columns: ActivityColumn<ActivityProgram>[]
  userId: string
}) {
  const { data, isLoading } = useEmployeePrograms(workspace, userId)
  return (
    <ActivityCard
      title={title}
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      rowTo={(r) => `${basePath}/${r.id}`}
      workspace={workspace}
      isLoading={isLoading}
      emptyText="담당자로 배정된 건이 없습니다."
    />
  )
}

/** 투자(관리)기업 열 구성. 그 기업이 무엇을 하는 곳인지가 한 줄에 서도록 골랐다. */
const STARTUP_COLUMNS: ActivityColumn<ActivityStartup>[] = [
  { header: '기업명', primary: true, className: NOWRAP, render: (s) => s.name },
  { header: '단계', className: NOWRAP, render: (s) => s.stage || <Dash /> },
  { header: '분야', className: NOWRAP, render: (s) => <Tags items={s.industries} /> },
  { header: '한 줄 소개', className: FILLER, render: (s) => <Text value={s.oneLiner} /> },
]

/** 펀드 자리 표기. 위계 순(대표 → 운용 → 관리)으로 늘어놓아 자리들이 늘 같은 순서로 읽힌다. */
const FUND_SEAT_LABEL: Record<FundSeat, string> = {
  LEAD: '대표펀드매니저',
  OPERATION: '운용인력',
  ADMIN: '관리인력',
}
const FUND_SEAT_ORDER: FundSeat[] = ['LEAD', 'OPERATION', 'ADMIN']

/** 이 사람이 그 펀드에서 가진 자리. 운용·관리를 겸할 수 있어 여러 개가 나올 수 있다. */
function fundSeatText(f: ActivityFund): string {
  return FUND_SEAT_ORDER.filter((s) => f.seats.includes(s))
    .map((s) => FUND_SEAT_LABEL[s])
    .join(' · ')
}

/**
 * 펀드 카드 열 구성. 자리를 카드로 가르지 않고 **'역할' 열로 접는다** — 운용과 관리를 겸한
 * 펀드가 두 카드에 같은 행으로 두 번 서던 문제가 없어지고, 참여 펀드 수를 카드 하나의 건수로
 * 읽을 수 있다. 사업 카드가 PM·팀원을 역할 열로 적는 것과 같은 규칙이다.
 *
 * 다른 표와 달리 남는 폭을 흡수할 서술 열이 없다. 그 몫을 이름에 지우면 펀드명 하나가 표 폭을
 * 다 먹고 기간·금액이 오른쪽 끝으로 밀려, 한 행을 읽는 데 눈이 화면을 가로질러야 한다.
 * 그래서 값 열은 모두 자기 폭으로 세우고 **남는 폭은 맨 끝 빈 열이 받는다** — 오른쪽이 비는
 * 편이 값끼리 멀어지는 것보다 낫다.
 */
const FUND_COLUMNS: ActivityColumn<ActivityFund>[] = [
  { header: '펀드명', primary: true, className: NOWRAP, render: (f) => f.name },
  {
    header: '운용기간',
    className: `${NOWRAP} tabular-nums`,
    render: (f) => fundPeriod(f.operation_start, f.operation_end) ?? <Dash />,
  },
  { header: '역할', className: NOWRAP, render: (f) => fundSeatText(f) || <Dash /> },
  // 금액 단위는 목록(FundListTable)과 같은 백만원으로 맞춘다 — 같은 값이 화면마다 다른 자릿수로
  // 보이면 비교가 서지 않는다.
  { header: '약정총액', align: 'right', className: NOWRAP, render: (f) => formatMillion(f.total_commitment) },
  { header: '', className: 'w-full', render: () => null },
]

/**
 * 임직원 상세 '활동 이력' — 담당자로 배정된 레코드를 도메인별 카드에 데이터 표로 편다.
 *
 * 각 표는 근원 목록 화면의 열 중 사람 단위로 읽히는 것만 골라 담고, 나머지는 행을 눌러 들어간다.
 * 카드마다 5건 단위 미니 페이저를 두므로 활동이 많아도 상세 페이지 길이가 늘지 않는다.
 */
export function EmployeeActivitySection({ userId }: { userId: string }) {
  const { data: startups, isLoading: startupsLoading } = useEmployeeStartups(userId)
  const { data: funds, isLoading: fundsLoading } = useEmployeeFunds(userId)

  return (
    <>
      <SectionHeading title="활동 이력" />

      {/* 담당자 원장이 투자기업에만 채워지므로 카드 이름도 그 범위를 그대로 말한다. */}
      <ActivityCard
        title="투자(관리)기업"
        columns={STARTUP_COLUMNS}
        rows={startups ?? []}
        rowKey={(s) => s.id}
        rowTo={(s) => `/startup/discovered/${s.id}`}
        workspace="startup"
        isLoading={startupsLoading}
        emptyText="담당자로 지정된 투자기업이 없습니다."
      />

      <ProgramActivityCard
        title="운영사업"
        workspace="ac"
        basePath="/ac/programs"
        columns={AC_PROGRAM_COLUMNS}
        userId={userId}
      />
      <ProgramActivityCard
        title="M&A"
        workspace="mna"
        basePath="/mna/programs"
        columns={DEAL_PROGRAM_COLUMNS}
        userId={userId}
      />
      <ProgramActivityCard
        title="프로젝트"
        workspace="project"
        basePath="/project/programs"
        columns={DEAL_PROGRAM_COLUMNS}
        userId={userId}
      />

      <ActivityCard
        title="펀드"
        columns={FUND_COLUMNS}
        rows={funds ?? []}
        rowKey={(f) => f.id}
        rowTo={(f) => `/fund/${f.id}`}
        workspace="fund"
        isLoading={fundsLoading}
        emptyText="배정된 펀드가 없습니다."
      />
    </>
  )
}
