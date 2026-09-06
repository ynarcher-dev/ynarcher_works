import { Badge, Button, Card, InfoField, InfoGrid, Spinner } from '@ynarcher/ui'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { ModuleVisibilityBadge } from '@/features/program/detail/ModuleVisibilityBadge'
import { ModuleFormModal } from '@/features/program/detail/ModuleFormModal'
import {
  MODULE_META,
  formatModulePeriod,
  moduleDisplayName,
  moduleStatusMeta,
  moduleTypeLabel,
  readModuleSettings,
} from '@/features/program/detail/moduleMeta'
import { useProgramModules, type Program } from '@/features/program/hooks'
import { useOpenPublicLinkModuleIds } from '@/features/program/publicLinkHooks'

/**
 * 운영 화면 최상단의 모듈 카드(2026-09-06).
 *
 * 세팅을 고치는 자리가 그동안 개요 보드의 목록 한 줄뿐이라, 모듈에 들어와 있던 사람은 기간 하나를
 * 고치려고 개요로 나갔다가 다시 들어와야 했다. 들어와서 하는 일(링크·파일·글을 채우는 일)과 그 일의
 * 조건(기간·담당자·공유 범위)이 다른 화면에 갈려 있던 셈이다.
 *
 * 그래서 **값을 여기에도 적는 것이 아니라 고치는 자리를 하나 더 여는 것**이 이 카드다 — 창은 목록의
 * 연필과 같은 `ModuleFormModal` 하나이고, 여기서 값을 따로 저장하지 않는다(폼이 둘이면 어긋난 날
 * 어느 쪽이 진짜인지 답할 근거가 없다).
 *
 * 모듈은 인자로 받지 않고 목록 캐시에서 id로 되찾는다 — 진입 시점에 들고 온 객체를 그리면 방금
 * 이 카드에서 고친 값이 화면에 반영되지 않는다.
 */
export function ModuleHeaderCard({
  program,
  moduleId,
}: {
  program: Program
  moduleId: string
}) {
  const { data: modules, isLoading } = useProgramModules(program.id)
  // 밖에 열린 문인지는 공유 범위 배지의 톤이 답한다(라벨이 아니라) — 보드 카드와 같은 규칙이다.
  const { data: openLinkIds } = useOpenPublicLinkModuleIds([moduleId])
  const [editOpen, setEditOpen] = useState(false)

  const mod = (modules ?? []).find((m) => m.id === moduleId)

  if (isLoading && !mod) {
    return (
      <Card>
        <Spinner />
      </Card>
    )
  }
  if (!mod) return null

  const meta = MODULE_META[mod.module_type]
  const Icon = meta?.icon
  const status = moduleStatusMeta(mod.status)
  const settings = readModuleSettings(mod.settings)
  // 모듈명 중복 검증용: 같은 사업의 다른 인스턴스 제목(자기 자신 제외).
  const otherTitles = (modules ?? [])
    .filter((m) => m.id !== mod.id)
    .map((m) => m.title ?? '')
    .filter((t) => t.length > 0)

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
            <span className="truncate">{moduleDisplayName(mod)}</span>
          </span>
        }
        /* 설명(운영 메모)은 카드가 지금 무엇을 보고 있는지 말하는 값이라 부제 자리다. */
        subtitle={settings.memo ?? undefined}
        actions={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            <ModuleVisibilityBadge
              visibility={mod.visibility}
              linkOpen={Boolean(openLinkIds?.has(mod.id))}
            />
            {/*
              '수정'이 아니라 '설정'이다 — 아래 카드들이 이미 저마다 '수정'을 들고 있고(링크 수정,
              NOTICE 수정, 글 수정) 그 둘은 고치는 대상이 다르다. 같은 화면에서 같은 말이 다른
              것을 가리키면 어느 쪽이 무엇을 여는지 눌러 봐야 안다.
            */}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              설정
            </Button>
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
    </>
  )
}
