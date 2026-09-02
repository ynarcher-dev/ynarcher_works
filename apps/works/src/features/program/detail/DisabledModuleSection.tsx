import { Badge, BoardItemCard, IconButton, useToast } from '@ynarcher/ui'
import { ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { MODULE_TYPES } from '@/features/program/config'
import { useToggleModule, type ProgramModule } from '@/features/program/hooks'
import { MODULE_META, formatModulePeriod, readModuleSettings } from '@/features/program/detail/moduleMeta'

const labelOf = (type: string) => MODULE_TYPES.find((d) => d.type === type)?.label ?? type
const nameOf = (mod: ProgramModule) => mod.title?.trim() || labelOf(mod.module_type)

/**
 * 꺼진 모듈 되돌리기 — 목록 하단의 접힌 줄.
 *
 * 끄기가 '되돌릴 수 있는 운영 중단'이려면 되돌리는 자리가 화면에 있어야 하는데, 그동안 보드는
 * 켜진 인스턴스만 그려서 한 번 끄면 되돌릴 길이 없었다(2026-09-02 보완).
 *
 * 자리를 목록 **안**이 아니라 **아래 접힌 줄**로 잡은 이유는 두 가지가 동시에 참이어야 하기
 * 때문이다 — 끄기의 목적은 운영 목록에서 치우는 것이므로 평상시 섞이면 안 되고, 그럼에도
 * 잊히면 안 되므로 건수는 보여야 한다. 그래서 존재(N개)는 늘 보이고 내용은 접는다.
 * 꺼진 것이 없으면 줄 자체를 세우지 않는다 — 항상 0을 보여 주는 줄은 곧 안 읽히는 줄이 된다.
 *
 * 칸반·간트에 두지 않는 것도 같은 이유다. 꺼진 모듈은 상태 컬럼에도 일정 축에도 설 자리가
 * 없어서, 거기 세우려면 뷰마다 다른 규칙을 하나씩 더 만들어야 한다.
 *
 * 켜기는 끄기와 같은 권한이다(사업 쓰기 권한자). 끄는 것은 아무나 하는데 켜는 것만 PM이면
 * 멤버가 실수로 끈 것을 스스로 되돌리지 못한다. PM 전용은 되돌릴 수 없는 삭제 하나뿐이다.
 */
export function DisabledModuleSection({
  modules,
  programId,
  canDelete,
  onDelete,
  onOpenSettings,
}: {
  /** 꺼진(enabled=false) 인스턴스. 비어 있으면 아무것도 그리지 않는다. */
  modules: ProgramModule[]
  programId: string
  /** 삭제 버튼 노출 여부(이 사업의 PM인가). 실제 차단은 서버가 한다. */
  canDelete: boolean
  onDelete: (mod: ProgramModule) => void
  /**
   * 카드 본문 클릭 — 켜진 카드는 운영 화면으로 들어가지만, 꺼진 카드는 들어갈 운영 화면이
   * 없으므로 세팅을 연다. 켜기 전에 무엇이었는지 확인하는 자리가 필요하고, 카드 전체가
   * 아무 데도 가지 않는 빈 클릭 영역으로 남는 것도 피한다.
   */
  onOpenSettings: (mod: ProgramModule) => void
}) {
  const toast = useToast()
  const toggle = useToggleModule(programId)
  const [open, setOpen] = useState(false)

  if (modules.length === 0) return null

  // 켜기는 확인을 묻지 않는다. 되돌릴 수 있는 행위에 확인창을 붙이면 정작 되돌릴 수 없는
  // 작업의 확인창과 무게가 같아져, 사용자가 둘 다 습관적으로 넘기게 된다.
  const onEnable = async (mod: ProgramModule) => {
    try {
      await toggle.mutateAsync({ moduleId: mod.id, enabled: true })
      toast.show(`'${nameOf(mod)}' 모듈을 다시 켰습니다.`, 'success')
    } catch {
      toast.show('모듈을 켜지 못했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="mt-3 border-t border-gray-200 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded-radius-md px-1 py-1 text-left text-caption text-gray-600 transition-colors duration-fast hover:bg-gray-50 hover:text-gray-800"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <span>꺼진 모듈</span>
        <span className="tabular-nums font-semibold">{modules.length}</span>
        <span>개</span>
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {modules.map((mod) => {
            const meta = MODULE_META[mod.module_type]
            const settings = readModuleSettings(mod.settings)
            return (
              <li key={mod.id}>
                {/* 꺼진 항목은 흐리게 — 같은 무게로 서면 아래로 내려 접은 뜻이 없어진다. */}
                <BoardItemCard
                  className="opacity-60 transition-opacity duration-fast hover:opacity-100"
                  onClick={() => onOpenSettings(mod)}
                  leading={meta?.emoji}
                  title={nameOf(mod)}
                  badges={
                    <>
                      <Badge tone="neutral">꺼짐</Badge>
                      <Badge tone="neutral">{labelOf(mod.module_type)}</Badge>
                    </>
                  }
                  description={settings.memo ?? meta?.description ?? ''}
                  meta={<span className="tabular-nums">{formatModulePeriod(settings)}</span>}
                  actions={
                    <>
                      <IconButton
                        title="모듈 켜기"
                        label={`${nameOf(mod)} 켜기`}
                        onClick={() => void onEnable(mod)}
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                      />
                      {canDelete && (
                        <IconButton
                          title="모듈 삭제"
                          label={`${nameOf(mod)} 삭제`}
                          danger
                          onClick={() => onDelete(mod)}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                        />
                      )}
                    </>
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
