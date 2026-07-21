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
  // 디자인 시스템 회귀 방어 — 앱 레이어에서 규격을 우회하는 클래스를 차단한다.
  //
  // 규격을 정해도 화면이 제각각이 되던 원인은 "우회가 쉬웠기 때문"이다. 아래 패턴은 전부
  // 실제로 발생했던 이탈이며, 린트에서 막지 않으면 같은 형태로 반복된다.
  // 근거: docs/docs_design/5_component_spec_rules.md §1.2
  {
    files: ['apps/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // text-[13px] 같은 임의 폰트값 — 타이포 스케일을 우회한다.
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/text-\\[[0-9]/]',
          message:
            '임의 폰트값 대신 타이포 토큰을 쓰세요(title-*/body*/caption/tag-*). 근거: 3_typography_rules.md',
        },
        {
          // h-[32px]·h-10 등 컨트롤 높이 하드코딩 — 밀도 맥락을 우회한다.
          // 조작 요소(button/input/select/textarea/a)에만 적용한다 — 썸네일·아이콘 타일 같은
          // 표시 요소는 밀도 격자의 대상이 아니므로 오탐이 된다.
          selector:
            'JSXOpeningElement[name.name=/^(button|input|select|textarea|a)$/] > JSXAttribute[name.name="className"] Literal[value=/(^|\\s)h-(\\[[0-9]|8|9|10|11|12)(\\s|$)/]',
          message:
            '컨트롤 높이를 직접 지정하지 마세요. 공식 컴포넌트를 쓰거나 높이 토큰(h-ctl-*/h-icon-*/h-tag-*)을 사용하세요. 근거: 5_component_spec_rules.md §1.2',
        },
        {
          // 카드 셸 손수 제작 — 밀도 맥락(card)을 내려주지 못한다.
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/rounded-radius-lg border border-gray-300 bg-white p-5/]',
          message:
            '카드 셸을 직접 만들지 말고 CardShell·Card·PanelCard를 쓰세요. 수제 카드는 밀도 맥락을 내려주지 못해 내부 버튼·태그 크기가 어긋납니다.',
        },
        {
          // 배지/태그 손수 제작.
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/rounded-full (bg|border)-gray-[0-9]+ px-/]',
          message:
            '태그를 직접 만들지 말고 Badge(표시) 또는 TagChip(선택 가능)을 쓰세요. 근거: 5_component_spec_rules.md §3.4',
        },
        {
          // 비토큰 raw 색상(red-50 등) — 신호색 토큰을 우회한다.
          selector:
            'JSXAttribute[name.name="className"] Literal[value=/(bg|text|border)-(red|green|blue|yellow|orange|amber|emerald)-[0-9]/]',
          message:
            '원시 Tailwind 색 대신 신호색 토큰(success/warning/info/danger)과 gray 스케일을 쓰세요. 근거: 4_color_system_rules.md',
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
