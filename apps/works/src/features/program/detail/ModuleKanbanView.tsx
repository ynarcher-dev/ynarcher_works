import { Badge, PersonCell, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { MODULE_TYPES, MODULE_VISIBILITY_LABEL, MODULE_VISIBILITY_TONE } from '@/features/program/config'
import type { ProgramModule } from '@/features/program/hooks'
import { useUpdateModuleStatus } from '@/features/program/detail/detailHooks'
import { useOpenPublicLinkModuleIds } from '@/features/program/publicLinkHooks'
import {
  MODULE_META,
  formatModulePeriod,
  moduleStatusMeta,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'

const labelOf = (type: string) =>
  MODULE_TYPES.find((d) => d.type === type)?.label ?? type
/** 인스턴스 표시명: 모듈명 우선, 없으면 템플릿 라벨. */
const nameOf = (mod: ProgramModule) => mod.title?.trim() || labelOf(mod.module_type)

/** 칸반 컬럼 순서: 준비 → 진행 → 완료 → 취소 (module_status enum 순). 드래그 드롭 대상으로 상시 노출. */
const COLUMNS = ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']

/** 한글 '(으)로' 조사 선택: 받침 없음/ㄹ 받침 → '로', 그 외 → '으로'. */
function particleRo(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return '로'
  const jong = (code - 0xac00) % 28
  return jong === 0 || jong === 8 ? '로' : '으로'
}

/** 드래그 중인 카드 정보(현재 상태로 무의미한 드롭·유효 컬럼 하이라이트를 판정). */
type Dragging = { id: string; status: string }

/**
 * 운영 모듈 칸반 보드 뷰. 모듈을 상태(준비/진행/완료/취소) 컬럼으로 배치한다.
 * 카드를 다른 컬럼으로 드래그앤드롭하면 해당 상태로 변경한다(낙관적 업데이트, 실패 시 롤백).
 * **상태를 바꾸는 길은 드롭 하나뿐이다** — 카드마다 달려 있던 상태 선택 상자는 걷어냈다
 * (2026-09-02). 카드가 이미 상태 열 안에 서 있는데 그 안에서 상태를 또 고르게 하면, 같은 값을
 * 말하는 자리가 둘이 되어 어느 쪽이 지금 상태인지 카드마다 되읽어야 했다.
 * 카드 클릭은 목록 뷰와 동일하게 해당 운영 화면으로 진입한다(설정/비활성은 목록 뷰에서).
 */
export function ModuleKanbanView({
  programId,
  modules,
  onOpenModule,
}: {
  programId: string
  modules: ProgramModule[]
  onOpenModule: (module: ProgramModule) => void
}) {
  const toast = useToast()
  const updateStatus = useUpdateModuleStatus(programId)
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const [overStatus, setOverStatus] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { data: openLinkIds } = useOpenPublicLinkModuleIds(modules.map((m) => m.id))

  const drop = (status: string) => {
    if (dragging && dragging.status !== status) {
      const moved = modules.find((m) => m.id === dragging.id)
      updateStatus.mutate(
        { moduleId: dragging.id, status },
        {
          // 옮긴 결과는 카드가 다른 열에 가 있는 것으로 눈에 보이지만, 그 이동은 화면을 보는
          // 사람만 읽는다 — 상태 변경을 말로도 한 번 알린다.
          onSuccess: () =>
            setAnnouncement(
              `${moved ? nameOf(moved) : '모듈'} 상태를 ${moduleStatusMeta(status).label}${particleRo(
                moduleStatusMeta(status).label,
              )} 변경했습니다.`,
            ),
          onError: () => toast.show('상태 변경에 실패했습니다. 권한을 확인하세요.', 'danger'),
        },
      )
    }
    setDragging(null)
    setOverStatus(null)
  }

  return (
    <>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
      {COLUMNS.map((status) => {
        const meta = moduleStatusMeta(status)
        const items = modules.filter((m) => (m.status ?? 'DRAFT') === status)
        // 드래그 중인 카드가 이 컬럼으로 이동 가능한지(현재 상태와 다를 때만).
        const isValidTarget = dragging != null && dragging.status !== status
        const isOver = isValidTarget && overStatus === status
        return (
          <div
            key={status}
            onDragOver={(e) => {
              if (!isValidTarget) return
              e.preventDefault() // drop 허용
              if (overStatus !== status) setOverStatus(status)
            }}
            onDragLeave={(e) => {
              // 자식으로 이동하는 dragleave는 무시(컬럼 밖으로 나갈 때만 해제).
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setOverStatus((s) => (s === status ? null : s))
              }
            }}
            onDrop={() => drop(status)}
            className={`rounded-radius-md p-2 transition-colors duration-fast ${
              isOver
                ? 'bg-brand-25 ring-2 ring-brand/40'
                : isValidTarget
                  ? 'bg-gray-25 ring-1 ring-dashed ring-gray-300'
                  : 'bg-gray-25'
            }`}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Badge tone={meta.tone}>
                {meta.label}
              </Badge>
              <span className="text-caption tabular-nums text-gray-700">{items.length}</span>
            </div>
            <ul className="space-y-2">
              {items.map((mod) => {
                const modMeta = MODULE_META[mod.module_type]
                const settings = readModuleSettings(mod.settings)
                const Icon = modMeta?.icon
                const isDragging = dragging?.id === mod.id
                return (
                  <li key={mod.id} className="rounded-radius-md border border-gray-300 bg-white shadow-soft">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        // Firefox는 dataTransfer에 값이 있어야 드래그를 시작한다.
                        e.dataTransfer.setData('text/plain', mod.id)
                        setDragging({ id: mod.id, status: mod.status ?? 'DRAFT' })
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setOverStatus(null)
                      }}
                      onClick={() => onOpenModule(mod)}
                      className={`w-full cursor-grab rounded-radius-md px-3 py-2.5 text-left transition-colors duration-fast hover:bg-gray-25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 active:cursor-grabbing ${
                        isDragging ? 'opacity-40' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {Icon && (
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-700">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                        )}
                        <span className="truncate text-body font-semibold text-gray-900">
                          {nameOf(mod)}
                        </span>
                      </span>
                      {/* 세션 종류 → 공개범위 → 기간 → 담당자를 각각 한 줄로 세운다. 배지 둘을
                          제목 줄과 나눠 세로로 세우는 이유는, 카드 폭이 좁아 셋이 한 줄에 서면
                          긴 모듈명부터 잘려 무엇의 카드인지가 배지에 밀리기 때문이다. 세로로
                          서면 같은 자리가 카드마다 같은 것을 말해 위에서 아래로 훑을 수 있다. */}
                      <span className="mt-1.5 flex">
                        <Badge tone="neutral">{labelOf(mod.module_type)}</Badge>
                      </span>
                      <span className="mt-1 flex">
                        <Badge tone={MODULE_VISIBILITY_TONE[mod.visibility] ?? 'neutral'}>
                          {MODULE_VISIBILITY_LABEL[mod.visibility] ?? 'WORKS ONLY'}
                        </Badge>
                        {/* 링크 공유는 다른 축이라 배지를 합치지 않고 같은 줄에 나란히 둔다. */}
                        {openLinkIds?.has(mod.id) && (
                          <Badge tone="warning" className="ml-1">
                            링크 공유
                          </Badge>
                        )}
                      </span>
                      <span className="mt-1 block truncate text-caption tabular-nums text-gray-700">
                        {formatModulePeriod(settings)}
                      </span>
                      {/* 몇 명까지 적을지는 개수가 아니라 카드 폭이 정한다(PersonCell). */}
                      <span className="mt-1 flex min-w-0 text-caption text-gray-700">
                        <PersonCell
                          names={mod.assignees.map((a) => a.user?.name)}
                          empty="담당자 미지정"
                        />
                      </span>
                    </button>
                  </li>
                )
              })}
              {/* 상시 빈 슬롯: 카드 아래에 점선으로 드롭 가능 위치를 항상 보여준다.
                  드래그 중(다른 상태의 카드)엔 이 상태로의 변경을 유도하고, 조준 시 강조한다. */}
              <li
                className={`rounded-radius-md border border-dashed px-3 py-4 text-center text-caption transition-colors duration-fast ${
                  isOver
                    ? 'border-brand/50 bg-brand-25 text-brand'
                    : isValidTarget
                      ? 'border-gray-300 text-gray-600'
                      : items.length === 0
                        ? 'border-gray-200 text-gray-600'
                        : 'border-gray-200 text-gray-400'
                }`}
              >
                {isValidTarget
                  ? `여기에 놓아 '${meta.label}'${particleRo(meta.label)} 변경`
                  : items.length === 0
                    ? '해당 상태의 모듈이 없습니다'
                    : '빈 슬롯'}
              </li>
            </ul>
          </div>
        )
      })}
      </div>
    </>
  )
}
