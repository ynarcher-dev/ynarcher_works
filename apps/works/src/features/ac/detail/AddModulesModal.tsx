import { Badge, Button, Modal } from '@ynarcher/ui'
import { useState } from 'react'
import { MODULE_TYPES } from '@/features/ac/config'
import { MODULE_META } from '@/features/ac/detail/moduleMeta'

/**
 * 모듈 추가 1단계 — 템플릿 선택(단일). 동일 템플릿을 여러 번 배치할 수 있으므로 항상 전체 노출하며,
 * OUTCOMES(성과/KPI)만 단일 인스턴스라 이미 존재하면 비활성한다. 선택 후 2단계(세팅)로 넘긴다.
 */
export function AddModulesModal({
  open,
  outcomesExists,
  onPick,
  onClose,
}: {
  open: boolean
  /** 성과/KPI 인스턴스가 이미 있으면 OUTCOMES 선택을 막는다(프로그램당 1개). */
  outcomesExists: boolean
  onPick: (moduleType: string) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)

  const close = () => {
    setPicked(null)
    onClose()
  }
  const next = () => {
    if (!picked) return
    onPick(picked)
    setPicked(null)
  }

  return (
    <Modal
      open={open}
      onClose={close}
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
      <ul className="space-y-2">
        {MODULE_TYPES.map((def) => {
          const meta = MODULE_META[def.type]
          const Icon = meta?.icon
          const disabled = def.type === 'OUTCOMES' && outcomesExists
          const on = picked === def.type
          return (
            <li key={def.type}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPicked(def.type)}
                className={`flex w-full items-center gap-3 rounded-radius-md border px-4 py-2.5 text-left transition-colors duration-fast ${
                  disabled
                    ? 'cursor-not-allowed border-gray-200 bg-gray-25 opacity-60'
                    : on
                      ? 'border-brand/50 bg-brand-25'
                      : 'border-gray-300 hover:bg-gray-25'
                }`}
              >
                {Icon && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-gray-900">{def.label}</span>
                  <span className="block truncate text-caption text-gray-500">
                    {meta?.description ?? ''}
                  </span>
                </span>
                {disabled && (
                  <Badge tone="neutral" size="sm">
                    배치됨
                  </Badge>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
