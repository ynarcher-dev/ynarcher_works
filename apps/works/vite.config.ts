import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * `@docparse`는 자료 분석 파서다 — 실제 파일은 `supabase/functions/_shared/docParse`에 있다.
 *
 * **앱과 Edge Function이 같은 파서를 써야 한다**(3_3_5 §16.2). 파일 분석은 브라우저 Web
 * Worker가 하고, 캐시가 없는 옛 경로에서는 Edge Function이 같은 파일을 연다. 두 벌을 두면
 * 파서 버전이 두 곳에서 따로 올라 캐시가 어느 규칙으로 만들어졌는지 답할 수 없다.
 *
 * 원본을 `packages/` 대신 함수 폴더에 둔 이유는 배포다 — Supabase CLI가 번들에 확실히
 * 담는 범위가 `supabase/functions` 아래이고, 그 밖으로 나가면 배포에서만 드러나는 실패가 된다.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@docparse': fileURLToPath(new URL('../../supabase/functions/_shared/docParse', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
