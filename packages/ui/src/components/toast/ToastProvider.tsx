import { useCallback, useRef, useState, type ReactNode } from 'react'
import {
  ToastContext,
  type ToastMessage,
  type ToastTone,
} from './ToastContext'
import { ToastItem } from './ToastItem'
import { DensityProvider } from '../../density'

const AUTO_DISMISS_MS = 4000

/**
 * 토스트 프로바이더 + 뷰포트(z-toast). 전역 조작 피드백 표시.
 * 근거: 9_feedback_notification_rules.md, 8_z_index_system_rules.md (z-toast=2000)
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const seq = useRef(0)

  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    seq.current += 1
    const id = `t${seq.current}`
    setToasts((prev) => [...prev, { id, tone, text }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, AUTO_DISMISS_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* 토스트는 앱 어디서 호출되든 같은 크기여야 하므로 밀도를 카드 규격으로 고정한다. */}
      <DensityProvider value="card">
        <div className="fixed bottom-4 right-4 z-toast flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
        </div>
      </DensityProvider>
    </ToastContext.Provider>
  )
}
