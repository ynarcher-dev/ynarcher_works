import {
  Badge,
  BoardEmptyRow,
  BoardItemCard,
  Card,
  DashedAddButton,
  ExpandToggleButton,
  FullscreenPanel,
  IconButton,
  Spinner,
  ViewToggleGroup,
  useToast,
} from '@ynarcher/ui'
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
import { useState } from 'react'
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
  formatModulePeriod,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'
import { useOpenPublicLinkModuleIds } from '@/features/program/publicLinkHooks'

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
  // 밖에 열린 문이 어느 카드인지 — 목록 로딩보다 먼저 서야 하므로 조기 반환 위에서 부른다.
  const { data: openLinkIds } = useOpenPublicLinkModuleIds((data ?? []).map((m) => m.id))

  if (isLoading) {
    return (
      <Card title="프로그램">
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

  /**
   * 모듈 진입: 전체 화면 오버레이를 닫은 뒤 상세 페이지의 운영 화면으로 넘긴다.
   * 기본 3종(글쓰기·URL첨부·파일첨부)도 같은 길이다 — 이동할 탭 키는 moduleMeta의 `tab`이 정한다.
   */
  const openModule = (mod: ProgramModule) => {
    setExpanded(false)
    onOpenModule(mod)
  }

  const viewToggle = (
    <ViewToggleGroup
      value={view}
      onChange={setView}
      options={VIEW_OPTIONS.map(({ key, label, icon: Icon }) => ({
        key,
        label,
        icon: <Icon className="h-4 w-4" />,
      }))}
    />
  )

  const expandButton = (
    <ExpandToggleButton
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      expandIcon={<Maximize2 className="h-4 w-4" />}
      collapseIcon={<Minimize2 className="h-4 w-4" />}
    />
  )

  const body = (
    <>
      {view === 'kanban' && (
        <ModuleKanbanView programId={programId} modules={enabled} onOpenModule={openModule} />
      )}
      {view === 'gantt' && <ModuleGanttView modules={enabled} onOpenModule={openModule} />}
      {view === 'list' && (
        <>
          <ul className="space-y-2">
            {enabled.map((mod) => {
              const meta = MODULE_META[mod.module_type]
              const status = moduleStatusMeta(mod.status)
              const settings = readModuleSettings(mod.settings)
              return (
                <li key={mod.id}>
                  <BoardItemCard
                    onClick={() => openModule(mod)}
                    leading={meta?.emoji}
                    title={nameOf(mod)}
                    badges={
                      <>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <Badge tone={MODULE_VISIBILITY_TONE[mod.visibility] ?? 'neutral'}>
                          {MODULE_VISIBILITY_LABEL[mod.visibility] ?? 'WORKS ONLY'}
                        </Badge>
                        {/* 링크 공유는 공유 범위와 다른 축이라 배지도 따로 선다 — 하나로
                            합치면 '누가 보는가'와 '밖에 열렸는가'가 한 칸에 섞인다. */}
                        {openLinkIds?.has(mod.id) && <Badge tone="warning">링크 공유</Badge>}
                        {/* 파생 템플릿 배지 — 원천 템플릿을 다른 배지와 함께 표기. */}
                        <Badge tone="neutral">{labelOf(mod.module_type)}</Badge>
                      </>
                    }
                    description={settings.memo ?? meta?.description ?? ''}
                    meta={
                      <>
                        <span className="tabular-nums">
                          {formatModulePeriod(settings)}
                        </span>
                        {mod.assignees.length > 0 && (
                          <span className="border-l border-gray-200 pl-2">
                            <span className="font-semibold">담당</span>{' '}
                            {mod.assignees.map((a) => a.user?.name ?? '이름 미상').join(', ')}
                          </span>
                        )}
                      </>
                    }
                    /* 상시 노출 액션: 설정(연필)/끄기(X). 카드 클릭과 겹치지 않는 레이어에 놓인다. */
                    actions={
                      <>
                        <IconButton
                          title="모듈 설정"
                          label={`${nameOf(mod)} 설정`}
                          onClick={() => setEditTarget(mod)}
                          icon={<Pencil className="h-3.5 w-3.5" />}
                        />
                        <IconButton
                          title="모듈 끄기"
                          label={`${nameOf(mod)} 끄기`}
                          danger
                          onClick={() => void onDisable(mod)}
                          icon={<X className="h-3.5 w-3.5" />}
                        />
                      </>
                    }
                  />
                </li>
              )
            })}
            {enabled.length === 0 && (
              <li>
                <BoardEmptyRow>
                  활성화된 모듈이 없습니다. 아래에서 모듈을 추가하세요.
                </BoardEmptyRow>
              </li>
            )}
          </ul>

          <DashedAddButton
            className="mt-2"
            onClick={() => setAddOpen(true)}
            icon={<Plus className="h-4 w-4" />}
          >
            프로그램 추가
          </DashedAddButton>
        </>
      )}
    </>
  )

  return (
    <>
      <Card
        title="프로그램"
        actions={
          <div className="flex items-center gap-2">
            {viewToggle}
            {expandButton}
          </div>
        }
      >
        {body}
      </Card>

      <FullscreenPanel
        open={expanded}
        onClose={() => setExpanded(false)}
        title={
          <>
            <span className="text-title-sm font-medium text-gray-900">프로그램</span>
            <Badge tone="neutral">{program.title}</Badge>
          </>
        }
        actions={
          <>
            {viewToggle}
            {expandButton}
          </>
        }
      >
        {body}
      </FullscreenPanel>

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
