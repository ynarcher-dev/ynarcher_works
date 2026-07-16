import { Button, Modal } from '@ynarcher/ui'
import { useState } from 'react'
import { MODULE_TYPES, type ModuleTypeDef } from '@/features/ac/config'
import { MODULE_META } from '@/features/ac/detail/moduleMeta'

/** 기본(추천) 템플릿 — 활동 유형을 정하지 못했을 때의 출발점. 최초 선택값으로도 사용한다. */
const DEFAULT_TYPE = 'CUSTOM_ACTIVITY'
/** 좌측 그리드에서 제외할 타입: 성과/KPI는 이 화면에서 배치하지 않는다. */
const EXCLUDED = new Set(['OUTCOMES', DEFAULT_TYPE])

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
  const [picked, setPicked] = useState<string>(DEFAULT_TYPE)
  // 설명 패널 미리보기: 마우스 오버/포커스 대상 우선, 없으면 선택된 템플릿.
  const [hovered, setHovered] = useState<string | null>(null)

  const baseDefs = MODULE_TYPES.filter((def) => def.type === DEFAULT_TYPE)
  const operatingDefs = MODULE_TYPES.filter((def) => !EXCLUDED.has(def.type))

  const activeType = hovered ?? picked
  const activeDef = MODULE_TYPES.find((def) => def.type === activeType) ?? null
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
          onClick={() => setPicked(def.type)}
          onMouseEnter={() => setHovered(def.type)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(def.type)}
          onBlur={() => setHovered(null)}
          className={`flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-radius-md border p-1.5 text-center transition-colors duration-fast ${
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
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-caption font-semibold text-gray-500">기본 템플릿</h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2.5">
              {baseDefs.map(tile)}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-caption font-semibold text-gray-500">운영 템플릿</h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2.5">
              {operatingDefs.map(tile)}
            </ul>
          </section>
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
            <p className="text-caption text-gray-400">
              템플릿에 마우스를 올리거나 선택하면 설명이 표시됩니다.
            </p>
          )}
        </aside>
      </div>
    </Modal>
  )
}
