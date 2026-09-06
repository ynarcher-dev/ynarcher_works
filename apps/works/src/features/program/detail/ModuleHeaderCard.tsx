import { Badge, Button, Card, InfoField, InfoGrid, Spinner, useToast } from '@ynarcher/ui'
import { Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { ModuleVisibilityBadge } from '@/features/program/detail/ModuleVisibilityBadge'
import { ModuleDeleteModal } from '@/features/program/detail/ModuleDeleteModal'
import { ModuleFormModal } from '@/features/program/detail/ModuleFormModal'
import {
  MODULE_META,
  formatModulePeriod,
  moduleDisplayName,
  moduleStatusMeta,
  moduleTypeLabel,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'
import {
  useIsProgramPm,
  useProgramModules,
  useToggleModule,
  type Program,
} from '@/features/program/hooks'
import { useOpenPublicLinkModuleIds } from '@/features/program/publicLinkHooks'

/**
 * 운영 화면 최상단의 모듈 카드(2026-09-06). 이 모듈을 **관리하는 유일한 자리**다 —
 * 설정 · 끄기 · 삭제가 여기 모여 있고, 개요 보드의 목록 카드에는 액션이 없다.
 *
 * 세팅을 고치는 자리가 그동안 개요 보드의 목록 한 줄뿐이라, 모듈에 들어와 있던 사람은 기간 하나를
 * 고치려고 개요로 나갔다가 다시 들어와야 했다. 들어와서 하는 일(링크·파일·글을 채우는 일)과 그 일의
 * 조건(기간·담당자·공유 범위)이 다른 화면에 갈려 있던 셈이다.
 *
 * 그래서 **값을 여기에도 적는 것이 아니라 관리하는 자리를 옮겨 온 것**이 이 카드다 — 여는 창은
 * 종전 목록의 아이콘들이 열던 `ModuleFormModal`·`ModuleDeleteModal` 그대로이고, 여기서 값을 따로
 * 저장하지 않는다(폼이 둘이면 어긋난 날 어느 쪽이 진짜인지 답할 근거가 없다). 선례는 상세 상단바의
 * `DetailDeleteButton`이다 — 목록 관리 컬럼에 있던 파괴적 액션을 상세로 옮겨 온 같은 결정이다.
 *
 * 끄기·삭제 뒤에는 개요로 돌려보낸다(`onGone`) — 꺼진 모듈은 운영 목록에서 빠지고 지운 모듈은
 * 원장에 없으므로, 그 자리에 그대로 두면 화면이 사라진 것을 계속 그리게 된다.
 *
 * 모듈은 인자로 받지 않고 목록 캐시에서 id로 되찾는다 — 진입 시점에 들고 온 객체를 그리면 방금
 * 이 카드에서 고친 값이 화면에 반영되지 않는다.
 */
export function ModuleHeaderCard({
  program,
  moduleId,
  onGone,
}: {
  program: Program
  moduleId: string
  /** 이 모듈이 운영 목록에서 사라졌을 때(끄기·삭제) 돌아갈 길. 보통 개요 복귀다. */
  onGone: () => void
}) {
  const toast = useToast()
  const { data: modules, isLoading } = useProgramModules(program.id)
  // 밖에 열린 문인지는 공유 범위 배지의 톤이 답한다(라벨이 아니라) — 보드 카드와 같은 규칙이다.
  const { data: openLinkIds } = useOpenPublicLinkModuleIds([moduleId])
  const toggle = useToggleModule(program.id)
  // 삭제는 이 사업의 PM만 한다(서버가 최종 판정). 아닌 사람에게는 버튼을 세우지 않는다 —
  // 누를 수 있게 보여 두고 눌렀을 때 거절하는 것은 파괴적 액션에서 특히 나쁜 안내다.
  const { data: isPm } = useIsProgramPm(program.id)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const mod = (modules ?? []).find((m) => m.id === moduleId)

  if (isLoading && !mod) {
    return (
      <Card>
        <Spinner />
      </Card>
    )
  }
  if (!mod) return null

  const name = moduleDisplayName(mod)
  const meta = MODULE_META[mod.module_type]
  const Icon = meta?.icon
  const status = moduleStatusMeta(mod.status)
  const settings = readModuleSettings(mod.settings)
  // 모듈명 중복 검증용: 같은 사업의 다른 인스턴스 제목(자기 자신 제외).
  const otherTitles = (modules ?? [])
    .filter((m) => m.id !== mod.id)
    .map((m) => m.title ?? '')
    .filter((t) => t.length > 0)

  /**
   * 끄기(soft off). 되돌릴 수 있는 운영 중단이라 확인창 하나로 끝내고, 되돌리는 자리는 개요 보드
   * 하단의 '꺼진 모듈' 접힌 줄이다 — 어디로 갔는지 문구가 먼저 말한다.
   */
  const onDisable = async () => {
    if (!window.confirm(`'${name}' 모듈을 끄시겠습니까? 데이터는 보존됩니다.`)) return
    try {
      await toggle.mutateAsync({ moduleId: mod.id, enabled: false })
      toast.show('모듈을 껐습니다. 개요 하단의 ‘꺼진 모듈’에서 다시 켤 수 있습니다.', 'success')
      onGone()
    } catch {
      toast.show('모듈 비활성화에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <>
      <Card
        title={
          <span className="flex min-w-0 items-center gap-2">
            {Icon && (
              <span className="grid size-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
                <Icon className="size-4" />
              </span>
            )}
            <span className="truncate">{name}</span>
            {/* 배지는 제목 옆이다(2026-09-06 사용자 지정) — 상태·공유 범위는 이 모듈이 '무엇인가'를
                말하는 값이라 이름에 붙어 읽혀야 한다. 우측 액션 줄에 두면 누르는 것들 사이에 끼어
                눌리는 것처럼 보이고, 무엇에 대한 상태인지도 줄 끝에서 되짚게 된다.
                긴 이름이 배지를 밀어내지 않는 것은 이름만 줄이고(truncate) 배지가 스스로
                shrink-0·nowrap이기 때문이다(Badge가 소유하는 규격이라 여기서 다시 적지 않는다). */}
            <Badge tone={status.tone}>{status.label}</Badge>
            <ModuleVisibilityBadge
              visibility={mod.visibility}
              linkOpen={Boolean(openLinkIds?.has(mod.id))}
            />
          </span>
        }
        /* 설명(운영 메모)은 카드가 지금 무엇을 보고 있는지 말하는 값이라 부제 자리다. */
        subtitle={settings.memo ?? undefined}
        actions={
          <>
            {/*
              세 액션은 위험도 순으로 선다(설정 → 끄기 → 삭제). 아이콘만 두지 않고 라벨을 붙이는
              것은, 목록에서는 행마다 반복되어 아이콘이 자리를 벌었지만 여기서는 한 번만 서기
              때문이다 — 되돌릴 수 없는 삭제를 아이콘 하나로 두면 무엇을 누르는지 커서를 올려야 안다.

              '수정'이 아니라 '설정'인 이유: 아래 카드들이 이미 저마다 '수정'을 들고 있고(링크 수정,
              NOTICE 수정, 글 수정) 고치는 대상이 다르다. 같은 화면에서 같은 말이 다른 것을 가리키면
              어느 쪽이 무엇을 여는지 눌러 봐야 안다.
            */}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              설정
            </Button>
            {/* 끄기는 되돌릴 수 있는 운영 중단이라 위험색을 두지 않는다. 색은 삭제만 쓴다. */}
            <Button variant="outline" onClick={() => void onDisable()} disabled={toggle.isPending}>
              <X className="size-4" />
              끄기
            </Button>
            {isPm && (
              <Button variant="outline-danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                삭제
              </Button>
            )}
          </>
        }
      >
        <InfoGrid>
          {/* 템플릿은 배지가 아니라 라벨:값이다 — 색은 상태에만 쓴다(5_component_spec_rules §3.4).
              보드 카드가 배지로 두는 것은 라벨을 적을 자리가 없어서이고, 여기는 있다. */}
          <InfoField label="템플릿" value={moduleTypeLabel(mod.module_type)} />
          <InfoField label="기간" value={formatModulePeriod(settings)} />
          <InfoField
            label="담당"
            value={
              mod.assignees.length > 0 ? (
                mod.assignees.map((a) => a.user?.name ?? '이름 미상').join(', ')
              ) : (
                /* 비어 있어도 칸을 지우지 않는다 — 담당자가 없는 것과 아직 못 읽은 것이 같은
                   모양이 되면, 사업 담당자에서 빠지며 함께 비워진 모듈을 아무도 알아채지 못한다. */
                <span className="text-warning">미지정</span>
              )
            }
          />
        </InfoGrid>
      </Card>

      {editOpen && (
        <ModuleFormModal
          program={program}
          moduleType={mod.module_type}
          module={mod}
          existingTitles={otherTitles}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* 삭제: 되돌릴 수 없는 물리 삭제. 끄기와 다른 축이라 창을 따로 쓴다(따라쓰기 확인·잔존 고지). */}
      {deleteOpen && (
        <ModuleDeleteModal
          module={mod}
          programId={program.id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false)
            onGone()
          }}
        />
      )}
    </>
  )
}
