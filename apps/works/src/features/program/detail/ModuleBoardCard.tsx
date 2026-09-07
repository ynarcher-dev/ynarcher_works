import {
  Badge,
  BoardEmptyRow,
  BoardItemCard,
  Card,
  DashedAddButton,
  ExpandToggleButton,
  FullscreenPanel,
  Spinner,
  ViewToggleGroup,
} from '@ynarcher/ui'
import {
  ChartGantt,
  ListOrdered,
  Maximize2,
  Minimize2,
  Plus,
  SquareKanban,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { MODULE_TYPES } from '@/features/program/config'
import { ModuleVisibilityBadge } from '@/features/program/detail/ModuleVisibilityBadge'
import {
  useIsProgramPm,
  useProgramModules,
  type Program,
  type ProgramModule,
} from '@/features/program/hooks'
import { AddModulesModal } from '@/features/program/detail/AddModulesModal'
import { DisabledModuleSection } from '@/features/program/detail/DisabledModuleSection'
import { ModuleDeleteModal } from '@/features/program/detail/ModuleDeleteModal'
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
  { key: 'list', label: '시작일순', icon: ListOrdered },
  { key: 'kanban', label: '칸반', icon: SquareKanban },
  { key: 'gantt', label: '간트', icon: ChartGantt },
]

const typeOrder = new Map(MODULE_TYPES.map((d, i) => [d.type, i]))
const labelOf = (type: string) => MODULE_TYPES.find((d) => d.type === type)?.label ?? type
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
 * 목록 뷰: 활성 인스턴스 카드 나열(모듈명·템플릿 배지·상태·공유·기간·담당자) + 하단 점선 카드로 모듈 추가.
 * 추가는 2단계(템플릿 선택 → 세팅)이며, 편집은 세팅 폼을 재사용한다. 칸반: 상태 컬럼. 간트: 일정 막대.
 *
 * **켜진 모듈의 액션(설정·끄기·삭제)은 여기 없다**(2026-09-06 이동) — 그 모듈의 운영 화면
 * 최상단 카드(`ModuleHeaderCard`)가 소유한다. 목록의 행은 '들어가는 길' 하나만 답하고, 관리는
 * 들어가서 한다. 이 파일에 세팅·삭제 창이 남아 있는 것은 **꺼진 모듈** 때문이다 — 그쪽은 들어갈
 * 운영 화면이 없으므로 접힌 줄이 계속 자기 자리에서 다룬다.
 */
export function ModuleBoardCard({
  program,
  onOpenModule,
}: {
  program: Program
  onOpenModule: (module: ProgramModule) => void
}) {
  const programId = program.id
  const { data, isLoading } = useProgramModules(programId)
  // 삭제는 이 사업의 PM만 한다(서버가 최종 판정). 아닌 사람에게는 버튼을 세우지 않는다 —
  // 누를 수 있게 보여 두고 눌렀을 때 거절하는 것은 파괴적 액션에서 특히 나쁜 안내다.
  // 켜진 모듈의 삭제는 운영 화면 최상단 카드가 가져갔고, 여기 남은 것은 꺼진 모듈 줄뿐이다.
  const { data: isPm } = useIsProgramPm(programId)
  const [editTarget, setEditTarget] = useState<ProgramModule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProgramModule | null>(null)
  // 2단계 마법사: 템플릿 선택(addOpen) → 세팅(createType 지정 시 폼).
  const [addOpen, setAddOpen] = useState(false)
  const [createType, setCreateType] = useState<string | null>(null)
  const [view, setView] = useState<BoardView>('list')
  const [expanded, setExpanded] = useState(false)
  // 밖에 열린 문이 어느 카드인지 — 목록 로딩보다 먼저 서야 하므로 조기 반환 위에서 부른다.
  const { data: openLinkIds } = useOpenPublicLinkModuleIds((data ?? []).map((m) => m.id))

  if (isLoading) {
    return (
      <Card title="WORK">
        <Spinner />
      </Card>
    )
  }

  const modules = data ?? []
  const enabled = sortModules(modules.filter((m) => m.enabled))
  // 꺼진 인스턴스는 운영 목록에서 빠지되 사라지지는 않는다 — 되돌리는 자리는 목록 하단이다.
  const disabled = sortModules(modules.filter((m) => !m.enabled))
  // 모듈명 중복 검증용: 편집 대상 자신은 제외한 나머지 인스턴스 제목.
  const titlesExcept = (id: string | undefined) =>
    modules
      .filter((m) => m.id !== id)
      .map((m) => m.title ?? '')
      .filter((t) => t.length > 0)

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
          <ol>
            {enabled.map((mod, index) => {
              const meta = MODULE_META[mod.module_type]
              const status = moduleStatusMeta(mod.status)
              const settings = readModuleSettings(mod.settings)
              const hasNext = index < enabled.length - 1
              return (
                <li key={mod.id} className={hasNext ? 'flex gap-2 pb-2' : 'flex gap-2'}>
                  {/* 목록이 독립 카드 묶음이 아니라 시작일순 흐름으로 읽히도록, 표 밀도의
                      순번과 디자인 시스템의 hairline을 한 축으로 잇는다. */}
                  <span className="flex w-icon-table shrink-0 flex-col items-center" aria-hidden>
                    <span className="mt-2 grid size-icon-table place-items-center rounded-full border border-gray-300 bg-gray-50 text-caption font-semibold tabular-nums text-gray-700">
                      {index + 1}
                    </span>
                    {hasNext && <span className="mt-1 w-px flex-1 bg-gray-300" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <BoardItemCard
                      onClick={() => openModule(mod)}
                      leading={meta?.emoji}
                      title={nameOf(mod)}
                      badges={
                        <>
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span className="ml-auto flex shrink-0 items-center gap-2">
                            {/* 공유 범위는 한 축이므로 배지도 하나다(2026-09-03). PUBLIC_LINK
                                배지 자체가 "밖으로 나간다"를 말하고, 지금 실제로 열려 있는지는
                                라벨이 아니라 톤이 답한다. */}
                            <ModuleVisibilityBadge
                              visibility={mod.visibility}
                              linkOpen={Boolean(openLinkIds?.has(mod.id))}
                            />
                            {/* 파생 템플릿 배지 — 원천 템플릿을 다른 배지와 함께 표기. */}
                            <Badge tone="neutral">{labelOf(mod.module_type)}</Badge>
                          </span>
                        </>
                      }
                      description={settings.memo ?? meta?.description ?? ''}
                      meta={
                        <>
                          <span className="tabular-nums">{formatModulePeriod(settings)}</span>
                          {/* 비어 있을 때 칸을 지우지 않는다 — 담당자가 없는 것과 아직 못 읽은
                              것이 같은 모양이 되고, 사업 담당자에서 빠지며 모듈 담당이 함께
                              비워진 모듈을 아무도 알아채지 못한다. 다시 정해야 하는 상태다. */}
                          <span className="border-l border-gray-200 pl-2">
                            <span className="font-semibold">담당</span>{' '}
                            {mod.assignees.length > 0 ? (
                              mod.assignees.map((a) => a.user?.name ?? '이름 미상').join(', ')
                            ) : (
                              <span className="text-warning">미지정</span>
                            )}
                          </span>
                        </>
                      }
                      /* 액션은 두지 않는다(2026-09-06) — 설정·끄기·삭제는 모듈 운영 화면 최상단의
                         모듈 카드가 소유한다. 목록의 행은 '들어가는 길' 하나만 답한다. */
                    />
                  </div>
                </li>
              )
            })}
            {enabled.length === 0 && (
              <li>
                <BoardEmptyRow>활성화된 모듈이 없습니다. 아래에서 모듈을 추가하세요.</BoardEmptyRow>
              </li>
            )}
          </ol>

          <DashedAddButton
            className="mt-2"
            onClick={() => setAddOpen(true)}
            icon={<Plus className="h-4 w-4" />}
          >
            WORK 추가
          </DashedAddButton>

          <DisabledModuleSection
            modules={disabled}
            programId={programId}
            canDelete={Boolean(isPm)}
            onDelete={setDeleteTarget}
            onOpenSettings={setEditTarget}
          />
        </>
      )}
    </>
  )

  return (
    <>
      <Card
        title="WORK"
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
            <span className="text-title-sm font-medium text-gray-900">WORK</span>
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

      {/* 삭제: 되돌릴 수 없는 물리 삭제. 끄기와 다른 창을 쓴다. */}
      {deleteTarget && (
        <ModuleDeleteModal
          module={deleteTarget}
          programId={programId}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
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
