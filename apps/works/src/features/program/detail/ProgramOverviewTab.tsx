import { Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import type { Program, ProgramModule } from '@/features/program/hooks'
import { EvaluationPanel } from '@/features/program/EvaluationPanel'
import { ParticipantPool } from '@/features/program/ParticipantPool'
import { ModuleBoardCard } from '@/features/program/detail/ModuleBoardCard'
import { ProgramInfoCard } from '@/features/program/detail/ProgramInfoCard'
import { ProgramScheduleCard } from '@/features/program/detail/ProgramScheduleCard'
import { RelatedApprovalPanel } from '@/features/program/detail/RelatedApprovalPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { useProgramContributions } from '@/features/program/detail/programContributions'
import { useProgramWorkspace } from '@/features/program/workspace'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'

type LeftTab = 'modules' | 'participants' | 'evaluation'

const LEFT_TABS: { key: LeftTab; label: string }[] = [
  { key: 'modules', label: '운영 프로그램' },
  { key: 'participants', label: '참가자 풀' },
  { key: 'evaluation', label: '평가 엔진' },
]

/**
 * 프로그램 상세 개요(NETWORKS·STARTUP 상세와 동일한 2/3 + 1/3 카드섹션 컴포지션).
 * 좌측 본문(2/3): 기본 데이터 카드 → 서브 탭(운영 모듈 · 참가자 풀 · 평가 엔진).
 * 우측(1/3): 통합 타임라인 → 관련 전자결재 → 자료 관리 → 코멘트 → 변동 이력.
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
  const [leftTab, setLeftTab] = useState<LeftTab>('modules')

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <ProgramInfoCard program={program} />
        <div>
          <Tabs
            items={LEFT_TABS}
            value={leftTab}
            onChange={(key) => setLeftTab(key as LeftTab)}
          />
          <div className="mt-4">
            {leftTab === 'modules' && (
              <ModuleBoardCard program={program} onOpenModule={onOpenModule} />
            )}
            {leftTab === 'participants' && <ParticipantPool programId={program.id} />}
            {leftTab === 'evaluation' && <EvaluationPanel programId={program.id} />}
          </div>
        </div>
      </div>
      <div className="space-y-4 lg:col-span-1">
        <ProgramScheduleCard program={program} />
        <RelatedApprovalPanel />
        <RelatedMinutesPanel targetType={config.entityKey} targetId={program.id} />
        <MaterialPanel targetType="program" targetId={program.id} />
        <FeedbackPanel targetType={config.entityKey} targetId={program.id} />
        <ChangeHistoryPanel contributions={contributions} />
      </div>
    </div>
  )
}
