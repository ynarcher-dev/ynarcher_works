import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@/global.css'
import { QueryClientProvider } from '@tanstack/react-query'
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
