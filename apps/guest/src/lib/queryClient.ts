import { QueryClient } from '@tanstack/react-query'

/**
 * GUEST 앱 전역 TanStack Query 클라이언트.
 * 모바일 네트워크 환경을 고려해 재요청을 보수적으로 설정합니다.
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
