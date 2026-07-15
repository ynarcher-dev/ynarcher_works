import { Button, Checkbox, Modal, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { MODULE_TYPES } from '@/features/ac/config'
import { useEnableModules } from '@/features/ac/detail/detailHooks'
import { MODULE_META } from '@/features/ac/detail/moduleMeta'

/** 비활성 모듈 일괄 추가 모달(점선 '모듈 추가' 카드에서 진입). */
export function AddModulesModal({
  programId,
  open,
  disabledTypes,
  onClose,
}: {
  programId: string
  open: boolean
  disabledTypes: string[]
  onClose: () => void
}) {
  const toast = useToast()
  const enableModules = useEnableModules(programId)
  const [checked, setChecked] = useState<string[]>([])

  const toggle = (type: string) =>
    setChecked((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )

  const onAdd = async () => {
    try {
      await enableModules.mutateAsync(checked)
      toast.show(`${checked.length}개 모듈을 추가했습니다.`, 'success')
      setChecked([])
      onClose()
    } catch {
      toast.show('모듈 추가에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="모듈 추가"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => void onAdd()}
            disabled={checked.length === 0 || enableModules.isPending}
          >
            {checked.length > 0 ? `${checked.length}개 추가` : '추가'}
          </Button>
        </>
      }
    >
      <ul className="space-y-2">
        {MODULE_TYPES.filter((d) => disabledTypes.includes(d.type)).map((def) => {
          const meta = MODULE_META[def.type]
          const Icon = meta?.icon
          return (
            <li key={def.type}>
              <label className="flex cursor-pointer items-center gap-3 rounded-radius-md border border-gray-300 px-4 py-2.5 transition-colors duration-fast hover:bg-gray-25">
                <Checkbox
                  checked={checked.includes(def.type)}
                  onChange={() => toggle(def.type)}
                />
                {Icon && (
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-radius-sm bg-gray-50 text-gray-600">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-body font-medium text-gray-900">
                    {def.label}
                  </span>
                  <span className="block truncate text-caption text-gray-500">
                    {meta?.description ?? ''}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
