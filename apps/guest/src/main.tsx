import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@/global.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@ynarcher/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('루트 엘리먼트(#root)를 찾을 수 없습니다.')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* 모듈 화면(파일첨부·매칭 예약)이 useToast를 쓴다 — works와 같은 자리(루트)에 마운트한다. */}
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
