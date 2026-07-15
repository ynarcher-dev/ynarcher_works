import { Badge, Banner, Button, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MentoringPanel } from '@/features/ac/MentoringPanel'
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

// 참가자 풀·평가 엔진은 개요 좌측 서브 탭에서 렌더하므로 전체 화면 라우팅 대상이 아니다.
type Tab =
  | 'overview'
  | 'recruitment'
  | 'docreview'
  | 'onsite'
  | 'orientation'
  | 'mentoring'
  | 'matching'
  | 'demoday'
  | 'timeline'
  | 'outcomes'
  | 'custom'

const TAB_KEYS = new Set<string>([
  'overview',
  'recruitment',
  'docreview',
  'onsite',
  'orientation',
  'mentoring',
  'matching',
  'demoday',
  'timeline',
  'outcomes',
  'custom',
])

/** 운영(개요 외) 화면의 상단 라벨. 뒤로가기 헤더 제목에 사용한다. */
const PANEL_LABEL: Record<Exclude<Tab, 'overview'>, string> = {
  recruitment: '모집',
  docreview: '서면평가',
  onsite: '대면평가',
  orientation: 'OT/세션',
  mentoring: '멘토링',
  matching: '매칭',
  demoday: '데모데이',
  timeline: '타임라인',
  outcomes: '성과/KPI',
  custom: '커스텀 활동',
}

/**
 * 프로그램 상세: NETWORKS·STARTUP 상세와 동일한 카드섹션 구조.
 * 상단 탭바 없이, '개요'는 슬림 헤더 + 좌우 2열 카드섹션으로 진입하고,
 * 운영 화면은 모듈 보드 카드 클릭(또는 우측 패널 '전체 보기')으로 진입해 전체 폭으로 렌더한다.
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

  /** 모듈 카드 클릭 → 해당 운영 화면으로 이동. */
  const onOpenModule = (moduleType: string) => {
    const target = MODULE_META[moduleType]?.tab
    if (target && TAB_KEYS.has(target)) setTab(target as Tab)
  }
  const openTab = (t: string) => {
    if (TAB_KEYS.has(t)) setTab(t as Tab)
  }

  return (
    <div className="space-y-5">
      {tab === 'overview' ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/ac"
              className="text-caption font-semibold text-brand hover:text-brand-600"
            >
              ← 프로그램 목록
            </Link>
            <Button onClick={() => setEditOpen(true)}>편집</Button>
          </div>
          <ProgramOverviewTab
            program={program}
            onOpenModule={onOpenModule}
            onOpenTab={openTab}
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className="text-caption font-semibold text-brand hover:text-brand-600"
            >
              ← {program.title} 개요
            </button>
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-gray-900">
                {PANEL_LABEL[tab]}
              </span>
              <Badge tone={PROGRAM_STATUS_TONE[program.status] ?? 'neutral'} size="sm">
                {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
              </Badge>
            </div>
          </div>

          {tab === 'recruitment' && <RecruitmentPanel programId={id} />}
          {tab === 'docreview' && <DocReviewPanel programId={id} />}
          {tab === 'onsite' && <OnsitePanel programId={id} />}
          {tab === 'orientation' && <OrientationPanel programId={id} />}
          {tab === 'mentoring' && <MentoringPanel programId={id} />}
          {tab === 'matching' && <MatchingPanel programId={id} />}
          {tab === 'demoday' && <DemoDayPanel programId={id} />}
          {tab === 'timeline' && <TimelinePanel programId={id} />}
          {tab === 'outcomes' && <OutcomesPanel programId={id} />}
          {tab === 'custom' && <CustomActivityPanel programId={id} />}
        </>
      )}

      {editOpen && (
        <ProgramFormModal open program={program} onClose={() => setEditOpen(false)} />
      )}
    </div>
  )
}
