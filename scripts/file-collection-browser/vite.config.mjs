import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { resolveFromApp, importFromApp } from './resolve.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
/** 경로 비교는 한 벌의 표기로만 한다 — Windows의 역슬래시가 섞이면 같은 파일이 두 이름을 갖는다. */
const posix = (p) => p.replace(/\\/g, '/')

const react = (await importFromApp('@vitejs/plugin-react')).default
const tailwindcss = (await importFromApp('tailwindcss')).default
const autoprefixer = (await importFromApp('autoprefixer')).default

const WORKS_SRC = posix(here('../../apps/works/src'))
const GUEST_SRC = posix(here('../../apps/guest/src'))

/**
 * 통신·세션을 타는 모듈만 **파일 단위로** 대역으로 바꾼다.
 *
 * 앱 전체를 흉내 내지 않는 이유는 이 검증이 재려는 것이 화면이기 때문이다 — 화면 부품과 그
 * 화면이 쓰는 규칙(잠금·경로·진행률)은 실물 그대로 두고, Supabase를 무는 자리만 갈아 끼운다.
 * 키는 확장자를 뗀 절대 경로이며, 값은 이 폴더의 대역 파일이다.
 */
const MOCKS = new Map([
  [`${WORKS_SRC}/auth/authStore`, here('./src/mocks/works/authStore.ts')],
  [`${WORKS_SRC}/features/program/workspace`, here('./src/mocks/works/workspace.ts')],
  [`${WORKS_SRC}/features/program/participantHooks`, here('./src/mocks/works/participantHooks.ts')],
  /*
    Supabase 클라이언트는 **적재되는 순간** `getEnv()`로 환경변수를 요구한다(zod). 이 픽스처에는
    그 값이 없으므로 화면이 서기 전에 던진다 — 그래서 GUEST 계정 창들이 끌고 오는 서비스
    모듈들을 실물로 두려면 이 한 자리를 갈아 끼워야 한다.
  */
  [`${WORKS_SRC}/lib/supabase`, here('./src/mocks/works/supabase.ts')],
  [`${WORKS_SRC}/features/networks/hooks`, here('./src/mocks/works/networksHooks.ts')],
  [
    `${WORKS_SRC}/features/program/fileCollection/fileCollectionHooks`,
    here('./src/mocks/works/fileCollectionHooks.ts'),
  ],
  [`${GUEST_SRC}/features/fileCollectionHooks`, here('./src/mocks/guest/fileCollectionHooks.ts')],
])

/** 확장자 없는 경로를 실제 파일로 편다(앱의 tsconfig `paths`가 하던 일). */
function withExtension(base) {
  const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]
  return candidates.find((p) => existsSync(p) && !p.endsWith('/')) ?? null
}

/**
 * 앱 소스를 **그 앱의 별칭 그대로** 읽어 오는 플러그인.
 *
 * 두 앱이 같은 `@/` 를 서로 다른 뿌리로 쓰기 때문에 정적 별칭표로는 풀 수 없다 — 같은 문자열이
 * WORKS 파일 안에서는 `apps/works/src`, GUEST 파일 안에서는 `apps/guest/src`를 가리킨다.
 * 그래서 **부른 쪽(importer)이 어느 앱에 있는지**를 보고 뿌리를 고른다. 검증 화면은 어느 쪽도
 * 아니므로 `@works/`·`@guest/` 로 앱을 직접 지목한다.
 */
function appSources() {
  return {
    name: 'file-collection-app-sources',
    enforce: 'pre',
    resolveId(source, importer) {
      let base = null
      if (source.startsWith('@works/')) base = `${WORKS_SRC}/${source.slice('@works/'.length)}`
      else if (source.startsWith('@guest/')) base = `${GUEST_SRC}/${source.slice('@guest/'.length)}`
      else if (source.startsWith('@/') && importer) {
        const from = posix(importer)
        if (from.startsWith(`${WORKS_SRC}/`)) base = `${WORKS_SRC}/${source.slice(2)}`
        else if (from.startsWith(`${GUEST_SRC}/`)) base = `${GUEST_SRC}/${source.slice(2)}`
      }
      if (!base) return null
      const mocked = MOCKS.get(base)
      const file = withExtension(mocked ?? base)
      if (!file) {
        throw new Error(`[file-collection-browser] '${source}' 를 파일로 풀지 못했습니다 (${base}).`)
      }
      return file
    },
  }
}

/**
 * 검증 전용 Vite 앱.
 *
 * 두 가지를 앱에서 빌려 온다.
 *
 * 1. **도구**(Vite 플러그인·Tailwind·PostCSS)와 **런타임**(React) — 이 폴더에는
 *    `node_modules`가 없으므로 bare import가 풀리지 않는다. `resolve.mjs`가 `apps/works`를
 *    기준으로 절대 경로를 집어 오고, React 계열은 별칭으로 박아 넣는다. 별칭이 없으면
 *    `packages/ui`의 `import { useState } from 'react'` 가 그 자리에서 풀리지 않는다.
 * 2. **소스** — `@ynarcher/ui`를 패키지 이름이 아니라 TS 소스 경로로 잇는다. 이 폴더는 pnpm
 *    워크스페이스 구성원이 아니라 `workspace:*` 의존을 쓸 수 없고, 어차피 앱들도 이 패키지의
 *    TS 소스를 그대로 컴파일한다(`packages/ui/package.json`의 exports).
 *
 * PostCSS는 **설정 파일 탐색에 맡기지 않고 여기서 직접 물린다** — 탐색으로 찾은 설정 파일은
 * 자기 자리에서 bare import를 풀려다 같은 이유로 실패한다.
 */
export default {
  root: here('.'),
  plugins: [appSources(), react()],
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query', 'react-router-dom'],
    alias: [
      { find: /^@ynarcher\/ui$/, replacement: here('../../packages/ui/src/index.ts') },
      {
        // 자료 파서. WORKS는 이 별칭을 자기 설정에 두고 있고(`apps/works/vite.config.ts`),
        // `guestBatchFile`이 xlsx를 열 때 그 경로로 들어간다.
        find: /^@docparse\/(.*)$/,
        replacement: `${here('../../supabase/functions/_shared/docParse')}/$1`,
      },
      /*
        Provider가 필요한 화면들. 픽스처 파일에는 `node_modules`가 없어 bare import가 풀리지
        않으므로 앱이 쓰는 그 사본을 절대 경로로 박는다 — 앱 소스 쪽 bare import도 같은
        파일로 풀리므로 컨텍스트 인스턴스가 하나로 유지된다(`dedupe`).
      */
      { find: /^@tanstack\/react-query$/, replacement: resolveFromApp('@tanstack/react-query') },
      { find: /^react-router-dom$/, replacement: resolveFromApp('react-router-dom') },
      { find: /^@ynarcher\/master-data$/, replacement: here('../../packages/master-data/src/index.ts') },
      { find: /^react$/, replacement: resolveFromApp('react') },
      { find: /^react\/jsx-runtime$/, replacement: resolveFromApp('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: resolveFromApp('react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: resolveFromApp('react-dom') },
      { find: /^react-dom\/client$/, replacement: resolveFromApp('react-dom/client') },
      { find: /^lucide-react$/, replacement: resolveFromApp('lucide-react') },
      {
        // 앱과 같은 글꼴 파일. CSS는 `exports` 밖 경로라 패키지 루트를 잡아 이어 붙인다.
        find: /^pretendard\/(.*)$/,
        replacement: resolveFromApp('pretendard/package.json').replace(/package\.json$/, '$1'),
      },
    ],
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: here('./tailwind.config.mjs') }), autoprefixer()],
    },
  },
  server: {
    port: 5199,
    strictPort: true,
    host: '127.0.0.1',
    fs: {
      // 소스를 이 폴더 밖(`packages/ui`)에서 읽으므로 저장소 루트까지 열어 준다.
      allow: [here('../..')],
    },
  },
}
