import { QueryClient } from '@tanstack/react-query'

/**
 * 앱 전역 TanStack Query 클라이언트.
 * 업무형 대시보드 특성상 과도한 재요청을 줄이도록 기본값을 보수적으로 설정합니다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
