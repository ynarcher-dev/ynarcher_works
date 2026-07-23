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
        // 버건디(딥 와인) — 제한 공개 상태(회의록 '일부공개') 등 절제된 경고 톤 텍스트 액센트.
        // 브랜드 네이비·danger 적색과 온도가 겹치지 않아 상태를 색만으로 가른다. 흰 배경 대비 약 9:1.
        burgundy: '#800020',
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
        // 컨트롤(버튼·탭·인라인 액션) 라벨 전용 단계(13px). 본문(14)보다 한 단계 작게 눌러
        // 조작 요소가 읽을거리보다 앞으로 튀어나오지 않게 한다.
        'body-sm': ['0.8125rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0em' }],
        // 배지·태그 전용 단계(밀도 맥락 3종). 줄바꿈이 없는 한 줄 라벨이므로 line-height를 1로
        // 고정해 부모의 leading을 상속하지 않게 한다 — 상속하면 같은 배지가 화면마다 달라진다.
        // 근거: 5_component_spec_rules.md §3.4
        'tag-page': ['0.75rem', { lineHeight: '1', letterSpacing: '0em' }],    // 12px
        'tag-card': ['0.6875rem', { lineHeight: '1', letterSpacing: '0em' }],  // 11px
        'tag-table': ['0.625rem', { lineHeight: '1', letterSpacing: '0em' }],  // 10px
      },
      /**
       * 밀도 맥락(density) 3단 높이 격자.
       *
       * 크기를 가르는 축은 중요도가 아니라 **놓이는 자리**다. 같은 '수정' 버튼이라도 상세 헤더에
       * 있으면 40px, 카드 안이면 32px, 표 셀 안이면 24px이어야 한다. 컴포넌트는 반드시 이 토큰에서
       * 높이를 가져오고 `h-10` 같은 원시 유틸을 직접 쓰지 않는다 — 그래야 밀도를 한 곳에서 바꾼다.
       *
       * spacing에 두는 이유: 높이·너비·정사각(size) 유틸이 같은 값을 공유해야 정사각 아이콘
       * 버튼과 직사각 버튼의 높이가 자동으로 맞는다.
       * 근거: 5_component_spec_rules.md §1.2
       */
      spacing: {
        // 버튼·입력·선택 등 폭이 가변인 컨트롤
        'ctl-page': '2.5rem',    // 40px — 일반 UI(페이지 툴바·상세 헤더·폼)
        'ctl-card': '2rem',      // 32px — 카드섹션 내부
        'ctl-table': '1.5rem',   // 24px — 데이터 테이블 셀 내부
        // 정사각 아이콘 버튼 — 라벨이 없어 같은 맥락에서 한 단계 작게 잡는다
        'icon-page': '2.25rem',  // 36px
        'icon-card': '1.75rem',  // 28px
        'icon-table': '1.5rem',  // 24px
        // 배지·태그
        'tag-page': '1.375rem',  // 22px
        'tag-card': '1.25rem',   // 20px
        'tag-table': '1.125rem', // 18px
        // 데이터 테이블 표준 행 — ctl-table(24px) 위아래로 6px씩 여유
        row: '2.25rem',          // 36px
      },
      /**
       * 모달 폭 — Tailwind 기본 max-w-* 는 타이포그래피 척도(sm/lg/2xl)라서
       * 다이얼로그 폭으로 쓰면 의미가 어긋난다. 대화 단계별로 이름을 따로 붙인다.
       * 근거: 5_component_spec_rules.md §4.1
       */
      maxWidth: {
        'modal-sm': '25rem',   // 400px — 확인·경고 등 한 문장짜리 대화
        'modal-md': '37.5rem', // 600px — 단일 폼(기본값)
        'modal-lg': '50rem',   // 800px — 2열 폼·목록 선택
        'modal-xl': '62.5rem', // 1000px — 표를 품는 대화
        'modal-2xl': '75rem',  // 1200px — 전체 화면에 준하는 편집기
      },
      zIndex: {
        base: '0',
        sticky: '10',
        dropdown: '100',
        navbar: '200',
        sidebar: '300',
        // 우측 슬라이드오버(전역 진입점 패널). navbar(200)보다 낮아 상단바가 위에 남고
        // dropdown(100)보다 높아 본문 콘텐츠를 덮는다. 근거: 8_z_index_system_rules.md
        panel: '150',
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
