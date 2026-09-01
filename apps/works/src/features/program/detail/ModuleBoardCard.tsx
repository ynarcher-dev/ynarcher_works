import {
  Badge,
  Button,
  Card,
  ExpandToggleButton,
  FullscreenPanel,
  Spinner,
  ViewToggleGroup,
  useToast,
} from '@ynarcher/ui'
import {
  ChartGantt,
  Maximize2,
  Minimize2,
  Plus,
  SquareKanban,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { MODULE_TYPES } from '@/features/program/config'
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
import { readModuleSettings } from '@/features/program/detail/moduleMeta'

type BoardView = 'kanban' | 'gantt'

/**
 * 뷰는 둘이다 — 칸반(지금 어느 단계인가)과 간트(무엇과 무엇이 겹치는가).
 * 목록 뷰는 2026-09-01 사용자 지정으로 걷어냈고, 그 뷰에만 있던 설정·끄기는 두 뷰의
 * 카드·라벨로, '프로그램 추가'는 카드 헤더로 옮겼다 — 뷰 하나가 사라진다고 그 뷰에
 * 얹혀 있던 동작까지 사라지면 안 된다.
 */
const VIEW_OPTIONS: { key: BoardView; label: string; icon: LucideIcon }[] = [
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
 * 운영 모듈 보드(상세 개요 좌측 카드). 헤더 토글로 **칸반·간트** 두 뷰를 전환하며 기본은 간트다.
 * 칸반은 상태 컬럼(드래그로 상태 변경), 간트는 기간 막대다. 두 뷰 모두 카드·라벨에서
 * 모듈 설정(연필)·끄기(X)를 열 수 있고, 모듈 추가는 카드 헤더의 버튼이 받는다.
 * 추가는 2단계(템플릿 선택 → 세팅)이며, 편집은 세팅 폼을 재사용한다.
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
  // 기본 뷰는 간트다(2026-09-01 사용자 지정) — 사업 상세를 열고 가장 먼저 묻는 것이
  // '지금 무엇이 돌아가고 언제 끝나는가'이며, 그 물음에 답하는 것은 시간 축이다.
  const [view, setView] = useState<BoardView>('gantt')
  const [expanded, setExpanded] = useState(false)

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

  /**
   * 모듈 추가 — 종전에는 목록 뷰 하단의 점선 카드가 받던 동작이다. 목록을 걷어내면서
   * 뷰와 무관하게 늘 같은 자리에 있어야 하는 동작이 되어 카드 헤더로 올렸다.
   */
  const addButton = (
    <Button variant="secondary" onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" />
      프로그램 추가
    </Button>
  )

  const expandButton = (
    <ExpandToggleButton
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      expandIcon={<Maximize2 className="h-4 w-4" />}
      collapseIcon={<Minimize2 className="h-4 w-4" />}
    />
  )

  const body =
    view === 'kanban' ? (
      <ModuleKanbanView
        programId={programId}
        modules={enabled}
        onOpenModule={openModule}
        onEditModule={setEditTarget}
        onDisableModule={(mod) => void onDisable(mod)}
      />
    ) : (
      <ModuleGanttView
        modules={enabled}
        onOpenModule={openModule}
        onEditModule={setEditTarget}
        onDisableModule={(mod) => void onDisable(mod)}
      />
    )

  return (
    <>
      <Card
        title="프로그램"
        actions={
          <div className="flex items-center gap-2">
            {viewToggle}
            {addButton}
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
            {addButton}
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
