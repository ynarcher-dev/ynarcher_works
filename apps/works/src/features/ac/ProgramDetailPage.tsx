import { Badge, Banner, Button, PageHeader, Spinner, Tabs } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EvaluationPanel } from '@/features/ac/EvaluationPanel'
import { MentoringPanel } from '@/features/ac/MentoringPanel'
import { ParticipantPool } from '@/features/ac/ParticipantPool'
import { ProgramFormModal } from '@/features/ac/ProgramFormModal'
import { ProgramOverviewTab } from '@/features/ac/detail/ProgramOverviewTab'
import { MODULE_META } from '@/features/ac/detail/moduleMeta'
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
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/ac/config'

type Tab =
  | 'overview'
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
  { key: 'overview', label: '개요' },
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

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key))

/**
 * 프로그램 상세: 개요(운영 모듈 보드 + 통합 타임라인 + 참가자 풀) 진입 후
 * 모듈 카드 클릭으로 각 운영 탭에 진입한다. (Program First 구조)
 */
export function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: program, isLoading } = useProgram(id)
  const [tab, setTab] = useState<Tab>('overview')
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) return <Spinner />
  if (!program || !id) {
    return <Banner tone="warning">프로그램을 찾을 수 없습니다.</Banner>
  }

  /** 모듈 카드 클릭 → 해당 운영 탭으로 이동. */
  const onOpenModule = (moduleType: string) => {
    const target = MODULE_META[moduleType]?.tab
    if (target && TAB_KEYS.has(target)) setTab(target as Tab)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Link to="/ac" className="text-caption font-semibold text-brand hover:text-brand-600">
            ← 프로그램 목록
          </Link>
        }
        title={program.title}
        titleExtra={
          <Badge tone={PROGRAM_STATUS_TONE[program.status] ?? 'neutral'}>
            {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
          </Badge>
        }
        description={program.description}
        actions={
          <>
            <Button onClick={() => setTab('outcomes')}>성과 허브 →</Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              편집
            </Button>
          </>
        }
      />

      <Tabs items={TABS} value={tab} onChange={(key) => setTab(key as Tab)} />

      {tab === 'overview' && (
        <ProgramOverviewTab program={program} onOpenModule={onOpenModule} />
      )}
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

      {editOpen && (
        <ProgramFormModal open program={program} onClose={() => setEditOpen(false)} />
      )}
    </div>
  )
}
