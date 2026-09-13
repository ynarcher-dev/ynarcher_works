import { Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program, ProgramModule } from '@/features/program/hooks'
import { MODULE_BOARD_LABEL } from '@/features/program/config'
import { GuestSettingsButton } from '@/features/program/detail/GuestSettingsButton'
import { ModuleBoardCard } from '@/features/program/detail/ModuleBoardCard'
import { ProgramRosterCard } from '@/features/program/detail/ProgramRosterCard'
import { ProgramInfoCard } from '@/features/program/detail/ProgramInfoCard'
import { RelatedApprovalPanel } from '@/features/program/detail/RelatedApprovalPanel'
import { WorkspaceBudgetTab } from '@/features/approval/WorkspaceBudgetTab'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { useProgramContributions } from '@/features/program/detail/programContributions'
import { useProgramWorkspace } from '@/features/program/workspace'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'

/**
 * 프로그램 상세 개요(NETWORKS·STARTUP 상세와 동일한 2/3 + 1/3 카드섹션 컴포지션).
 * 좌측 본문(2/3): 기본 데이터 카드 → `와이앤아처 GUEST 설정` 버튼 → 탭 줄(워크플로우 · 참가자 목록).
 *
 * **좌측 탭 줄은 2026-09-09 낮에 걷혔다가 같은 날 되섰다.** 걷은 이유는 게스트에게 나가는
 * 셋(개요·공지사항·Q&A)이 계정생성과 함께 GUEST 설정 모달로 들어가면서 남은 탭이 워크플로우
 * 하나가 되었기 때문이다 — 가를 것이 없는 자리에 선 탭은 '다른 것도 있다'고 말하는 거짓 신호다.
 * 되선 이유도 같은 규칙이다: **참가자 목록이 들어와 실제로 가를 것이 둘이 되었다.**
 *
 * 둘이 같은 층에 서는 근거는 둘 다 *이 사업 안에서 하는 일*이라는 것이다 — 무엇을 하는가
 * (워크플로우)와 누가 참가하는가(참가자 목록). 게스트에게 나가는 것들이 버튼 뒤로 접힌 것과
 * 갈리는 축이며, 그래서 참가자 목록은 GUEST 설정 안이 아니라 여기 선다(계정을 다루지 않는다).
 *
 * 이름은 탭 줄이 소유하므로 **두 카드 모두 제목을 들지 않는다** — 같은 낱말이 탭과 카드 제목에
 * 겹쳐 서면 둘이 같은 층인지 아닌지를 화면이 답하지 못한다.
 * 넷을 한자리에 모은 근거는 `GuestSettingsButton` 주석에 있다 — 성격이 같은 것끼리 모으면
 * 밖에 무엇이 나가 있는지 확인하려는 사람이 한 곳만 열면 된다.
 * '평가 엔진' 탭은 2026-08-27 걷어냈다 — 평가는 사업 상세에 늘 떠 있어야 하는 축이 아니라
 * 서면평가·대면평가 모듈을 켰을 때의 운영 화면이라, 모듈과 무관한 상시 탭 자리를 차지할 이유가 없다.
 * 우측(1/3): 자료 관리 → 관련 전자결재 → 관련 회의록 → 변동 이력 → 코멘트(상세 공통 순서).
 * 우측에 있던 월간 캘린더('통합 타임라인')는 2026-08-25 걷어냈다 — 같은 모듈 일정을
 * 프로그램 탭(목록·칸반·간트)이 이미 더 넓은 자리에서 보여 주고 있어, 좁은 우측에 달력을
 * 하나 더 두면 같은 사실을 두 곳에서 각자 그리게 된다.
 * **일정안내 탭도 같은 이유로 걷어냈다(2026-09-01, 세운 당일)** — 게스트에게 공유된 메뉴의
 * 기간을 그리는 화면이었는데, 그 행은 프로그램 탭 간트가 이미 그리고 있고 공유 여부는 각
 * 모듈의 공유범위 배지가 이미 답한다. 담당자에게 필요한 것은 '참여자용으로 한 번 더 거른
 * 화면'이 아니라 어느 메뉴가 나가 있는지이며, 그것은 프로그램 탭에서 읽힌다.
 * 게스트 쪽 일정안내 메뉴는 그대로 선다(그쪽은 프로그램 탭이 없다).
 * 자료/코멘트/변동이력 패널은 NETWORKS 공용 패널을 재사용한다. 코멘트·변동이력의 다형 키는
 * 워크스페이스별로 갈리므로(config.entityKey) 그것을 넘기고, 첨부는 정책이 워크스페이스 무관이라
 * 'program'을 그대로 쓴다.
 * 운영 모듈 카드 클릭은 `onOpenModule`로 해당 운영 화면 전체 화면에 진입한다.
 */
export function ProgramOverviewTab({
  program,
  onOpenModule,
}: {
  program: Program
  onOpenModule: (module: ProgramModule) => void
}) {
  const config = useProgramWorkspace()
  const { data: contributions } = useProgramContributions(program.id)
  // 이 워크스페이스가 쓰는 자격. 무엇이 서는지는 `guestMasterTables`가 답하고, 그 값은
  // 사이드바 창구의 하위 탭·참가자 목록의 자격 탭과 **같은 한 벌**이다.
  const personas = config.guestMasterTables ?? []
  const [tab, setTab] = useState<'workflow' | 'roster' | 'budget'>('workflow')

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      {/* min-w-0 — 격자 칸의 기본 최소 폭은 내용 폭이라, 안에 든 넓은 표가 칸을 밀어 화면
          전체가 가로로 스크롤된다(표의 가로 스크롤은 표 자기 상자 안에서만 일어나야 한다). */}
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <ProgramInfoCard program={program} />
        {/* 사업이 무엇인지(위) 다음에 오는 것이 **누구를 상대로 도는가**이고, 그다음이 무엇을
            하는가(아래 탭 줄)다. 우측 컬럼에 두지 않은 이유는 그쪽이 이미 패널 다섯 장이라
            한 장을 더하면 무엇이 무엇인지 흐려지기 때문이다 — 자세한 근거는 버튼 주석. */}
        <GuestSettingsButton host={program} personas={personas} />
        <Tabs
          items={[
            { key: 'workflow', label: MODULE_BOARD_LABEL },
            { key: 'roster', label: config.rosterLabel },
            // 예산/지출이 셋째로 선 근거도 같다 — 이 사업 안에서 하는 일의 한 축(돈)이고,
            // 우측 '전자결재' 패널이 답하는 "무슨 결재가 오갔나"와는 질문이 다르다
            // (여기는 배정된 예산과 그 줄에서 나간 돈을 묻는다).
            { key: 'budget', label: '예산/지출' },
          ]}
          value={tab}
          onChange={(key) => setTab(key as 'workflow' | 'roster' | 'budget')}
        />
        {/* 탭을 감추지 않고 갈아 끼운다 — 워크플로우 카드는 뷰 전환·펼침 같은 자기 상태를
            들고 있어, 숨겨 둔 채로 살려 두면 보이지 않는 화면이 조회를 계속 돌린다. */}
        {tab === 'workflow' ? (
          <ModuleBoardCard program={program} onOpenModule={onOpenModule} />
        ) : tab === 'roster' ? (
          <ProgramRosterCard programId={program.id} personas={personas} />
        ) : (
          <WorkspaceBudgetTab targetType={config.entityKey} targetId={program.id} />
        )}
      </div>
      {/* 우측(1/3): 자료 관리 → 전자결재 → 관련 회의록 → 변동 이력 → 코멘트.
          급한 순서가 곧 위에서 아래 순서다 — 일하러 들어온 사람이 먼저 찾는 것은 자료와 결재고,
          코멘트는 다 보고 남기는 말이라 맨 아래에 둔다. 상세 화면 전부가 이 순서를 공유한다. */}
      <div className="space-y-4 lg:col-span-1">
        <MaterialPanel targetType="program" targetId={program.id} />
        {/* 결재 연동의 대상 키도 회의록과 같은 워크스페이스별 entityKey다(program / ma_program)
            — 하나를 공유하면 AC 결재가 M&A 프로젝트에 붙어 보인다. */}
        <RelatedApprovalPanel targetType={config.entityKey} targetId={program.id} />
        <RelatedMinutesPanel targetType={config.entityKey} targetId={program.id} />
        <ChangeHistoryPanel contributions={contributions} />
        <FeedbackPanel targetType={config.entityKey} targetId={program.id} />
      </div>
    </div>
  )
}
