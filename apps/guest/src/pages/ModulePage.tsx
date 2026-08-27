import { Badge, Card, EmptyState, PageHeader, Spinner } from '@ynarcher/ui'
import {
  formatModulePeriod,
  moduleDisplayName,
  moduleStatusLabel,
  moduleTypeLabel,
  readModuleSettings,
} from '@ynarcher/master-data'
import { useParams } from 'react-router-dom'
import { useGuestModules, type GuestModule } from '@/features/moduleHooks'
import { MODULE_STATUS_TONE, moduleNotice } from '@/features/moduleMeta'
import { BookingModule } from '@/pages/modules/BookingModule'
import { FileModule } from '@/pages/modules/FileModule'
import { LinkModule } from '@/pages/modules/LinkModule'
import { PostModule } from '@/pages/modules/PostModule'
import { SatisfactionModule } from '@/pages/modules/SatisfactionModule'

/**
 * 공개 메뉴 한 개의 화면.
 *
 * 머리(이름·상태·기간)는 모든 템플릿이 공유한다 — WORKS 모듈 카드에서 세팅한 일정이 게스트
 * 쪽에서 도달하는 자리가 바로 여기이며, 어떤 템플릿이든 최소한 '언제까지의 일인가'는 답한다.
 * 몸통만 템플릿이 가른다.
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
        titleExtra={
          <span className="flex items-center gap-2">
            <Badge tone={MODULE_STATUS_TONE[mod.status] ?? 'neutral'}>
              {moduleStatusLabel(mod.status)}
            </Badge>
            <Badge tone="neutral">{moduleTypeLabel(mod.module_type)}</Badge>
          </span>
        }
        description={
          <span className="tabular-nums">{formatModulePeriod(settings)}</span>
        }
      />
      {notice && (
        <Card title="안내">
          <p className="whitespace-pre-line text-body text-gray-800">{notice}</p>
        </Card>
      )}
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
