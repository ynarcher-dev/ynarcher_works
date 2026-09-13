import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * 이 폴더는 **pnpm 워크스페이스 구성원이 아니다.** 그래서 여기에는 `node_modules`가 없고,
 * 위로 올라가 봐야 저장소 루트의 `node_modules`에는 루트 devDependency만 링크되어 있다
 * (pnpm은 격리 설치라 `vite`·`react`·`@vitejs/plugin-react`가 루트에 서지 않는다).
 *
 * 그래서 **`apps/works/package.json`을 기준점으로 삼아** 실제 앱이 쓰는 것과 같은 사본을
 * 절대 경로로 집어 온다. 검증 도구가 앱과 다른 React·다른 Vite 위에 서면 재 본 값이
 * 앱 이야기가 아니게 되므로, 기준점은 앱 하나여야 한다.
 *
 * 앞선 실패(`ERR_MODULE_NOT_FOUND: @vitejs/plugin-react`)의 원인도 이것이다 — Vite CLI가
 * 설정 파일을 임시 파일로 옮겨 담고 그 자리에서 bare import를 풀려다 실패했다. 여기서는
 * 전부 절대 경로로 바꿔서 넘긴다.
 */
const APP_ANCHOR = fileURLToPath(new URL('../../apps/works/package.json', import.meta.url))
const appRequire = createRequire(APP_ANCHOR)

/** bare 이름을 앱 기준 절대 경로로 바꾼다. 못 풀면 원인이 보이도록 기준점까지 적어 던진다. */
export function resolveFromApp(specifier) {
  try {
    return appRequire.resolve(specifier)
  } catch (error) {
    throw new Error(
      `[file-collection-browser] '${specifier}' 를 찾지 못했습니다. 기준점: ${APP_ANCHOR}\n` +
        `저장소 루트에서 'pnpm install' 을 먼저 실행했는지 확인해 주세요. (원인: ${error.message})`,
    )
  }
}

/** ESM `import()` 용 — Windows에서는 절대 경로를 그대로 import 할 수 없어 file URL로 바꾼다. */
export async function importFromApp(specifier) {
  return import(pathToFileURL(resolveFromApp(specifier)).href)
}

export { APP_ANCHOR }
