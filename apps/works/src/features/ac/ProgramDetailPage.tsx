import { Badge, Banner, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EvaluationPanel } from '@/features/ac/EvaluationPanel'
import { MentoringPanel } from '@/features/ac/MentoringPanel'
import { ModuleBoard } from '@/features/ac/ModuleBoard'
import { ParticipantPool } from '@/features/ac/ParticipantPool'
import { CustomActivityPanel } from '@/features/ac/panels/CustomActivityPanel'
import { DemoDayPanel } from '@/features/ac/panels/DemoDayPanel'
import { DocReviewPanel } from '@/features/ac/panels/DocReviewPanel'
import { MatchingPanel } from '@/features/ac/panels/MatchingPanel'
import { OnsitePanel } from '@/features/ac/panels/OnsitePanel'
import { OrientationPanel } from '@/features/ac/panels/OrientationPanel'
import { OutcomesPanel } from '@/features/ac/panels/OutcomesPanel'
import { RecruitmentPanel } from '@/features/ac/panels/RecruitmentPanel'
import { TimelinePanel } from '@/features/ac/panels/TimelinePanel'
import { useProgram } from '@/features/ac/hooks'
import { PROGRAM_STATUS_LABEL } from '@/features/ac/config'

type Tab =
  | 'modules'
  | 'participants'
  | 'recruitment'
  | 'docreview'
  | 'onsite'
  | 'evaluation'
  | 'orientation'
  | 'mentoring'
  | 'matching'
  | 'demoday'
  | 'timeline'
  | 'outcomes'
  | 'custom'

const TABS: { key: Tab; label: string }[] = [
  { key: 'modules', label: '모듈 보드' },
  { key: 'participants', label: '참가자 풀' },
  { key: 'recruitment', label: '모집' },
  { key: 'evaluation', label: '평가 엔진' },
  { key: 'docreview', label: '서면평가' },
  { key: 'onsite', label: '대면평가' },
  { key: 'orientation', label: 'OT/세션' },
  { key: 'mentoring', label: '멘토링' },
  { key: 'matching', label: '매칭' },
  { key: 'demoday', label: '데모데이' },
  { key: 'timeline', label: '타임라인' },
  { key: 'outcomes', label: '성과/KPI' },
  { key: 'custom', label: '커스텀 활동' },
]

/** 프로그램 상세: Program First 14모듈 진입. */
export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: program, isLoading } = useProgram(id)
  const [tab, setTab] = useState<Tab>('modules')

  if (isLoading) return <Spinner />
  if (!program || !id) {
    return <Banner tone="warning">프로그램을 찾을 수 없습니다.</Banner>
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/ac" className="text-caption text-gray-500 hover:text-gray-800">
          ← AC 대시보드
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-title-lg font-bold text-gray-900">{program.title}</h1>
          <Badge tone="info">
            {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
          </Badge>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'modules' && <ModuleBoard programId={id} />}
      {tab === 'participants' && <ParticipantPool programId={id} />}
      {tab === 'recruitment' && <RecruitmentPanel programId={id} />}
      {tab === 'evaluation' && <EvaluationPanel programId={id} />}
      {tab === 'docreview' && <DocReviewPanel programId={id} />}
      {tab === 'onsite' && <OnsitePanel programId={id} />}
      {tab === 'orientation' && <OrientationPanel programId={id} />}
      {tab === 'mentoring' && <MentoringPanel programId={id} />}
      {tab === 'matching' && <MatchingPanel programId={id} />}
      {tab === 'demoday' && <DemoDayPanel programId={id} />}
      {tab === 'timeline' && <TimelinePanel programId={id} />}
      {tab === 'outcomes' && <OutcomesPanel programId={id} />}
      {tab === 'custom' && <CustomActivityPanel programId={id} />}
    </div>
  )
}
