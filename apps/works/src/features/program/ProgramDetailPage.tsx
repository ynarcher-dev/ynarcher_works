import { BackButton, Banner, Button, DetailTopBar, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { useDeactivateProgram } from '@/features/program/programsPoolHooks'
import { ProgramFormModal } from '@/features/program/ProgramFormModal'
import { ProgramOverviewTab } from '@/features/program/detail/ProgramOverviewTab'
import { ModuleHeaderCard } from '@/features/program/detail/ModuleHeaderCard'
import { MODULE_META, moduleDisplayName } from '@/features/program/detail/moduleMeta'
import { useProgramModules, type ProgramModule } from '@/features/program/hooks'
import { FilePanel } from '@/features/program/panels/FilePanel'
import { LinkPanel } from '@/features/program/panels/LinkPanel'
import { ModuleNoticeSplit } from '@/features/program/panels/NoticePanel'
import { PostPanel } from '@/features/program/panels/PostPanel'
import { QuickReviewPanel } from '@/features/program/panels/QuickReviewPanel'
import { RecruitmentPanel } from '@/features/program/panels/RecruitmentPanel'
import { TimelinePanel } from '@/features/program/panels/TimelinePanel'
import { useProgram } from '@/features/program/hooks'
import { useProgramWorkspace } from '@/features/program/workspace'
import { listPathOf } from '@/lib/listScope'

// 명부는 개요의 '와이앤아처 GUEST 설정' 버튼이 여는 모달에서 렌더하므로 전체 화면 라우팅 대상이 아니다.
type Tab =
  | 'overview'
  | 'recruitment'
  | 'timeline'
  | 'post'
  | 'link'
  | 'file'
  | 'quick-review'

const TAB_KEYS = new Set<string>([
  'overview',
  'recruitment',
  'timeline',
  'post',
  'link',
  'file',
  'quick-review',
])

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
  const authUser = useAuthStore((s) => s.user)
  const [params] = useSearchParams()
  // 출처 목록 범위(mine/all). 알 수 없는 값이면 전체 범위로 폴백한다 — 내 것이 아닌 사업을
  // 열었을 때 '내 ~' 목록에는 그 행이 없어 뒤로가기가 빈 목록으로 끝난다. 옛 링크가 실어 오는
  // 탭 값(?tab=mine·사업구분)도 여기서 같은 규칙으로 접힌다.
  const from = params.get('from') ?? params.get('tab') ?? ''
  const backTo = listPathOf(config.basePath, from === 'mine' ? 'mine' : 'all')
  const { data: program, isLoading } = useProgram(id)
  const [tab, setTab] = useState<Tab>('overview')
  // 진입한 모듈 인스턴스(운영 화면은 program_module_id 단위이므로 인스턴스를 들고 있어야 한다).
  // 들고 있는 것은 **id뿐**이고 값은 목록 캐시에서 되찾는다 — 진입 시점의 객체를 그대로 쥐고 있으면
  // 운영 화면 최상단 카드에서 방금 고친 모듈명·기간이 이 화면에는 옛 값으로 남는다.
  const [openModId, setOpenModId] = useState<string | null>(null)
  const { data: modules } = useProgramModules(id)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) return <Spinner />
  if (!program || !id) {
    return <Banner tone="warning">{config.entityNoun}을(를) 찾을 수 없습니다.</Banner>
  }

  /** 모듈 카드 클릭 → 해당 인스턴스의 운영 화면으로 이동. */
  const onOpenModule = (module: ProgramModule) => {
    const target = MODULE_META[module.module_type]?.tab
    if (target && TAB_KEYS.has(target)) {
      setOpenModId(module.id)
      setTab(target as Tab)
    }
  }

  // 운영 화면 뒤로가기 → 개요로 복귀(진입 인스턴스 해제).
  const backToOverview = () => {
    setTab('overview')
    setOpenModId(null)
  }
  // 인스턴스 단위 운영 화면에 넘길 program_module_id.
  const openMod = openModId ? (modules ?? []).find((m) => m.id === openModId) ?? null : null
  const moduleId = openMod?.id
  const canDeactivate =
    authUser?.role === 'super_admin' || program.created_by === authUser?.id

  return (
    <div className="space-y-5">
      {tab === 'overview' ? (
        <>
          <DetailTopBar
            back={<BackButton as={Link} to={backTo} />}
            actions={
              <>
                {canDeactivate && (
                  <DetailDeleteButton
                    name={program.title}
                    onDelete={(reason) =>
                      deactivate.mutateAsync({ id: program.id, reason: reason ?? '' })
                    }
                    onDeleted={() => navigate(backTo)}
                  />
                )}
                <Button onClick={() => setEditOpen(true)}>편집</Button>
              </>
            }
          />
          <ProgramOverviewTab program={program} onOpenModule={onOpenModule} />
        </>
      ) : (
        <>
          {/*
            운영 화면의 머리는 **뒤로가기 하나**다(2026-09-01 사용자 지정).
            모듈명은 방금 누르고 들어온 카드가 이미 말했고, 여기 서던 배지는 모듈 상태가 아니라
            **사업 상태**('미선정' 등)라서 이 화면에서 하는 일과 무관한 사실을 답하고 있었다.
            사업 상태는 개요가 답하는 자리다. 글쓰기는 종전대로 헤더를 자기가 들고 있다 —
            뒤로가기와 수정이 한 줄에 서야 한다.
          */}
          {tab !== 'post' && <BackButton onClick={backToOverview} />}

          {/*
            모듈 카드(운영 화면 최상단, 2026-09-06). 이 모듈을 관리하는 유일한 자리이며 설정·끄기·
            삭제가 여기 모여 있다(개요 보드 목록의 아이콘 3종을 옮겨 왔다) — 종전에는 들어와서 하는
            일과 그 일의 조건(기간·담당자·공유 범위)이 다른 화면에 갈려 있었다. 끄기·삭제 뒤에는
            개요로 돌아온다(`onGone`).

            글쓰기는 헤더를 자기가 들고 있으므로 카드도 그 안에서 뒤로가기 줄 아래에 선다 —
            카드가 뒤로가기보다 위에 서면 나가는 길이 화면 중간에 놓인다.
          */}
          {moduleId && tab !== 'post' && (
            <ModuleHeaderCard program={program} moduleId={moduleId} onGone={backToOverview} />
          )}

          {/* 프로그램 단위 화면(타임라인)은 programId, 인스턴스 단위 운영 화면은 moduleId로 렌더한다. */}
          {tab === 'timeline' && <TimelinePanel programId={id} />}
          {moduleId && tab === 'post' && (
            <PostPanel
              programId={id}
              moduleId={moduleId}
              moduleTitle={openMod ? moduleDisplayName(openMod) : '글쓰기'}
              onBack={backToOverview}
              moduleCard={
                <ModuleHeaderCard
                  program={program}
                  moduleId={moduleId}
                  onGone={backToOverview}
                />
              }
            />
          )}
          {/* 기본 템플릿(URL첨부·파일첨부): GUEST와 같은 카드 구성의 편집 화면. 헤더는 위 공통 헤더를 쓴다.
              우측 NOTICE도 GUEST 메뉴 우측과 같은 자리·같은 비율이다(글쓰기는 제외 — 그 자체가 글이다). */}
          {moduleId && tab === 'link' && (
            <ModuleNoticeSplit programId={id} moduleId={moduleId}>
              <LinkPanel programId={id} moduleId={moduleId} />
            </ModuleNoticeSplit>
          )}
          {moduleId && tab === 'file' && (
            <ModuleNoticeSplit programId={id} moduleId={moduleId}>
              <FilePanel programId={id} moduleId={moduleId} />
            </ModuleNoticeSplit>
          )}
          {moduleId && tab === 'recruitment' && (
            <RecruitmentPanel programId={id} moduleId={moduleId} />
          )}
          {/* 퀵리뷰는 moduleId를 쓰지 않는다 — 세우는 값이 모듈에 매달린 것이 아니라
              **프로젝트에 연결된 매물**의 것이라, 프로젝트 하나에 이 모듈도 하나다
              (uq_program_modules_quick_review_singleton).

              ModuleNoticeSplit(우측 NOTICE)로 감싸지 않는 이유는 둘이다. 그 칸은 게스트에게
              나가는 알림인데 이 모듈은 WORKS ONLY이고, 무엇보다 이 패널은 **자기 2:1 격자를
              들고 온다**(원장 상세와 같은 구성) — 그 바깥에 또 다른 2:1을 씌우면 본문이
              4/9로 접혀 퀵 리뷰 표가 설 자리를 잃는다. */}
          {moduleId && tab === 'quick-review' && <QuickReviewPanel programId={id} />}
        </>
      )}

      {editOpen && (
        <ProgramFormModal open program={program} onClose={() => setEditOpen(false)} />
      )}
    </div>
  )
}
