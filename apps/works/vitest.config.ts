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
    include: ['src/**/*.test.ts'],
  },
})
