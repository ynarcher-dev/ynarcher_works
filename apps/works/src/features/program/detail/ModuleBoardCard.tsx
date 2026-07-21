import { Badge, Card, Spinner, useToast } from '@ynarcher/ui'
import {
  ChartGantt,
  List,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  SquareKanban,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MODULE_TYPES,
  MODULE_VISIBILITY_LABEL,
  MODULE_VISIBILITY_TONE,
} from '@/features/program/config'
import {
  useProgramModules,
  useToggleModule,
  type Program,
  type ProgramModule,
} from '@/features/program/hooks'
import { AddModulesModal } from '@/features/program/detail/AddModulesModal'
import { ModuleFormModal } from '@/features/program/detail/ModuleFormModal'
import { ModuleGanttView } from '@/features/program/detail/ModuleGanttView'
import { ModuleKanbanView } from '@/features/program/detail/ModuleKanbanView'
import {
  MODULE_META,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'

type BoardView = 'list' | 'kanban' | 'gantt'

const VIEW_OPTIONS: { key: BoardView; label: string; icon: LucideIcon }[] = [
  { key: 'list', label: '목록', icon: List },
  { key: 'kanban', label: '칸반', icon: SquareKanban },
  { key: 'gantt', label: '간트', icon: ChartGantt },
]

const typeOrder = new Map(MODULE_TYPES.map((d, i) => [d.type, i]))
const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type
/** 인스턴스 표시명: 모듈명(자율 입력) 우선, 없으면 템플릿 라벨 폴백. */
const nameOf = (mod: ProgramModule) => mod.title?.trim() || labelOf(mod.module_type)

/** 활성 모듈 정렬: 시작일 오름차순 → 모듈 표준 순서. */
function sortModules(modules: ProgramModule[]): ProgramModule[] {
  return [...modules].sort((a, b) => {
    const sa = readModuleSettings(a.settings).start_date ?? '9999'
    const sb = readModuleSettings(b.settings).start_date ?? '9999'
    if (sa !== sb) return sa.localeCompare(sb)
    return (typeOrder.get(a.module_type) ?? 99) - (typeOrder.get(b.module_type) ?? 99)
  })
}

/**
 * 운영 모듈 보드(상세 개요 좌측 카드). 헤더 토글로 목록·칸반·간트 3개 뷰를 전환한다.
 * 목록 뷰: 활성 인스턴스 카드 나열(모듈명·템플릿 배지·상태·공유·기간·담당자, 호버 시 설정/끄기) + 하단 점선 카드로 모듈 추가.
 * 추가는 2단계(템플릿 선택 → 세팅)이며, 편집은 세팅 폼을 재사용한다. 칸반: 상태 컬럼. 간트: 일정 막대.
 */
export function ModuleBoardCard({
  program,
  onOpenModule,
}: {
  program: Program
  onOpenModule: (module: ProgramModule) => void
}) {
  const programId = program.id
  const toast = useToast()
  const { data, isLoading } = useProgramModules(programId)
  const toggle = useToggleModule(programId)
  const [editTarget, setEditTarget] = useState<ProgramModule | null>(null)
  // 2단계 마법사: 템플릿 선택(addOpen) → 세팅(createType 지정 시 폼).
  const [addOpen, setAddOpen] = useState(false)
  const [createType, setCreateType] = useState<string | null>(null)
  const [view, setView] = useState<BoardView>('list')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  if (isLoading) {
    return (
      <Card title="운영 프로그램">
        <Spinner />
      </Card>
    )
  }

  const modules = data ?? []
  const enabled = sortModules(modules.filter((m) => m.enabled))
  // 모듈명 중복 검증용: 편집 대상 자신은 제외한 나머지 인스턴스 제목.
  const titlesExcept = (id: string | undefined) =>
    modules.filter((m) => m.id !== id).map((m) => m.title ?? '').filter((t) => t.length > 0)

  const onDisable = async (mod: ProgramModule) => {
    if (!window.confirm(`'${nameOf(mod)}' 모듈을 끄시겠습니까? 데이터는 보존됩니다.`)) return
    try {
      await toggle.mutateAsync({ moduleId: mod.id, enabled: false })
    } catch {
      toast.show('모듈 비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  // 모듈 진입 시에는 전체 화면 오버레이를 닫고 해당 운영 화면으로 이동한다.
  const openModule = (mod: ProgramModule) => {
    setExpanded(false)
    onOpenModule(mod)
  }

  const viewToggle = (
    <span className="flex gap-1">
      {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          title={`${label} 보기`}
          aria-label={`${label} 보기`}
          aria-pressed={view === key}
          onClick={() => setView(key)}
          className={`grid size-icon-card place-items-center rounded-radius-md border transition-colors duration-fast ${
            view === key
              ? 'border-gray-400 bg-gray-100 text-gray-900'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-25 hover:text-gray-700'
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </span>
  )

  const expandButton = (
    <button
      type="button"
      title={expanded ? '축소' : '확대보기'}
      aria-label={expanded ? '축소' : '확대보기'}
      onClick={() => setExpanded((v) => !v)}
      className="flex h-ctl-card items-center gap-1.5 rounded-radius-md border border-gray-300 bg-white px-2.5 text-caption font-medium text-gray-600 transition-colors duration-fast hover:bg-gray-25 hover:text-gray-700"
    >
      {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      <span>{expanded ? '축소' : '확대보기'}</span>
    </button>
  )

  const body = (
    <>
      {view === 'kanban' && (
        <ModuleKanbanView programId={programId} modules={enabled} onOpenModule={openModule} />
      )}
      {view === 'gantt' && <ModuleGanttView modules={enabled} onOpenModule={openModule} />}
      {view === 'list' && (
        <>
          <ul className="space-y-3">
            {enabled.map((mod) => {
              const meta = MODULE_META[mod.module_type]
              const status = moduleStatusMeta(mod.status)
              const settings = readModuleSettings(mod.settings)
              return (
                <li key={mod.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => openModule(mod)}
                    className="w-full rounded-radius-md border border-gray-300 bg-white px-4 py-3 text-left transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25"
                  >
                    {/* 우상단 액션(설정·끄기)과 겹치지 않도록 우측 여백 확보. */}
                    <span className="flex min-w-0 flex-wrap items-center gap-2 pr-16">
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-base leading-none"
                        aria-hidden
                      >
                        {meta?.emoji}
                      </span>
                      <span className="text-body font-semibold text-gray-900">{nameOf(mod)}</span>
                      <Badge tone={status.tone}>
                        {status.label}
                      </Badge>
                      <Badge tone={MODULE_VISIBILITY_TONE[mod.visibility] ?? 'neutral'}>
                        {MODULE_VISIBILITY_LABEL[mod.visibility] ?? '비공개'}
                      </Badge>
                      {/* 파생 템플릿 배지 — 원천 템플릿을 다른 배지와 함께 표기. */}
                      <Badge tone="neutral">
                        {labelOf(mod.module_type)}
                      </Badge>
                    </span>
                    <span className="mt-2 block text-body text-gray-700">
                      {settings.memo ?? meta?.description ?? ''}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-gray-200 pt-2 text-body text-gray-700">
                      <span className="tabular-nums">
                        {settings.start_date && settings.end_date
                          ? `${settings.start_date} ~ ${settings.end_date}`
                          : '일정 미등록'}
                      </span>
                      {mod.assignees.length > 0 && (
                        <span className="border-l border-gray-200 pl-2">
                          <span className="font-semibold">담당</span>{' '}
                          {mod.assignees.map((a) => a.user?.name ?? '이름 미상').join(', ')}
                        </span>
                      )}
                    </span>
                  </button>
                  {/* 상시 노출 액션: 설정(연필)/끄기(X). 세그먼트 그룹으로 묶어 카드 클릭과 분리. */}
                  <span className="absolute right-3 top-3 flex items-center gap-1.5">
                    <button
                      type="button"
                      title="모듈 설정"
                      aria-label={`${nameOf(mod)} 설정`}
                      onClick={() => setEditTarget(mod)}
                      className="grid size-icon-card place-items-center rounded-radius-md border border-gray-300 bg-white text-gray-600 shadow-sm transition-colors duration-fast hover:bg-gray-25 hover:text-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="모듈 끄기"
                      aria-label={`${nameOf(mod)} 끄기`}
                      onClick={() => void onDisable(mod)}
                      className="grid size-icon-card place-items-center rounded-radius-md border border-gray-300 bg-white text-gray-600 shadow-sm transition-colors duration-fast hover:bg-danger-subtle hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              )
            })}
            {enabled.length === 0 && (
              <li className="rounded-radius-md border border-gray-200 bg-gray-25 px-4 py-6 text-center text-body text-gray-600">
                활성화된 모듈이 없습니다. 아래에서 모듈을 추가하세요.
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-radius-md border border-dashed border-gray-300 px-4 py-3 text-gray-700 transition-colors duration-fast hover:border-gray-400 hover:bg-gray-25 hover:text-gray-900"
          >
            <Plus className="h-4 w-4" />
            <span className="text-body font-medium">프로그램 추가</span>
          </button>
        </>
      )}
    </>
  )

  return (
    <>
      <Card
        title="운영 프로그램"
        actions={
          <div className="flex items-center gap-2">
            {viewToggle}
            {expandButton}
          </div>
        }
      >
        {body}
      </Card>

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-[500] flex flex-col bg-gray-25">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-title-sm font-medium text-gray-900">운영 프로그램</span>
                <Badge tone="neutral">
                  {program.title}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {viewToggle}
                {expandButton}
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-6">{body}</div>
          </div>,
          document.body,
        )}

      {/* 편집: 기존 인스턴스 세팅 폼. */}
      {editTarget && (
        <ModuleFormModal
          program={program}
          moduleType={editTarget.module_type}
          module={editTarget}
          existingTitles={titlesExcept(editTarget.id)}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 추가 1단계: 템플릿 선택. */}
      <AddModulesModal
        open={addOpen}
        onPick={(type) => {
          setAddOpen(false)
          setCreateType(type)
        }}
        onClose={() => setAddOpen(false)}
      />

      {/* 추가 2단계: 신규 인스턴스 세팅. */}
      {createType && (
        <ModuleFormModal
          program={program}
          moduleType={createType}
          existingTitles={titlesExcept(undefined)}
          onClose={() => setCreateType(null)}
        />
      )}
    </>
  )
}
