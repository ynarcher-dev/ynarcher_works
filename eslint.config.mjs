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
/**
 * 클래스 문자열이 코드에 나타나는 **네 가지 자리**.
 *
 * 예전에는 첫 번째(JSX 속성의 평범한 문자열)만 검사했다. 그런데 실제로 규격을 벗어난 코드는
 * 대부분 나머지 세 자리에 있었다 — 조건부 클래스는 템플릿 문자열로 쓰고, 여러 곳에서 쓰는
 * 규격은 상수로 빼고, 조합은 `cn()`에 넘긴다. 그래서 "클래스를 변수로 한 번 빼면 통과"라는
 * 우회가 성립했고, 상단바 40px 버튼과 GUEST 버튼이 그렇게 규칙 밖에 살아남았다.
 *
 * 검사 대상을 늘린다고 오탐이 늘지는 않는다 — 아래 패턴들은 전부 Tailwind 클래스 모양이라,
 * 클래스가 아닌 문자열에 우연히 걸릴 일이 없다.
 */
const classStringSelectors = (pattern) => [
  `JSXAttribute[name.name="className"] Literal[value=/${pattern}/]`,
  `JSXAttribute[name.name="className"] TemplateElement[value.raw=/${pattern}/]`,
  `VariableDeclarator > Literal[value=/${pattern}/]`,
  `VariableDeclarator > TemplateLiteral > TemplateElement[value.raw=/${pattern}/]`,
  `CallExpression[callee.name="cn"] Literal[value=/${pattern}/]`,
  `CallExpression[callee.name="cn"] TemplateElement[value.raw=/${pattern}/]`,
]

/** 조작 요소(button/input/select/textarea/a)에 직접 붙은 클래스만 보는 자리. */
const controlClassSelectors = (pattern) => [
  `JSXOpeningElement[name.name=/^(button|input|select|textarea|a)$/] > JSXAttribute[name.name="className"] Literal[value=/${pattern}/]`,
  `JSXOpeningElement[name.name=/^(button|input|select|textarea|a)$/] > JSXAttribute[name.name="className"] TemplateElement[value.raw=/${pattern}/]`,
]

/**
 * 클래스가 아니라 **요소 자체**를 보는 자리.
 *
 * 위 두 헬퍼는 "규격에서 벗어난 클래스"를 찾지만, 어떤 이탈은 클래스가 아니라 태그에 있다 —
 * 원시 `<input type="checkbox">`는 클래스를 아예 안 달았을 때가 가장 나쁘고(브라우저 기본
 * 파랑으로 렌더된다), 그때 클래스 기반 규칙은 볼 것이 없어 통과시킨다. 태그와 속성을 직접
 * 보면 클래스를 얼마나 잘 흉내 냈는지와 무관하게 걸린다.
 */
const jsxAttrSelector = (tag, attr, valuePattern) =>
  `JSXOpeningElement[name.name="${tag}"] > JSXAttribute[name.name="${attr}"][value.value=/${valuePattern}/]`

const designSystemRules = () => [
  // text-[13px] 같은 임의 폰트값 — 타이포 스케일을 우회한다.
  ...classStringSelectors('text-\\[[0-9]').map((selector) => ({
    selector,
    message:
      '임의 폰트값 대신 타이포 토큰을 쓰세요(title-*/body*/caption/tag-*). 근거: 3_typography_rules.md',
  })),

  // h-[32px]·h-10 등 컨트롤 높이 하드코딩 — 밀도 맥락을 우회한다.
  // 조작 요소에 직접 붙은 것만 본다 — 썸네일·아이콘 타일 같은 표시 요소는 밀도 격자의
  // 대상이 아니므로 오탐이 된다.
  ...controlClassSelectors('(^|\\s)h-(\\[[0-9]|8|9|10|11|12)(\\s|$)').map((selector) => ({
    selector,
    message:
      '컨트롤 높이를 직접 지정하지 마세요. 공식 컴포넌트를 쓰거나 높이 토큰(h-ctl-*/h-icon-*/h-tag-*)을 사용하세요. 근거: 5_component_spec_rules.md §1.2',
  })),

  // 같은 높이 하드코딩을 상수·템플릿에서도 잡는다. 여기서는 어떤 요소에 붙는지 볼 수 없으므로
  // **상태 접두사**(hover/active/focus-visible/disabled)를 컨트롤의 표지로 삼는다 — 누를 수
  // 없는 것에는 이 접두사를 붙일 이유가 없다. 모서리 토큰을 표지로 쓰면 썸네일·이모지 타일
  // (`h-12 rounded-radius-md`)이 전부 걸린다.
  ...classStringSelectors(
    '^(?=.*(hover|active|focus-visible|disabled):)(?=.*(^|\\s)h-(\\[[0-9]|8|9|10|11|12)(\\s|$)).*$',
  ).map((selector) => ({
    selector,
    message:
      '클래스를 상수로 빼도 규격은 그대로입니다. 컨트롤 높이는 토큰(h-ctl-*/h-icon-*)을 쓰거나 공식 컴포넌트에 맡기세요. 근거: 5_component_spec_rules.md §1.2',
  })),

  // 조작 요소의 비토큰 모서리 — 같은 버튼이 화면마다 다른 곡률로 보이던 원인이다.
  // `rounded-full`은 알약·원형이 의도인 자리(아바타·점 표시)가 많아 제외한다.
  ...controlClassSelectors('(^|\\s)rounded(-(sm|md|lg|xl|2xl|3xl))?(\\s|$)').map((selector) => ({
    selector,
    message:
      '모서리는 radius 토큰(rounded-radius-sm/md/lg)을 쓰세요. Tailwind 기본 rounded는 토큰 밖 값입니다. 근거: 5_component_spec_rules.md §1.1',
  })),

  // 기본 그림자 스케일 — 쉬고 있는 표면(카드·표·버튼·폼)에는 그림자를 두지 않고,
  // 떠 있는 요소는 shadow-popover·shadow-dialog 토큰만 쓴다.
  ...classStringSelectors('(^|\\s)shadow-(sm|md|lg|xl|2xl|inner|none)(\\s|$)').map((selector) => ({
    selector,
    message:
      '그림자는 토큰(shadow-soft/popover/dialog/pinned)으로만 지정합니다. 기본 스케일은 정책 밖입니다. 근거: 5_component_spec_rules.md §1.2',
  })),

  // z-index 임의값 — 레이어 단계는 z 토큰(8_z_index §2)이 정하며, 문서가 z-[9999]류 직접
  // 대입을 명시적으로 금지한다. 실제로 모달 위 팝오버(1100)와 전체 화면 패널(500)이 토큰에
  // 없다는 이유로 z-[1100]·z-[500]·zIndex:9999 세 갈래 임의값이 살았다(2026-08-25 토큰 신설).
  ...classStringSelectors('(^|\\s)-?z-\\[').map((selector) => ({
    selector,
    message:
      'z-index를 직접 지정하지 마세요. 레이어 단계는 z 토큰(z-dropdown/navbar/sidebar/fullscreen/overlay/modal/popover/toast)이 정합니다. 필요한 단계가 없으면 tailwind-preset.mjs와 8_z_index_system_rules.md에 함께 추가하세요.',
  })),

  // 모서리 임의값 — radius 토큰(4/6/10) 밖 값. SummaryTile의 rounded-[14px]가 이 경로로 살았다.
  ...classStringSelectors('(^|\\s)rounded(-(t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?-\\[').map(
    (selector) => ({
      selector,
      message:
        '모서리는 radius 토큰(rounded-radius-sm/md/lg)을 쓰세요. 임의값은 라운드 위계를 화면마다 다르게 만듭니다. 근거: 5_component_spec_rules.md §1.1',
    }),
  ),

  // 임의 hex/rgb 색 클래스 — 팔레트 토큰을 우회하는 마지막 통로. 외부 브랜드 식별색처럼
  // 정당한 예외는 근거 주석과 함께 eslint-disable로 지나간다(현재 링크드인 1곳).
  ...classStringSelectors(
    '(^|\\s)(bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|accent|caret|divide|shadow)-\\[(#|rgb)',
  ).map((selector) => ({
    selector,
    message:
      '임의 색상값 대신 프리셋 토큰(brand/gray/신호색/summary)을 쓰세요. 외부 브랜드 식별색 등 정당한 예외는 근거 주석과 함께 eslint-disable로 표시합니다. 근거: 4_color_system_rules.md',
  })),

  // 카드 셸 손수 제작 — 밀도 맥락(card)을 내려주지 못한다.
  //
  // 이전에는 정본 클래스 문자열과 **정확히 일치**할 때만 걸렸다. 그래서 한 글자만 달라도
  // 통과했고, 실제로 GUEST의 `rounded-lg border border-gray-200 bg-white p-4`가 그 틈으로
  // 살아남았다 — 토큰 밖 모서리에 컨테이너가 아닌 divider 색까지 쓴, 정본에서 가장 먼
  // 형태가 하필 규칙에 안 걸린 셈이다. 이제 조합(카드 모서리 + 테두리 + 흰 면)으로 본다.
  ...classStringSelectors(
    '^(?=.*(^|\\s)rounded-(radius-)?lg(\\s|$))(?=.*(^|\\s)border(-|\\s|$))(?=.*(^|\\s)bg-white(\\s|$)).*$',
  ).map((selector) => ({
    selector,
    message:
      '카드 셸을 직접 만들지 말고 CardShell·Card·PanelCard를 쓰세요. 수제 카드는 밀도 맥락을 내려주지 못해 내부 버튼·태그 크기가 어긋납니다.',
  })),

  // 원시 선택 컨트롤 — 클래스를 아무리 잘 흉내 내도 밀도 맥락은 따라오지 않는다.
  //
  // `Checkbox`/`Radio`가 맥락에서 읽어 오는 것은 상자 크기만이 아니다. 포커스 링·비활성
  // 처리·브랜드 강조(accent-brand)가 한 벌이고, 원시 input은 그중 무엇이 빠졌는지가
  // 자리마다 다르다. 실제로 세 자리가 각각 다른 만큼만 흉내 내고 있었다.
  {
    selector: jsxAttrSelector('input', 'type', '^(checkbox|radio)$'),
    message:
      '원시 <input type="checkbox|radio"> 대신 Checkbox·Radio를 쓰세요. 원시 input은 밀도 맥락을 따르지 않아 크기·포커스 링·브랜드 강조가 자리마다 어긋납니다. 근거: 5_component_spec_rules.md §2.3',
  },

  // 토글 스위치 손수 제작.
  {
    selector: 'JSXAttribute[name.name="role"][value.value="switch"]',
    message:
      '토글 스위치를 직접 만들지 말고 Switch를 쓰세요. 트랙·썸·이동 거리는 한 벌로 맞아야 하며 그 값은 switchScale이 갖습니다. 근거: 5_component_spec_rules.md §2.4',
  },

  // 배지/태그 손수 제작.
  ...classStringSelectors('rounded-full (bg|border)-gray-[0-9]+ px-').map((selector) => ({
    selector,
    message:
      '태그를 직접 만들지 말고 Badge(표시) 또는 TagChip(선택 가능)을 쓰세요. 근거: 5_component_spec_rules.md §3.4',
  })),

  // 비토큰 raw 색상(red-50 등) — 신호색 토큰을 우회한다.
  ...classStringSelectors('(bg|text|border)-(red|green|blue|yellow|orange|amber|emerald)-[0-9]').map(
    (selector) => ({
      selector,
      message:
        '원시 Tailwind 색 대신 신호색 토큰(success/warning/info/danger)과 gray 스케일을 쓰세요. 근거: 4_color_system_rules.md',
    }),
  ),

  // 버튼 호버·클릭 배경의 gray-25 — 그 단계는 리스트 행 호버 전용이다(§5.1 NOTE).
  //
  // 클릭 가능한 **행·카드**는 gray-25가 맞으므로(§3.1) 상자를 가진 컨트롤만 걸러야 한다.
  // 높이 토큰(h-ctl-*/h-icon-*/size-icon-*)이 함께 있으면 밀도 격자 위의 컨트롤이고,
  // 없으면 행이다 — 행은 내용이 높이를 정하므로 높이 토큰을 달지 않는다.
  ...classStringSelectors(
    '^(?=.*(^|\\s)(h-(ctl|icon)-|size-icon-))(?=.*(hover|active):bg-gray-25(\\s|$)).*$',
  ).map((selector) => ({
    selector,
    message:
      '버튼의 호버·클릭 배경은 gray-50/gray-100입니다. gray-25는 리스트 행 호버 전용이라 표 안의 버튼이 행과 같은 색으로 묻힙니다. 근거: 4_color_system_rules.md §5.1',
  })),
]

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
      // 하이웍스에서 내려받은 원본 백업(우리 소스가 아니다). 압축된 정적 파일이 들어 있어
      // 검사하면 에러 수천 건이 쏟아지고, 그 소음에 정작 우리 코드의 에러가 묻힌다 —
      // 규칙을 지킬 주체가 없는 파일에 규칙을 들이대면 린트 자체가 못 쓰는 도구가 된다.
      'hiworks_backup/**',
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
  // 디자인 시스템 회귀 방어 — 규격을 우회하는 클래스·요소를 차단한다.
  //
  // 규격을 정해도 화면이 제각각이 되던 원인은 "우회가 쉬웠기 때문"이다. 아래 패턴은 전부
  // 실제로 발생했던 이탈이며, 린트에서 막지 않으면 같은 형태로 반복된다.
  // 근거: docs/docs_design/5_component_spec_rules.md §1.2
  //
  // **`packages/ui`도 대상이다(2026-08-21).** 이전에는 `apps/**`만 봤는데, 그러면 디자인
  // 시스템의 본체가 정책 밖에 놓인다. 실제로 `MultiSelectFilter`가 같은 패키지 안의
  // `Checkbox`를 두고 원시 input을 쓰고 있었고, 앱이었다면 즉시 걸렸을 코드가 여기서는
  // 아무 신호 없이 살았다. 규격을 만드는 쪽이 규격에서 면제되면 규격이 두 벌이 된다.
  {
    files: ['apps/**/*.tsx', 'packages/ui/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...designSystemRules()],
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
