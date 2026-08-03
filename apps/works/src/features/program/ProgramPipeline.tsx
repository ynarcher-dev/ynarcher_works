import {
  PanelCard,
  Skeleton,
  TextAction,
  badgeToneFill,
  badgeToneText,
  cn,
  type BadgeTone,
} from '@ynarcher/ui'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Fragment } from 'react'
import {
  PROGRAM_STATUS_ICON,
  PROGRAM_STATUS_LABEL,
  PROGRAM_STATUS_TONE,
  PROGRAM_UNKNOWN_STATUS_ICON,
  programFlowGroups,
} from '@/features/program/config'
import { useProgramStatusCounts } from '@/features/program/programsPoolHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

interface ProgramPipelineProps {
  /** 집계 스코프. 목록과 같은 값을 받아 같은 모수를 본다. */
  mineUserId: string | null
  /** 목록에 걸린 상태 필터. 여기서는 '선택된 단계'로 표시된다. */
  selectedStatuses: string[]
  /** 단계 클릭 — 해당 상태를 목록 필터에서 켜고 끈다. */
  onToggleStatus: (status: string) => void
  /** 상태 필터 전체 해제. */
  onClearStatuses: () => void
}

/** 한 칸(단계 또는 이탈 상태). `status`가 없으면 토글 대상이 아니다(표시 전용). */
interface FlowStep {
  key: string
  label: string
  count: number
  status: string | null
  /** 상태 배지와 같은 톤. 막대·아이콘 색이 목록의 상태 배지와 어긋나지 않게 한다. */
  tone: BadgeTone
  /** 그 단계에서 무엇을 하는지 형태로 말하는 글리프(config.ts가 소유). */
  icon: LucideIcon
}

/** 한 묶음(제안 단계 · 운영 단계). 주 경로 `steps` 뒤에 점선으로 갈린 `exits`가 붙는다. */
interface FlowGroup {
  key: string
  label: string
  steps: FlowStep[]
  exits: FlowStep[]
}

/**
 * 사업 진행 현황 프로세스 뷰(AC/M&A/PROJECT 공용).
 *
 * 목록 위에서 "내 사업이 지금 어느 단계에 몰려 있나"에 한눈에 답하고, 단계를 누르면 그대로
 * 아래 목록의 상태 필터가 된다 — 현황을 읽는 눈과 목록을 좁히는 손을 같은 자리에 둔다.
 *
 * 흐름은 수명주기(config.ts)를 그대로 편 것이라 여기서 단계를 새로 정의하지 않는다 —
 * 제안 단계를 쓰지 않는 워크스페이스(M&A·PROJECT)에서는 운영 4단계 한 줄만 그려진다.
 * 이탈(미선정·취소)은 같은 줄 끝에 나란히 두되 점선으로 가른다 — 아래로 내리면 눈이 두 번
 * 움직이고, 실선 화살표로 이으면 "선정 → 미선정"처럼 읽혀 흐름이 거짓말을 한다.
 * 이탈끼리는 서로 이어지지 않으므로(각자 다른 지점에서 빠진다) 화살표 없이 병렬로 놓는다.
 */
export function ProgramPipeline({
  mineUserId,
  selectedStatuses,
  onToggleStatus,
  onClearStatuses,
}: ProgramPipelineProps) {
  const config = useProgramWorkspace()
  const { data, isPending } = useProgramStatusCounts(mineUserId)

  // 첫 조회 중에는 카드 높이만큼 자리를 잡아 둔다(도착하는 순간 목록이 밀려 내려가지 않게).
  if (isPending) return <Skeleton className="h-[8.5rem] w-full rounded-radius-lg" />
  // 스코프에 사업이 하나도 없으면 빈 프로세스 줄을 그리지 않는다 — 목록의 빈 상태가 이미 답한다.
  if (!data || data.total === 0) return null

  const countOf = (status: string) => data.byStatus[status] ?? 0
  const stepOf = (status: string): FlowStep => ({
    key: status,
    label: PROGRAM_STATUS_LABEL[status] ?? status,
    count: countOf(status),
    status,
    tone: PROGRAM_STATUS_TONE[status] ?? 'neutral',
    icon: PROGRAM_STATUS_ICON[status] ?? PROGRAM_UNKNOWN_STATUS_ICON,
  })

  const groups: FlowGroup[] = programFlowGroups(config.hasProposalStage).map((g) => ({
    key: g.stage,
    label: g.label,
    steps: g.statuses.map(stepOf),
    exits: [
      ...g.exits.map(stepOf),
      // 구 상태값(모집·심사 등) 잔여분. 어느 단계 값도 아니라 토글 대상이 아니며,
      // programStage()가 구 상태값을 운영으로 보므로 운영 단계 끝에 붙인다.
      ...(g.stage === 'OPERATION' && data.other > 0
        ? [
            {
              key: 'OTHER',
              label: '수명주기 밖',
              count: data.other,
              status: null,
              tone: 'neutral' as const,
              icon: PROGRAM_UNKNOWN_STATUS_ICON,
            },
          ]
        : []),
    ],
  }))

  // 막대 기준선은 전체가 아니라 주 경로에서 가장 많은 단계다. 전체로 나누면 여러 단계로 흩어진
  // 막대가 모두 짧아져 어디에 몰렸는지 보이지 않는다 — 이 막대가 답할 것은 비율이 아니라 편중이다.
  const peak = Math.max(1, ...groups.flatMap((g) => g.steps.map((s) => s.count)))

  /** 칸 하나. 주 경로와 이탈이 같은 규격을 공유해야 한 줄에서 높이가 어긋나지 않는다. */
  const tile = ({ label, count, status, tone, icon }: FlowStep, exit = false) => (
    <StepTile
      label={label}
      count={count}
      tone={tone}
      icon={icon}
      share={Math.min(1, count / peak)}
      total={data.total}
      noun={config.entityNoun}
      exit={exit}
      active={status !== null && selectedStatuses.includes(status)}
      onClick={status ? () => onToggleStatus(status) : undefined}
    />
  )

  return (
    <PanelCard
      title="진행 현황"
      count={data.total}
      action={
        selectedStatuses.length > 0 ? (
          <TextAction onClick={onClearStatuses}>단계 선택 해제</TextAction>
        ) : null
      }
    >
      {/* 묶음 라벨. 아래 단계 줄과 같은 flex 비율을 써서 열이 정확히 겹친다.
          묶음이 하나뿐이면(제안 단계를 쓰지 않는 워크스페이스) 라벨 줄을 아예 그리지 않는다 —
          가를 대상이 없는 구분선은 카드 제목이 이미 한 말을 한 번 더 하는 것뿐이다. */}
      {groups.length > 1 && (
        <div className="flex gap-1.5">
          {groups.map((group, gi) => (
            <Fragment key={group.key}>
              {gi > 0 && <span className="size-4 shrink-0" aria-hidden />}
              <div
                className="flex min-w-0 flex-1 items-center gap-2"
                style={{ flexGrow: group.steps.length + group.exits.length }}
              >
                {/* 묶음 라벨은 자기가 이끄는 칸 라벨(gray-700)보다 연해지지 않아야 한다 —
                    연하면 어디가 묶음의 시작인지 알려주지 못한다. */}
                <span className="shrink-0 text-caption font-medium text-gray-800">
                  {group.label}
                </span>
                <span className="flex-1 border-t border-gray-200" aria-hidden />
              </div>
            </Fragment>
          ))}
        </div>
      )}

      {/* 단계 줄 — 주 경로는 화살표로 잇고, 그 단계의 이탈은 점선 경계 뒤에 나란히 세운다. */}
      <div className={cn('flex items-stretch gap-1.5', groups.length > 1 && 'mt-1.5')}>
        {groups.map((group, gi) => (
          <Fragment key={group.key}>
            {gi > 0 && <FlowArrow />}
            <div
              className="flex min-w-0 flex-1 items-stretch gap-1.5"
              style={{ flexGrow: group.steps.length + group.exits.length }}
            >
              {group.steps.map((step, si) => (
                <Fragment key={step.key}>
                  {si > 0 && <FlowArrow />}
                  {tile(step)}
                </Fragment>
              ))}
              {group.exits.length > 0 && <ExitDivider />}
              {group.exits.map((step) => (
                <Fragment key={step.key}>{tile(step, true)}</Fragment>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </PanelCard>
  )
}

/** 단계와 단계 사이의 진행 방향 표시. */
function FlowArrow() {
  return <ChevronRight className="size-4 shrink-0 self-center text-gray-400" aria-hidden />
}

/**
 * 주 경로와 이탈을 가르는 점선 경계. 화살표를 쓰지 않아 '이어지지 않음'을 형태로 말한다.
 * 높이를 칸 전체로 늘리지 않고 화살표와 같은 자리(세로 가운데)에 짧게 세운다 —
 * 같은 줄에서 화살표와 번갈아 나오는 기호라 눈높이가 어긋나면 줄이 끊겨 보인다.
 */
function ExitDivider() {
  return (
    <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden>
      <span className="h-8 border-l border-dashed border-gray-300" />
    </span>
  )
}

interface StepTileProps {
  label: string
  count: number
  /** 목록 상태 배지와 같은 톤. 막대·아이콘 색의 근거. */
  tone: BadgeTone
  /** 라벨 앞에 서는 단계 글리프. */
  icon: LucideIcon
  /** 최다 단계 대비 비율(0~1). 막대 길이의 근거. */
  share: number
  total: number
  noun: string
  /** 주 경로 밖(이탈) 여부. 테두리를 점선으로 바꾸고 한 단계 물러나게 한다. */
  exit: boolean
  active: boolean
  /** 미지정이면 토글할 수 없는 표시 전용 칸이다. */
  onClick?: () => void
}

/**
 * 단계 타일 — 라벨(위) · 건수(아래) · 편중 막대. 상태 타일(StatTileGrid)과 같은 글자 위계를
 * 따르되, 선택 상태와 편중 막대가 더해져 별도 컴포넌트로 둔다.
 * 이탈 타일도 같은 규격을 쓴다 — 한 줄에 나란히 서므로 높이가 어긋나면 안 된다.
 */
function StepTile({
  label,
  count,
  tone,
  icon: Icon,
  share,
  total,
  noun,
  exit,
  active,
  onClick,
}: StepTileProps) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      title={`${label} ${count}건 · 전체 ${noun}의 ${percent}%`}
      className={cn(
        'min-w-0 flex-1 rounded-radius-md border px-2.5 py-2 text-left transition-colors duration-fast',
        exit && 'border-dashed',
        active
          ? 'border-brand bg-brand-25'
          : exit
            ? 'border-gray-300 bg-gray-25'
            : 'border-gray-300 bg-white',
        onClick && !active && 'hover:border-gray-400 hover:bg-gray-50',
        !onClick && 'cursor-default',
      )}
    >
      {/* 주 경로는 라벨·건수를 모두 진하게 세운다 — 0건이라고 흐려 두면 흐름 전체가 회색으로
          가라앉아 '빈 단계'가 아니라 '읽을 것 없음'으로 보인다. 비어 있음은 아래 막대가 답한다.
          이탈만 한 단계 물러난다(점선 테두리와 함께 주 경로 밖임을 색으로도 말한다). */}
      {/* 아이콘은 라벨과 한 이름표로 읽히도록 같은 줄에 붙인다 — 줄을 따로 주면 칸이 세 층에서
          네 층이 되어 일곱 칸이 나란히 선 줄 전체가 높아진다.
          색은 상태 톤을 쓴다(목록 배지·아래 막대와 같은 표). 0건이면 막대가 비어 색이 사라지는데,
          아이콘이 톤을 들고 있으면 빈 단계도 어느 단계인지 색으로 남는다.
          선택 중일 때만 라벨과 함께 브랜드색으로 묶인다 — 한 줄이 두 색으로 갈리지 않게. */}
      <p
        className={cn(
          'flex items-center gap-1 text-caption',
          active ? 'text-brand-700' : exit ? 'text-gray-500' : 'text-gray-700',
        )}
      >
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            active ? 'text-brand-700' : exit ? 'text-gray-400' : badgeToneText[tone],
          )}
          aria-hidden
        />
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          'text-title-sm font-bold tabular-nums',
          exit ? (count > 0 ? 'text-gray-500' : 'text-gray-400') : 'text-gray-900',
        )}
      >
        {count}
        {/* 단위는 크기를 낮추지 않고 굵기·색으로만 물린다 — 한 줄 안에서 크기를 가르면
            숫자와 단위가 서로 다른 층으로 읽혀 기준선이 어긋난다. */}
        <span className={cn('ml-0.5 font-normal', exit ? 'text-gray-400' : 'text-gray-500')}>
          건
        </span>
      </p>
      {/* 편중 막대. 색은 목록 상태 배지와 같은 톤을 쓴다 — 같은 상태가 두 색으로 보이면
          목록과 이 카드를 오갈 때 매번 다시 짝을 지어야 한다.
          선택 중이라도 톤을 브랜드색으로 덮지 않는다(선택은 테두리·배경이 이미 말한다).
          0건은 트랙만 남겨 '비어 있음'을 자리로 보여 준다. */}
      <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <span
          className={cn('block h-full rounded-full', badgeToneFill[tone])}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
    </button>
  )
}
