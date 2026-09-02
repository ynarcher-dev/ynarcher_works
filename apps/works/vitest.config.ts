import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 순수 함수/권한 유틸 단위 테스트 전용(브라우저 환경 불필요).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      // Edge Function의 **순수 판정 로직**도 여기서 돈다. 함수 폴더는 Deno로 배포되지만
      // 판정을 담은 모듈은 Deno API를 쓰지 않으므로 같은 러너로 검증할 수 있다. 별도
      // 러너를 세우지 않은 이유는, 테스트가 사는 곳이 둘이 되면 한쪽은 곧 돌지 않기 때문이다.
      '../../supabase/functions/**/*.test.ts',
    ],
  },
})
