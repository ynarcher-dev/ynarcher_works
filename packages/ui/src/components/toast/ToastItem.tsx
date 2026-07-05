import { cn } from '../../utils/cn'
import type { ToastMessage } from './ToastContext'

const toneClass = {
  success: 'border-success-border bg-success-subtle text-success',
  warning: 'border-warning-border bg-warning-subtle text-warning',
  info: 'border-info-border bg-info-subtle text-info',
  danger: 'border-danger-border bg-danger-subtle text-danger',
}

/** 단일 토스트 표시(프레젠테이션). */
export function ToastItem({ toast }: { toast: ToastMessage }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-radius-md border px-3 py-2 text-body shadow-popover',
        toneClass[toast.tone],
      )}
    >
      {toast.text}
    </div>
  )
}
