import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 러너와 탐침이 함께 쓰는 두 가지 — **서버 세우기**와 **브라우저 찾기**.
 *
 * `pnpm ... exec vite <폴더>` 로 부르지 않는 이유: Vite CLI는 설정 파일을 임시 파일로 옮겨
 * 담고 그 자리에서 bare import를 푼다. 이 폴더에는 `node_modules`가 없어 그때
 * `ERR_MODULE_NOT_FOUND: @vitejs/plugin-react` 로 끝난다. 설정을 **객체로 직접 넘겨**
 * (`configFile: false`) 그 경로 자체를 없앤다.
 */
export async function startFixtureServer(vite) {
  const config = (await import(new URL('./vite.config.mjs', import.meta.url).href)).default
  const server = await vite.createServer({ ...config, configFile: false, logLevel: 'warn' })
  await server.listen()
  return { server, base: `http://127.0.0.1:${server.config.server.port}` }
}

/**
 * 크로미움 실행 파일.
 *
 * `playwright-core`는 브라우저를 내려받지 않으므로 이미 기계에 있는 것을 가리켜 준다.
 * 먼저 Playwright가 설치해 둔 크로미움을, 없으면 Chrome을 쓴다. 둘 다 없으면 **조용히 건너뛰지
 * 않고 멈춘다** — 검증이 돌지 않은 것과 통과한 것은 다르다.
 */
export function findBrowser() {
  const local = process.env.LOCALAPPDATA ?? ''
  const candidates = [
    process.env.FC_BROWSER_PATH,
    join(local, 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    join(local, 'ms-playwright', 'chromium_headless_shell-1234', 'chrome-win64', 'headless_shell.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      `크로미움 실행 파일을 찾지 못했습니다. 아래를 확인했습니다:\n  ${candidates.join('\n  ')}\n` +
        `FC_BROWSER_PATH 환경변수로 직접 지정할 수 있습니다.`,
    )
  }
  return found
}
