import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * GUEST 앱 단위 테스트 러너(브라우저 환경 불필요).
 *
 * `src`만 담는다 — Edge Function 테스트는 WORKS 러너가 `supabase/functions/**`로 이미 돌린다.
 * 기본 환경은 `node`다. 실제 DOM이 필요한 테스트는 파일 상단 `// @vitest-environment jsdom`
 * 지시로 자기만 올린다(`src/lib/richText.test.ts`) — 이유가 그 파일 안에 남고, DOM이 필요
 * 없는 나머지 테스트의 실행 조건은 그대로다.
 * `env`는 `src/lib/env.ts`가 모듈 로드 시점에 VITE_ 변수를 검증하기 때문에 필요하며, 형식만
 * 맞춘 가짜다(테스트는 fetch를 세워 두고 네트워크로 나가지 않음을 확인한다).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_APP_ENV: 'local',
    },
  },
})
