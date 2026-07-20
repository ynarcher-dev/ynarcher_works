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
        // 브랜드 액센트(딥 네이비) — utility 접두사 `brand` (DEFAULT = brand.500)
        // CI Red(#E22213)는 로고·인쇄물 전용으로 두고, 화면 UI 액센트는 본 네이비 램프가 담당한다.
        // 고채도 적색이 활성 탭·배지·CTA로 반복 노출되며 생기던 시각 피로를 제거하고,
        // 흰 배경 대비를 4.6:1 → 11.5:1로 끌어올린다.
        brand: {
          DEFAULT: '#1F3A5F',
          25: '#F1F4F9',
          500: '#1F3A5F',
          600: '#1A3252',
          700: '#152944',
          800: '#102036',
          900: '#0B1727',
        },
        // 쿨 슬레이트 무채색 스케일 (완전 검정 지양, 브랜드 네이비와 같은 온도)
        //
        // 텍스트 단계(400~900)는 화면이 뿌옇게 보이던 문제를 해소하기 위해 재조정했다.
        // gray.400은 문서상 '비활성·플레이스홀더 전용'이지만 실제 코드에서 본문 텍스트로 가장 많이
        // 쓰이고 있었고(240여 곳) 대비가 2.5:1에 불과했다. 사용처를 일괄 교체하는 대신 값 자체를
        // 어둡게 옮겨 400 단계도 KWCAG AA(4.5:1)를 충족시키고, 이웃 단계와의 간격을 다시 벌렸다.
        // 경계선 단계(100~300)도 카드·테이블 윤곽이 흐릿해지지 않도록 함께 진하게 조정했다.
        gray: {
          0: '#FFFFFF',
          25: '#FAFBFC',
          50: '#F5F6F8',
          100: '#EDEFF2',
          200: '#DFE2E7',
          300: '#CBD0D8', // 표준 테두리 — 카드·테이블 윤곽
          400: '#6E7683', // 4.6:1 (구 #A3A3A3, 2.5:1)
          500: '#5B6371', // 6.1:1 (구 #737373, 4.6:1)
          600: '#4A5361', // 7.8:1 — 본문 표준색
          700: '#39404B', // 10.5:1
          800: '#2B313A',
          900: '#1A1F26',
        },
        // 상태 신호색 — 텍스트(DEFAULT)/배경(subtle)/보더(border) 3단계 (토스 스타일 HSL 계열 튜닝)
        success: { DEFAULT: '#059669', subtle: '#ECFDF5', border: '#D1FAE5' },
        warning: { DEFAULT: '#D97706', subtle: '#FFFBEB', border: '#FEF3C7' },
        info: { DEFAULT: '#0064FF', subtle: '#F0F5FF', border: '#E0EBFF' },
        // danger는 700~900 단계를 함께 가진다 — 브랜드가 적색이 아니게 되면서 파괴성 액션 버튼과
        // 입력 검증 실패 보더가 더 이상 brand 램프를 빌려 쓸 수 없기 때문이다(구 brand.700~900 값 승계).
        danger: {
          DEFAULT: '#EF4444',
          subtle: '#FFF5F5',
          border: '#FFE2E2',
          700: '#B31A0F',
          800: '#9F170D',
          900: '#86130B',
        },
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
      borderRadius: {
        // 라운드는 "아주 약간"만 — 카드/버튼/테이블 모두 각진 인상을 유지합니다.
        'radius-sm': '2px',
        'radius-md': '4px',
        'radius-lg': '6px',
        // Tailwind 기본 스케일도 동일 기조로 축소 (rounded / rounded-sm / rounded-lg 사용처)
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
        lg: '6px',
        xl: '8px',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'popover': '0 8px 20px rgba(0, 0, 0, 0.06)',
        'dialog': '0 12px 32px rgba(0, 0, 0, 0.08)',
      },
    },
  },
}
