/**
 * 와이앤아처 통합 Works 플랫폼 디자인 토큰 Tailwind 프리셋 (SSOT).
 *
 * 색상/타이포/모션/z-index 토큰의 단일 원천이며, 모든 앱과 packages/ui가
 * 본 프리셋을 presets 로 공유합니다. 수치의 근거 문서는 다음과 같습니다.
 *  - 색상: docs/docs_design/4_color_system_rules.md
 *  - 타이포: docs/docs_design/3_typography_rules.md
 *  - 모션: docs/docs_design/6_motion_transition_rules.md
 *  - z-index: docs/docs_design/8_z_index_system_rules.md
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  theme: {
    extend: {
      colors: {
        // 브랜드 레드(CI Red) — utility 접두사 `brand` (DEFAULT = red.500)
        brand: {
          DEFAULT: '#E22213',
          25: '#FFF5F4',
          500: '#E22213',
          600: '#C91E11',
          700: '#B31A0F',
          800: '#9F170D',
          900: '#86130B',
        },
        // 웜그레이 무채색 스케일 (완전 검정 지양)
        gray: {
          0: '#FFFFFF',
          25: '#FAFAFA',
          50: '#F7F7F7',
          100: '#F0F0F0',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A3A3A3',
          500: '#737373',
          600: '#515151',
          700: '#3F3F3F',
          800: '#2F2F2F',
          900: '#1F1F1F',
        },
        // 상태 신호색 — 텍스트(DEFAULT)/배경(subtle)/보더(border) 3단계
        success: { DEFAULT: '#1D4ED8', subtle: '#EFF6FF', border: '#BFDBFE' },
        warning: { DEFAULT: '#92400E', subtle: '#FFFBEB', border: '#FDE68A' },
        info: { DEFAULT: '#166534', subtle: '#F0FDF4', border: '#BBF7D0' },
        danger: { DEFAULT: '#9F170D', subtle: '#FFF5F4', border: '#FAD3CF' },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          'sans-serif',
        ],
        // 대시보드 지표/금액 등 수치 강조용 서브 폰트
        numeric: ['Inter', 'Pretendard Variable', 'sans-serif'],
      },
      fontSize: {
        'title-lg': ['1.875rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        'title-md': ['1.5rem', { lineHeight: '1.35', letterSpacing: '-0.02em' }],
        'title-sm': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.015em' }],
        'body-lg': ['1rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        body: ['0.875rem', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0em' }],
      },
      zIndex: {
        base: '0',
        sticky: '10',
        dropdown: '100',
        navbar: '200',
        sidebar: '300',
        overlay: '1000',
        modal: '1010',
        toast: '2000',
      },
      transitionDuration: {
        instant: '75ms',
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
        decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
        accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
  },
}
