import { Badge, GanttChart, type GanttRow } from '@ynarcher/ui'
import { MODULE_TYPES } from '@/features/program/config'
import type { ProgramModule } from '@/features/program/hooks'
import {
  MODULE_BAR_CLASS,
  MODULE_META,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'

const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type
/** 인스턴스 표시명: 모듈명 우선, 없으면 템플릿 라벨. */
const nameOf = (mod: ProgramModule) => mod.title?.trim() || labelOf(mod.module_type)

/**
 * 운영 모듈 간트 차트 뷰 — settings의 시작/종료일을 공용 간트(GanttChart)에 얹는다.
 *
 * 축·격자·주말 음영·오늘선은 부품이 그리고, **이 파일은 모듈 도메인만 담당한다**:
 * 좌측 라벨(아이콘 + 모듈명 + 상태 태그), 상태별 막대 색(MODULE_BAR_CLASS), 진입 동작,
 * 그리고 일정 미등록 모듈의 하단 나열. 같은 축을 사업 일정안내 탭도 쓰므로 계산은
 * 화면이 아니라 부품이 소유한다.
 */
export function ModuleGanttView({
  modules,
  onOpenModule,
}: {
  modules: ProgramModule[]
  onOpenModule: (module: ProgramModule) => void
}) {
  const dated = modules
    .map((mod) => ({ mod, settings: readModuleSettings(mod.settings) }))
    // 뒤집힌 기간(종료 < 시작)도 미등록으로 본다 — 축에 그릴 수 없는 값을 '등록됨'으로
    // 세면 막대도 없고 하단 나열에도 없는 모듈이 생겨 화면에서 사라진다.
    // 'YYYY-MM-DD'는 사전순 비교가 곧 날짜 비교다.
    .filter(
      (r) =>
        Boolean(r.settings.start_date && r.settings.end_date) &&
        r.settings.end_date! >= r.settings.start_date!,
    )
  const undated = modules.filter((m) => !dated.some((r) => r.mod.id === m.id))

  const rows: GanttRow[] = dated.map(({ mod, settings }) => {
    const status = moduleStatusMeta(mod.status)
    const Icon = MODULE_META[mod.module_type]?.icon
    return {
      key: mod.id,
      start: settings.start_date!,
      end: settings.end_date!,
      barClass: MODULE_BAR_CLASS[mod.status] ?? 'bg-gray-300',
      title: `${nameOf(mod)} · ${settings.start_date} ~ ${settings.end_date} · ${status.label}`,
      onClick: () => onOpenModule(mod),
      label: (
        <>
          {Icon && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-700">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
            {nameOf(mod)}
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </>
      ),
    }
  })

  return (
    <GanttChart
      rows={rows}
      labelHeader="모듈"
      emptyText="일정이 등록된 모듈이 없습니다. 모듈 설정에서 시작/종료일을 입력하세요."
      footer={
        undated.length > 0 ? (
          <UndatedList modules={undated} onOpenModule={onOpenModule} />
        ) : undefined
      }
    />
  )
}

/** 시작/종료일 미등록 모듈의 하단 나열(막대 축 밖). */
function UndatedList({
  modules,
  onOpenModule,
}: {
  modules: ProgramModule[]
  onOpenModule: (module: ProgramModule) => void
}) {
  return (
    <p className="text-caption text-gray-700">
      일정 미등록:{' '}
      {modules.map((m, i) => (
        <span key={m.id}>
          {i > 0 && ' · '}
          <button
            type="button"
            onClick={() => onOpenModule(m)}
            className="rounded-radius-sm text-gray-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
          >
            {nameOf(m)}
          </button>
        </span>
      ))}
    </p>
  )
}
