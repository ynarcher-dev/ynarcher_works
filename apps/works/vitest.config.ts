import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// 순수 함수/권한 유틸 단위 테스트 전용(브라우저 환경 불필요).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 앱과 Edge Function이 같은 파서를 쓴다(vite.config.ts 주석 참조).
      '@docparse': fileURLToPath(new URL('../../supabase/functions/_shared/docParse', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      '../../scripts/**/*.test.mjs',
      // Edge Function의 **순수 판정 로직**도 여기서 돈다. 함수 폴더는 Deno로 배포되지만
      // 판정을 담은 모듈은 Deno API를 쓰지 않으므로 같은 러너로 검증할 수 있다. 별도
      // 러너를 세우지 않은 이유는, 테스트가 사는 곳이 둘이 되면 한쪽은 곧 돌지 않기 때문이다.
      '../../supabase/functions/**/*.test.ts',
    ],
    // `src/lib/env.ts`가 모듈 로드 시점에 VITE_ 변수를 검증하므로 러너가 값을 세워 준다.
    // 형식만 맞춘 **가짜**이며 실제 프로젝트를 가리키지 않는다 — 테스트는 fetch를 세워 두고
    // 네트워크로 나가지 않음을 확인한다. GUEST 러너(`apps/guest/vitest.config.ts`)와 같은 값이다.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_APP_ENV: 'local',
    },
  },
})
