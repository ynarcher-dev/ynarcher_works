import { Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program, ProgramModule } from '@/features/program/hooks'
import { ParticipantPool } from '@/features/program/ParticipantPool'
import { PERSONA_LABEL, type MasterTable } from '@/features/program/participantHooks'
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

/**
 * 명부 탭의 키는 자격(`MasterTable`) 값 그대로다 — 탭 키를 자격으로 옮겨 적는 표를 두면
 * 그 표가 곧 어긋날 자리가 된다.
 */
type LeftTab = 'modules' | MasterTable | 'intro' | 'announcements' | 'qna'

/**
 * 내부 운영 탭. 명부는 자격 두 축(참여 기업 · 참여 전문가)이 각각 한 탭이다 —
 * 2026-09-05 하위 탭에서 이 층으로 올렸다. 자격은 표를 거르는 조건이 아니라 **게스트에게
 * 다른 화면을 여는 축**이라(3_9_1 §4), 검색·역할과 같은 층에 두면 필터 한 칸처럼 읽힌다.
 */
const BASE_TABS: { key: LeftTab; label: string }[] = [
  { key: 'modules', label: '프로그램' },
  { key: 'startups', label: PERSONA_LABEL.startups },
  { key: 'networks', label: PERSONA_LABEL.networks },
]

/**
 * 프로그램 상세 개요(NETWORKS·STARTUP 상세와 동일한 2/3 + 1/3 카드섹션 컴포지션).
 * 좌측 본문(2/3): 기본 데이터 카드 → 서브 탭(프로그램 · 참여 기업 · 참여 전문가 ┃ 사업개요 · 공지사항 · QNA).
 * 구분선 뒤 세 탭은 **게스트에게 그대로 나가는 화면**이라 내부 운영 탭과 층이 다르다
 * (2026-09-01 사용자 지정 순서) — 원장을 둔 워크스페이스(AC)에서만 서며, 기본 탭은 언제나
 * 첫 탭인 프로그램다.
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
  // 게스트향 화면 3종(사업개요·공지사항·QNA)은 내부 운영 탭 뒤에 구분선으로 갈라 세운다
  // — 첫 줄에만 divider를 달아 묶음의 시작을 알린다. 2026-09-03 원장 통합 이후 세 사업
  // 워크스페이스가 모두 운용하므로 워크스페이스별 노출 분기는 없다.
  const guestTabs: { key: LeftTab; label: string }[] = [
    { key: 'intro', label: '사업개요' },
    { key: 'announcements', label: '공지사항' },
    { key: 'qna', label: 'QNA' },
  ]
  const leftTabs = [
    ...BASE_TABS,
    ...guestTabs.map((tab, i) => (i === 0 ? { ...tab, divider: true } : tab)),
  ]
  const [leftTab, setLeftTab] = useState<LeftTab>('modules')

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
            {/* 탭을 바꾸면 명부는 통째로 다시 선다(key) — 선택·역할·페이지가 자격을 넘어
                살아남으면, 안 보이는 행이 선택된 채로 `연결`에 딸려 간다. */}
            {(leftTab === 'startups' || leftTab === 'networks') && (
              <ParticipantPool key={leftTab} program={program} persona={leftTab} />
            )}
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
