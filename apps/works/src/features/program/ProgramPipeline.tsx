import {
  CardShell,
  Skeleton,
  StatStrip,
  TextAction,
  cn,
  type StripTile,
} from '@ynarcher/ui'
import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { PROGRAM_STATUS_LABEL, programFlowGroups } from '@/features/program/config'
import {
  useProgramStatusCounts,
  type ProgramFilters as Filters,
} from '@/features/program/programsPoolHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

interface ProgramPipelineProps {
  /** 집계 스코프. 목록과 같은 값을 받아 같은 모수를 본다. */
  mineUserId: string | null
  /** 목록 검색어. 집계도 같은 값으로 좁힌다. */
  keyword: string
  /** 목록에 걸린 필터 전체. 상태는 '선택된 단계'로 표시되고, 나머지는 집계 모수를 좁힌다. */
  filters: Filters
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
 * 목록 위에서 "지금 보고 있는 사업이 어느 단계에 몰려 있나"에 한눈에 답하고, 단계를 누르면
 * 그대로 아래 목록의 상태 필터가 된다 — 현황을 읽는 눈과 목록을 좁히는 손을 같은 자리에 둔다.
 *
 * 모수는 아래 목록과 같다(스코프 + 검색어 + 필터). 단 상태 필터만은 집계에서 뺀다 —
 * 자기가 만들어 낸 조건을 자기 집계에 도로 걸면 고른 단계만 남고 나머지가 전부 0이 되어
 * 되돌릴 근거인 분포가 사라진다. 그래서 상태를 고른 동안에는 카드의 총계가 목록 건수보다
 * 크게 나오는데, 이는 "이 모수에서 그 단계를 고르는 중"이라는 사실 그대로다.
 *
 * 흐름은 수명주기(config.ts)를 그대로 편 것이라 여기서 단계를 새로 정의하지 않는다 —
 * 제안 단계를 쓰지 않는 워크스페이스(M&A·PROJECT)에서는 운영 4단계 한 줄만 그려진다.
 * 이탈(미선정·취소)은 같은 줄 끝에 나란히 두되 점선으로 가른다 — 아래로 내리면 눈이 두 번
 * 움직이고, 실선 화살표로 이으면 "선정 → 미선정"처럼 읽혀 흐름이 거짓말을 한다.
 * 이탈끼리는 서로 이어지지 않으므로(각자 다른 지점에서 빠진다) 화살표 없이 병렬로 놓는다.
 */
export function ProgramPipeline({
  mineUserId,
  keyword,
  filters,
  onToggleStatus,
  onClearStatuses,
}: ProgramPipelineProps) {
  const config = useProgramWorkspace()
  const { data, isPending } = useProgramStatusCounts(mineUserId, keyword, filters)
  const selectedStatuses = filters.statuses

  // 첫 조회 중에는 카드 높이만큼 자리를 잡아 둔다(도착하는 순간 목록이 밀려 내려가지 않게).
  if (isPending) return <Skeleton className="h-[8.5rem] w-full rounded-radius-lg" />
  // 조회에 실패했을 때만 자리를 비운다. 0건이어도 줄은 그린다 —
  // 종전에는 "목록의 빈 상태가 이미 답한다"며 걷었지만, 그러면 아직 등록이 없는 워크스페이스
  // (또는 내가 맡은 건이 없는 '내 ~ 관리')에서만 목록 위 구조가 통째로 달라져, 화면을 옮길
  // 때마다 있던 카드가 사라지는 것으로 보인다. 빈 줄은 아무것도 아닌 게 아니라 "이 사업이
  // 앞으로 밟을 단계"를 미리 보여 주는 자리이고, 단계 선택 해제 손잡이도 여기 붙어 있다.
  if (!data) return null

  const countOf = (status: string) => data.byStatus[status] ?? 0
  const stepOf = (status: string): FlowStep => ({
    key: status,
    label: PROGRAM_STATUS_LABEL[status] ?? status,
    count: countOf(status),
    status,
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
            },
          ]
        : []),
    ],
  }))

  /**
   * 칸 하나 — 공용 지표 띠의 칸 규격을 그대로 쓴다(2026-08-20).
   *
   * 한때 이 카드만 단계마다 테두리 상자에 아이콘과 편중 막대를 얹은 자체 타일을 썼다. 지표를
   * 상자에 가두면 비교가 아니라 열거로 읽히고, 아이콘과 막대는 라벨과 건수가 이미 하는 말을
   * 형태로 한 번 더 하는 것이었다. 흐름을 말하는 것(화살표·이탈 점선)만 남기고 지표를 그리는
   * 일은 규격에 넘긴다.
   */
  const tileOf = ({ label, count, status }: FlowStep): StripTile => ({
    key: status ?? label,
    label,
    value: `${count}`,
    unit: '건',
    selected: status !== null && selectedStatuses.includes(status),
    onClick: status ? () => onToggleStatus(status) : undefined,
  })

  /** 한 칸을 감싼 지표 띠. 칸 사이를 잇는 것이 세로선이 아니라 화살표라 칸마다 따로 세운다. */
  const strip = (step: FlowStep) => (
    <StatStrip tiles={[tileOf(step)]} className="min-w-0 flex-1" />
  )

  return (
    <CardShell>
      {/* 묶음 라벨. 아래 단계 줄과 같은 flex 비율을 써서 열이 정확히 겹친다.
          묶음이 하나뿐이면(제안 단계를 쓰지 않는 워크스페이스) 라벨을 그리지 않지만,
          단계를 고른 동안에는 해제 손잡이를 둘 자리가 필요하므로 줄 자체는 남긴다. */}
      {(groups.length > 1 || selectedStatuses.length > 0) && (
        <div className="mb-1.5 flex items-center gap-1.5">
          {groups.length > 1 &&
            groups.map((group, gi) => (
              <Fragment key={group.key}>
                {gi > 0 && <span className="size-4 shrink-0" aria-hidden />}
                <div
                  className="flex min-w-0 flex-1 items-center gap-2"
                  style={{ flexGrow: group.steps.length + group.exits.length }}
                >
                  {/* 묶음 라벨은 자기가 이끄는 칸 라벨(gray-600)보다 연해지지 않아야 한다 —
                      연하면 어디가 묶음의 시작인지 알려주지 못한다. */}
                  <span className="shrink-0 text-caption font-medium text-gray-800">
                    {group.label}
                  </span>
                  <span className="flex-1 border-t border-gray-200" aria-hidden />
                </div>
              </Fragment>
            ))}
          {/* 카드 제목을 걷어냈으므로 해제 손잡이는 이 줄의 오른쪽 끝에 선다. */}
          {selectedStatuses.length > 0 && (
            <span className={cn('shrink-0', groups.length === 1 && 'ml-auto')}>
              <TextAction onClick={onClearStatuses}>단계 선택 해제</TextAction>
            </span>
          )}
        </div>
      )}

      {/* 단계 줄 — 주 경로는 화살표로 잇고, 그 단계의 이탈은 점선 경계 뒤에 나란히 세운다. */}
      <div className="flex items-stretch gap-1.5">
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
                  {strip(step)}
                </Fragment>
              ))}
              {group.exits.length > 0 && <ExitDivider />}
              {group.exits.map((step) => (
                <Fragment key={step.key}>{strip(step)}</Fragment>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </CardShell>
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

