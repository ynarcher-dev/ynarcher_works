import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'warning' | 'info' | 'danger'

export interface ToastMessage {
  id: string
  tone: ToastTone
  text: string
}

export interface ToastContextValue {
  show: (text: string, tone?: ToastTone) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** 토스트 발행 훅. ToastProvider 하위에서만 사용. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast는 ToastProvider 내부에서만 사용할 수 있습니다.')
  }
  return ctx
}
