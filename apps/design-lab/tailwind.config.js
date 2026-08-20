import preset from '../../tailwind-preset.mjs'

/**
 * 견본 앱 전용 Tailwind 설정 — 프리셋을 그대로 쓴다.
 *
 * 후보 비교 기간에는 브랜드 램프·표면 값을 CSS 변수로 갈아 끼우는 오버라이드가 있었으나,
 * 확정값이 프리셋에 이식되면서 걷어냈다(2026-08-20). 이 앱이 프리셋과 다른 값을 렌더하기
 * 시작하면 견본의 존재 이유가 사라지므로, 여기에는 어떤 토큰 오버라이드도 다시 넣지 않는다.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [preset],
}
