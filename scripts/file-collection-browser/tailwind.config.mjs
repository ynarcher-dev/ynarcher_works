import { fileURLToPath, URL } from 'node:url'
import preset from '../../tailwind-preset.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/**
 * 앱과 **같은 프리셋**을 쓴다. 값(색·크기·radius)의 SSOT는 `tailwind-preset.mjs` 하나이므로,
 * 여기서 테마를 덧대면 검증한 화면이 실제 화면과 다른 CSS 위에 서게 된다.
 *
 * `content`는 **절대 경로**로 적는다 — Tailwind는 상대 글롭을 설정 파일이 아니라 프로세스의
 * 작업 폴더 기준으로 푼다. 러너는 저장소 루트에서 부르므로, 상대로 두면 한 파일도 훑지 못하고
 * "No utility classes were detected" 와 함께 **빈 CSS**가 나온다(그러면 잰 값이 전부 거짓이다).
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  presets: [preset],
  content: [
    here('./index.html'),
    here('./src/**/*.{ts,tsx}'),
    here('../../packages/ui/src/**/*.{ts,tsx}'),
    // 실제 화면(WORKS 패널·GUEST 모듈)을 그대로 세우므로 그 소스의 클래스도 함께 훑는다.
    // 빼면 화면은 서되 여백·잘림 규칙이 붙지 않은 채로 서서, 잰 값이 앱 이야기가 아니게 된다.
    here('../../apps/works/src/**/*.{ts,tsx}'),
    here('../../apps/guest/src/**/*.{ts,tsx}'),
  ],
}
