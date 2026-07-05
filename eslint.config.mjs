import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * 와이앤아처 통합 Works 플랫폼 ESLint 플랫 설정(공유).
 *
 * 핵심 규칙: 모노레포 의존성 경계 강제 — packages/ui(순수 UI 레이어)에서
 * 데이터 결합 라이브러리(@supabase/supabase-js, @tanstack/react-query) 참조를 차단합니다.
 * 근거: docs/docs_dev/1_development_stack.md §3
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'docs/**',
      // Supabase Edge Functions은 Deno 런타임/URL 임포트 사용 → 별도 툴체인
      'supabase/functions/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // 의존성 경계: packages/ui 는 순수 UI 레이어이므로 데이터 결합 라이브러리 참조 금지
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                'packages/ui는 순수 UI 레이어입니다. 데이터 결합은 packages/master-data 또는 앱 레이어에서 처리하세요.',
            },
            {
              name: '@tanstack/react-query',
              message:
                'packages/ui는 순수 UI 레이어입니다. 데이터 페칭은 상위 컨테이너(App/Hook)가 담당하고 UI에는 데이터를 주입하세요.',
            },
          ],
          patterns: [
            {
              group: ['@supabase/*', '@tanstack/react-query/*'],
              message:
                'packages/ui에서 데이터 결합 라이브러리 참조는 금지됩니다. (의존성 방향: apps → packages/ui)',
            },
          ],
        },
      ],
    },
  },
  // 설정/빌드 스크립트는 Node 전역 사용
  {
    files: ['**/*.config.{js,mjs,ts}', '**/vite.config.ts', 'tailwind-preset.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
)
