import { Badge, EmptyState, PageHeader, Spinner } from '@ynarcher/ui'
import {
  MODULE_STATUS_TONE,
  formatModulePeriod,
  moduleDisplayName,
  moduleStatusLabel,
  readModuleSettings,
} from '@ynarcher/master-data'
import { useParams } from 'react-router-dom'
import { GuestNoticeRail } from '@/app/GuestNoticeRail'
import { useGuestModules, useModuleFiles, type GuestModule } from '@/features/moduleHooks'
import { isModuleLocked, moduleNotice } from '@/features/moduleMeta'
import { FileModule } from '@/pages/modules/FileModule'
import { LinkModule } from '@/pages/modules/LinkModule'
import { LockedModuleBody } from '@/pages/modules/LockedModuleBody'
import { PostModule } from '@/pages/modules/PostModule'

/**
 * 공개 메뉴 한 개의 화면.
 *
 * 머리(이름 → 안내 → 진행기간)는 모든 템플릿이 공유한다 — WORKS 모듈 카드에서 세팅한 안내와
 * 일정이 게스트 쪽에서 도달하는 자리가 바로 여기이며, 어떤 템플릿이든 최소한 '무엇을 하라는
 * 것인가'와 '언제까지의 일인가'는 답한다. 몸통만 템플릿이 가른다.
 *
 * **상태 배지는 제목 옆에 선다**(2026-09-01 사용자 지정 — 같은 날 아침의 '세우지 않는다'를
 * 뒤집었다). 메뉴가 서 있다는 것은 '열려 있다'만 말할 뿐, 준비 중인지 진행 중인지 이미
 * 끝났는지는 답하지 못한다 — 참여자가 지금 무엇을 해야 하는지가 그 한 칸에 걸린다.
 * 라벨·톤은 공통 어휘(master-data)가 소유하므로 WORKS 모듈 카드의 배지와 같은 말·같은 색이다.
 * 템플릿 배지는 여전히 세우지 않는다 — 내부 운영 용어라 참여자에게 답하는 것이 없다.
 */
export function ModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const { data, isLoading } = useGuestModules()

  if (isLoading) return <Spinner />

  const mod = (data ?? []).find((m) => m.id === moduleId)
  if (!mod) {
    // 목록에 없다 = 담당자가 공유를 내렸거나 메뉴를 껐다. 게스트에게는 '없는 메뉴'이므로
    // 오류가 아니라 사실로 말한다(주소를 직접 친 경우도 같은 자리로 온다).
    return (
      <EmptyState
        title="열려 있지 않은 메뉴입니다"
        description="담당자가 공개를 내렸거나 아직 열리지 않았습니다. 왼쪽 메뉴에서 다른 항목을 선택해 주십시오."
      />
    )
  }

  const settings = readModuleSettings(mod.settings)
  const notice = moduleNotice(mod.module_type, settings.memo)
  // 준비·취소 메뉴는 머리만 세우고 몸통은 열지 않는다. 화면은 안내일 뿐이고 판정은
  // RLS(app.guest_open_module_ids)가 하므로, 잠긴 동안에는 글·링크·파일을 부르지도 않는다.
  const locked = isModuleLocked(mod.status)

  return (
    <div className="space-y-5">
      {/* 머리와 그 밑 구분선은 전체 폭으로 선다. 본문은 구분선 아래에서 2:1로 갈리고
          (데스크톱), 모바일에서는 우측 칸이 본문 아래로 이어 붙는다. 우측 칸의 내용은
          템플릿이 가른다 — 글쓰기는 본문에 딸린 파일(WORKS 글쓰기 화면의 자료 패널과
          같은 자리), 그 외에는 NOTICE. 세울 것이 없으면 empty:hidden으로 칸째 사라진다. */}
      <PageHeader
        title={moduleDisplayName(mod)}
        titleExtra={
          <Badge tone={MODULE_STATUS_TONE[mod.status] ?? 'neutral'}>
            {moduleStatusLabel(mod.status)}
          </Badge>
        }
        description={
          <>
            {/* 안내는 메타가 아니라 지시문이므로 본문 색으로 세운다. */}
            {notice && (
              <span className="block whitespace-pre-line text-gray-800">{notice}</span>
            )}
            <span className={notice ? 'mt-1 block' : 'block'}>
              진행기간 : <span className="tabular-nums">{formatModulePeriod(settings)}</span>
            </span>
          </>
        }
      />
      {/* 글쓰기의 우측 칸은 NOTICE가 아니라 '본문에 딸린 파일'이다. 그래서 잠겼을 때는
          두 칸을 가르지 않고 전체 폭 하나로 덮는다 — 가린 본문 옆에 그 본문의 첨부만
          남으면 가린 의미가 없다. 그 외 템플릿의 우측 NOTICE는 잠금과 무관하게 선다
          (공지는 '지금 무엇을 기다리는 중인가'를 답하는 자리라 오히려 이때 필요하다). */}
      {locked && mod.module_type === 'POST' ? (
        <LockedModuleBody status={mod.status} />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
          <div className="min-w-0">
            {locked ? <LockedModuleBody status={mod.status} /> : <ModuleBody module={mod} />}
          </div>
          <div className="mt-5 min-w-0 empty:hidden lg:mt-0">
            {mod.module_type === 'POST' ? (
              <PostFilesRail moduleId={mod.id} />
            ) : (
              <GuestNoticeRail moduleId={mod.id} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 글쓰기 메뉴 우측의 첨부 파일 — WORKS 글쓰기 화면이 우측에 두는 자료 패널의 게스트판으로,
 * 본문에 딸린 파일을 내려받는 자리다. 파일이 없으면 칸을 세우지 않는다.
 */
function PostFilesRail({ moduleId }: { moduleId: string }) {
  const { data } = useModuleFiles(moduleId)
  if (!data?.length) return null
  return <FileModule moduleId={moduleId} />
}

/**
 * 템플릿별 몸통. 여기 없는 템플릿(평가·성과 등 운영자용 화면이 원본인 것)은 몸통이 없다 —
 * 게스트가 그 메뉴에서 받을 수 있는 사실은 위의 일정과 안내가 이미 다 말했다.
 */
function ModuleBody({ module: mod }: { module: GuestModule }) {
  switch (mod.module_type) {
    case 'POST':
      return <PostModule moduleId={mod.id} />
    case 'LINK':
      return <LinkModule moduleId={mod.id} />
    case 'FILE':
      return <FileModule moduleId={mod.id} />
    default:
      return null
  }
}
