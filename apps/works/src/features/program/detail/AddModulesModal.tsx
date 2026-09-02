import { moduleTypeLabel } from '@ynarcher/master-data'
import { Button, Modal } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import type { ModuleTypeDef } from '@/features/program/config'
import { MODULE_META } from '@/features/program/detail/moduleMeta'
import { MODULE_CATEGORIES, useModuleTemplates } from '@/features/program/moduleTemplateHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 최초 선택값 — 기본 3종 중 가장 범용인 글쓰기. 활동 유형을 정하지 못했을 때의 출발점이다. */
const DEFAULT_TYPE = 'POST'
/**
 * 모듈 추가 1단계 — 템플릿 선택(단일). 좌측은 정방형 타일 그리드(기본/운영 템플릿),
 * 우측은 마우스를 올리거나 선택한 템플릿의 상세 설명 패널이다. 선택 후 2단계(세팅)로 넘긴다.
 */
export function AddModulesModal({
  open,
  onPick,
  onClose,
}: {
  open: boolean
  onPick: (moduleType: string) => void
  onClose: () => void
}) {
  const config = useProgramWorkspace()
  const [picked, setPicked] = useState<string>(DEFAULT_TYPE)
  // 설명 패널 미리보기: 마우스 오버/포커스 대상 우선, 없으면 선택된 템플릿.
  const [hovered, setHovered] = useState<string | null>(null)

  // 목록·분류·순서는 ADMIN이 배치한 카탈로그가 답한다(3_2_1). 화면은 정렬 규칙을 스스로
  // 갖지 않고 원장이 준 순서대로 그린다 — 두 벌이면 ADMIN이 고친 순서가 여기만 안 바뀐다.
  const { data: templates = [] } = useModuleTemplates()
  const sections = useMemo(() => {
    const usable = templates.filter(
      (t) => t.is_active && t.workspaces.includes(config.key),
    )
    return MODULE_CATEGORIES.map((c) => ({
      label: c.label,
      defs: usable
        .filter((t) => t.category === c.key)
        .map<ModuleTypeDef>((t) => ({
          type: t.key,
          label: moduleTypeLabel(t.key),
          implemented: true,
        })),
    })).filter((s) => s.defs.length > 0)
  }, [templates, config.key])

  const allowedDefs = useMemo(() => sections.flatMap((s) => s.defs), [sections])

  const activeType = hovered ?? picked
  const activeDef = allowedDefs.find((def) => def.type === activeType) ?? null
  const activeMeta = activeType ? MODULE_META[activeType] : null

  const close = () => {
    setPicked(DEFAULT_TYPE)
    setHovered(null)
    onClose()
  }
  const next = () => {
    onPick(picked)
    setPicked(DEFAULT_TYPE)
    setHovered(null)
  }

  const tile = (def: ModuleTypeDef) => {
    const meta = MODULE_META[def.type]
    const on = picked === def.type
    return (
      <li key={def.type}>
        <button
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => setPicked(def.type)}
          onMouseEnter={() => setHovered(def.type)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(def.type)}
          onBlur={() => setHovered(null)}
          className={`flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-radius-md border p-1.5 text-center transition-colors duration-fast focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 ${
            on ? 'border-brand/50 bg-brand-25' : 'border-gray-300 hover:bg-gray-25'
          }`}
        >
          <span className="text-xl leading-none" aria-hidden>
            {meta?.emoji}
          </span>
          <span className="text-caption font-medium leading-tight text-gray-900">{def.label}</span>
        </button>
      </li>
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="2xl"
      title="모듈 추가 — 템플릿 선택"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            취소
          </Button>
          <Button onClick={next} disabled={!picked}>
            다음
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_20rem]">
        {/* 좌측: 정방형 템플릿 타일 */}
        <div className="space-y-5" role="radiogroup" aria-label="모듈 템플릿">
          {/* 비어 있는 분류는 섹션 자체를 세우지 않는다(그 워크스페이스에 하나도 없는 경우). */}
          {sections.map((s) => (
            <section key={s.label}>
              <h3 className="mb-2 text-caption font-semibold text-gray-600">{s.label}</h3>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2.5">
                {s.defs.map(tile)}
              </ul>
            </section>
          ))}
          {sections.length === 0 && (
            // 빈 목록만 두면 무엇을 해야 하는지 알 수 없다 — 사유를 말한다.
            <p className="rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2 text-caption text-gray-500">
              이 워크스페이스에서 사용할 수 있는 모듈 템플릿이 없습니다. ADMIN 모듈 관리에서
              템플릿을 켜 주세요.
            </p>
          )}
        </div>

        {/* 우측: 선택/미리보기 템플릿 설명 패널 */}
        <aside className="rounded-radius-md border border-gray-200 bg-gray-25 p-5">
          {activeDef && activeMeta ? (
            <div className="space-y-3">
              <span
                className="grid h-12 w-12 place-items-center rounded-radius-md bg-white text-2xl shadow-soft"
                aria-hidden
              >
                {activeMeta.emoji}
              </span>
              <h4 className="text-title-sm font-semibold text-gray-900">{activeDef.label}</h4>
              <p className="text-body leading-relaxed text-gray-700">{activeMeta.detail}</p>
            </div>
          ) : (
            <p className="text-caption text-gray-600">
              템플릿에 마우스를 올리거나 선택하면 설명이 표시됩니다.
            </p>
          )}
        </aside>
      </div>
    </Modal>
  )
}
