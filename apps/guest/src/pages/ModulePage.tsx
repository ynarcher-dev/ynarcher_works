import { EmptyState, PageHeader, Spinner } from '@ynarcher/ui'
import {
  formatModulePeriod,
  moduleDisplayName,
  readModuleSettings,
} from '@ynarcher/master-data'
import { useParams } from 'react-router-dom'
import { useGuestModules, type GuestModule } from '@/features/moduleHooks'
import { moduleNotice } from '@/features/moduleMeta'
import { BookingModule } from '@/pages/modules/BookingModule'
import { FileModule } from '@/pages/modules/FileModule'
import { LinkModule } from '@/pages/modules/LinkModule'
import { PostModule } from '@/pages/modules/PostModule'
import { SatisfactionModule } from '@/pages/modules/SatisfactionModule'

/**
 * 공개 메뉴 한 개의 화면.
 *
 * 머리(이름 → 안내 → 진행기간)는 모든 템플릿이 공유한다 — WORKS 모듈 카드에서 세팅한 안내와
 * 일정이 게스트 쪽에서 도달하는 자리가 바로 여기이며, 어떤 템플릿이든 최소한 '무엇을 하라는
 * 것인가'와 '언제까지의 일인가'는 답한다. 몸통만 템플릿이 가른다.
 *
 * 상태·템플릿 배지는 세우지 않는다(2026-09-01) — 게스트에게 메뉴가 열려 있다는 사실은 메뉴가
 * 서 있는 것 자체가 말하고, 템플릿 이름은 내부 운영 용어라 참여자에게 답하는 것이 없다.
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

  return (
    <div className="space-y-5">
      <PageHeader
        title={moduleDisplayName(mod)}
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
      <ModuleBody module={mod} />
    </div>
  )
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
    case 'BUSINESS_MATCHING':
      return <BookingModule moduleId={mod.id} />
    case 'MENTORING':
      return <SatisfactionModule moduleId={mod.id} />
    default:
      return null
  }
}
