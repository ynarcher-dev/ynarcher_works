import { Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program, ProgramModule } from '@/features/program/hooks'
import { ParticipantPool } from '@/features/program/ParticipantPool'
import { ModuleBoardCard } from '@/features/program/detail/ModuleBoardCard'
import { ProgramAnnouncementsPanel } from '@/features/program/detail/ProgramAnnouncementsPanel'
import { ProgramInfoCard } from '@/features/program/detail/ProgramInfoCard'
import { ProgramIntroPanel } from '@/features/program/detail/ProgramIntroPanel'
import { ProgramQnaPanel } from '@/features/program/detail/ProgramQnaPanel'
import { RelatedApprovalPanel } from '@/features/program/detail/RelatedApprovalPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { useProgramContributions } from '@/features/program/detail/programContributions'
import { useProgramWorkspace } from '@/features/program/workspace'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'

type LeftTab = 'intro' | 'announcements' | 'qna' | 'modules' | 'participants'

const BASE_TABS: { key: LeftTab; label: string }[] = [
  { key: 'modules', label: '일정관리' },
  { key: 'participants', label: '연동 DB' },
]

/**
 * 프로그램 상세 개요(NETWORKS·STARTUP 상세와 동일한 2/3 + 1/3 카드섹션 컴포지션).
 * 좌측 본문(2/3): 기본 데이터 카드 → 서브 탭(사업개요 · 공지사항 · QNA · 일정관리 · 연동 DB).
 * 앞의 세 탭은 게스트 고정 메뉴로 나가는 화면이라 원장을 둔 워크스페이스(AC)에서만 서고,
 * 사업개요가 설 때는 첫 탭이자 기본 탭이다 — 게스트가 로그인 직후 처음 보는 것과 같은 순서다.
 * '평가 엔진' 탭은 2026-08-27 걷어냈다 — 평가는 사업 상세에 늘 떠 있어야 하는 축이 아니라
 * 서면평가·대면평가 모듈을 켰을 때의 운영 화면이라, 모듈과 무관한 상시 탭 자리를 차지할 이유가 없다.
 * 우측(1/3): 자료 관리 → 관련 전자결재 → 관련 회의록 → 변동 이력 → 코멘트(상세 공통 순서).
 * 우측에 있던 월간 캘린더('통합 타임라인')는 2026-08-25 걷어냈다 — 같은 모듈 일정을
 * 일정관리 탭(목록·칸반·간트)이 이미 더 넓은 자리에서 보여 주고 있어, 좁은 우측에 달력을
 * 하나 더 두면 같은 사실을 두 곳에서 각자 그리게 된다.
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
  const hasIntro = Boolean(config.tables.overviews)
  // 게스트향 고정 화면 3종(사업개요·공지사항·QNA)은 원장을 둔 워크스페이스(AC)에서만 선다.
  const leftTabs: { key: LeftTab; label: string }[] = [
    ...(hasIntro ? [{ key: 'intro' as const, label: '사업개요' }] : []),
    ...(config.tables.announcements
      ? [{ key: 'announcements' as const, label: '공지사항' }]
      : []),
    ...(config.tables.questions ? [{ key: 'qna' as const, label: 'QNA' }] : []),
    ...BASE_TABS,
  ]
  const [leftTab, setLeftTab] = useState<LeftTab>(hasIntro ? 'intro' : 'modules')

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <ProgramInfoCard program={program} />
        <div>
          <Tabs
            items={leftTabs}
            value={leftTab}
            onChange={(key) => setLeftTab(key as LeftTab)}
          />
          <div className="mt-4">
            {leftTab === 'intro' && <ProgramIntroPanel programId={program.id} />}
            {leftTab === 'announcements' && (
              <ProgramAnnouncementsPanel programId={program.id} />
            )}
            {leftTab === 'qna' && <ProgramQnaPanel programId={program.id} />}
            {leftTab === 'modules' && (
              <ModuleBoardCard program={program} onOpenModule={onOpenModule} />
            )}
            {leftTab === 'participants' && <ParticipantPool program={program} />}
          </div>
        </div>
      </div>
      {/* 우측(1/3): 자료 관리 → 전자결재 → 관련 회의록 → 변동 이력 → 코멘트.
          급한 순서가 곧 위에서 아래 순서다 — 일하러 들어온 사람이 먼저 찾는 것은 자료와 결재고,
          코멘트는 다 보고 남기는 말이라 맨 아래에 둔다. 상세 화면 전부가 이 순서를 공유한다. */}
      <div className="space-y-4 lg:col-span-1">
        <MaterialPanel targetType="program" targetId={program.id} />
        {/* 결재 연동의 대상 키도 회의록과 같은 워크스페이스별 entityKey다(program / ma_program /
            project_program) — 셋을 공유하면 AC 결재가 M&A 딜에 붙어 보인다. */}
        <RelatedApprovalPanel targetType={config.entityKey} targetId={program.id} />
        <RelatedMinutesPanel targetType={config.entityKey} targetId={program.id} />
        <ChangeHistoryPanel contributions={contributions} />
        <FeedbackPanel targetType={config.entityKey} targetId={program.id} />
      </div>
    </div>
  )
}
