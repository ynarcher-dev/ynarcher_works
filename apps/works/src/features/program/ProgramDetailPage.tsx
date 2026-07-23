import { BackButton, Badge, Banner, Button, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { categoryFromTab } from '@/config/programCategories'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { useDeactivateProgram } from '@/features/program/programsPoolHooks'
import { MentoringPanel } from '@/features/program/MentoringPanel'
import { ProgramFormModal } from '@/features/program/ProgramFormModal'
import { ProgramOverviewTab } from '@/features/program/detail/ProgramOverviewTab'
import { MODULE_META } from '@/features/program/detail/moduleMeta'
import type { ProgramModule } from '@/features/program/hooks'
import { CustomActivityPanel } from '@/features/program/panels/CustomActivityPanel'
import { DemoDayPanel } from '@/features/program/panels/DemoDayPanel'
import { DocReviewPanel } from '@/features/program/panels/DocReviewPanel'
import { MatchingPanel } from '@/features/program/panels/MatchingPanel'
import { OnsitePanel } from '@/features/program/panels/OnsitePanel'
import { OrientationPanel } from '@/features/program/panels/OrientationPanel'
import { OutcomesPanel } from '@/features/program/panels/OutcomesPanel'
import { RecruitmentPanel } from '@/features/program/panels/RecruitmentPanel'
import { TimelinePanel } from '@/features/program/panels/TimelinePanel'
import { useProgram } from '@/features/program/hooks'
import { PROGRAM_STATUS_LABEL, PROGRAM_STATUS_TONE } from '@/features/program/config'
import { useProgramWorkspace } from '@/features/program/workspace'

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
  const config = useProgramWorkspace()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const deactivate = useDeactivateProgram()
  const [params] = useSearchParams()
  // 출처 목록 탭(mine/all/카테고리). 알 수 없는 값이면 전체 목록으로 폴백한다.
  const fromTab = params.get('tab') ?? ''
  const backTab =
    fromTab === 'mine' || fromTab === 'all' || categoryFromTab(config.categories, fromTab)
      ? fromTab
      : 'all'
  const backTo = `${config.basePath}?tab=${backTab}`
  const { data: program, isLoading } = useProgram(id)
  const [tab, setTab] = useState<Tab>('overview')
  // 진입한 모듈 인스턴스(운영 화면은 program_module_id 단위이므로 인스턴스를 들고 있어야 한다).
  const [openMod, setOpenMod] = useState<ProgramModule | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) return <Spinner />
  if (!program || !id) {
    return <Banner tone="warning">사업을 찾을 수 없습니다.</Banner>
  }

  /** 모듈 카드 클릭 → 해당 인스턴스의 운영 화면으로 이동. */
  const onOpenModule = (module: ProgramModule) => {
    const target = MODULE_META[module.module_type]?.tab
    if (target && TAB_KEYS.has(target)) {
      setOpenMod(module)
      setTab(target as Tab)
    }
  }

  // 운영 화면 뒤로가기 → 개요로 복귀(진입 인스턴스 해제).
  const backToOverview = () => {
    setTab('overview')
    setOpenMod(null)
  }
  // 인스턴스 단위 운영 화면에 넘길 program_module_id.
  const moduleId = openMod?.id

  return (
    <div className="space-y-5">
      {tab === 'overview' ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <BackButton as={Link} to={backTo} />
            <div className="flex items-center gap-2">
              {/* 사업은 삭제 사유 인프라가 없어 확인창(confirm)으로 소프트 삭제한다. */}
              <DetailDeleteButton
                withReason={false}
                onDelete={async () => {
                  await deactivate.mutateAsync(program.id)
                }}
                onDeleted={() => navigate(backTo)}
              />
              <Button onClick={() => setEditOpen(true)}>편집</Button>
            </div>
          </div>
          <ProgramOverviewTab program={program} onOpenModule={onOpenModule} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <BackButton onClick={backToOverview} />
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-gray-900">
                {openMod?.title?.trim() || PANEL_LABEL[tab]}
              </span>
              <Badge tone={PROGRAM_STATUS_TONE[program.status] ?? 'neutral'}>
                {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
              </Badge>
            </div>
          </div>

          {/* 프로그램 단위 화면(집계·타임라인)은 programId, 인스턴스 단위 운영 화면은 moduleId로 렌더한다. */}
          {tab === 'timeline' && <TimelinePanel programId={id} />}
          {tab === 'outcomes' && <OutcomesPanel programId={id} />}
          {tab === 'custom' && <CustomActivityPanel programId={id} />}
          {moduleId && tab === 'recruitment' && (
            <RecruitmentPanel programId={id} moduleId={moduleId} />
          )}
          {moduleId && tab === 'docreview' && <DocReviewPanel moduleId={moduleId} />}
          {moduleId && tab === 'onsite' && <OnsitePanel moduleId={moduleId} />}
          {moduleId && tab === 'orientation' && <OrientationPanel moduleId={moduleId} />}
          {moduleId && tab === 'mentoring' && <MentoringPanel moduleId={moduleId} />}
          {moduleId && tab === 'matching' && <MatchingPanel moduleId={moduleId} />}
          {moduleId && tab === 'demoday' && <DemoDayPanel moduleId={moduleId} />}
        </>
      )}

      {editOpen && (
        <ProgramFormModal open program={program} onClose={() => setEditOpen(false)} />
      )}
    </div>
  )
}
