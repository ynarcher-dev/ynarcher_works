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
        // 브랜드 액센트(인디고) — utility 접두사 `brand` (DEFAULT = brand.500)
        // CI Red(#E22213)는 로고·인쇄물 전용으로 두고, 화면 UI 액센트는 본 인디고 램프가 담당한다.
        // 고채도 적색이 활성 탭·배지·CTA로 반복 노출되며 생기던 시각 피로를 제거하기 위한 결정.
        //
        // 딥네이비(#1F3A5F) → 인디고 전환(2026-08-20): 구 대표색은 명도 25%로 거의 검정에 가까운
        // 파랑이었다. 대비는 11.5:1로 최상급이었지만 Primary 버튼·활성 탭·사이드바처럼 넓은 면으로
        // 깔릴 때 화면이 답답해졌다. 같은 계열에서 명도를 45%로 끌어올려 인상은 유지하고 답답함만
        // 걷어냈다. 흰 글씨 대비 6.3:1로 KWCAG AA 충족.
        brand: {
          DEFAULT: '#2E5CB8',
          25: '#F3F4F7',
          500: '#2E5CB8',
          600: '#274E9C',
          700: '#204181',
          800: '#1A3366',
          900: '#112245',
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
          // 표준 테두리(서피스 헤어라인). 페이지 바탕(page)과 반드시 별개 값이어야 한다 —
          // 같은 값이 되면 카드 경계의 대비가 1.00으로 떨어져 경계가 소멸한다.
          // 현재 값은 흰 카드 안 1.35 / 페이지 바탕 위 1.17로 양쪽에서 보인다(2026-08-20).
          300: '#D9DEE5',
          400: '#6E7683', // 4.6:1 (구 #A3A3A3, 2.5:1)
          500: '#5B6371', // 6.1:1 (구 #737373, 4.6:1)
          600: '#4A5361', // 7.8:1 — 본문 표준색
          700: '#39404B', // 10.5:1
          800: '#2B313A',
          900: '#1A1F26',
        },
        // 페이지 바탕(2026-08-20) — 팔레트 단계가 아니라 body 전용 역할 값이다.
        // gray 램프에 넣지 않는 이유: 구 바탕이던 gray.50은 표 머리글 hover·비활성 입력·중립 배지 등
        // 100여 곳이 쓰는 팔레트 단계라, 바탕을 위해 그 값을 움직이면 위에 얹힌 글자의 대비가 같이
        // 깎인다. 값이 gray.100과 우연히 같지만 역할이 다르므로 별도 토큰으로 둔다.
        // 흰 카드와의 톤차 1.15로 면 묶음이 성립한다. 근거: 4_color_system_rules.md §2.1
        page: '#EDEFF2',
        // 정보 요약 카드용 파스텔 표면. 상태색이 아니라 업무 영역을 빠르게 구분하는 범주색이다.
        // 각 계열은 surface/icon/iconText/value/chip 5역할을 한 벌로 사용한다.
        summary: {
          blue: {
            surface: '#EEF5FF', icon: '#D9E9FF', 'icon-text': '#2E64B5',
            value: '#214F91', chip: '#315C92',
          },
          purple: {
            surface: '#F5F0FF', icon: '#E6DAFA', 'icon-text': '#7452AA',
            value: '#654397', chip: '#6C5092',
          },
          mint: {
            surface: '#EDF9F4', icon: '#D5F0E4', 'icon-text': '#27775B',
            value: '#21684F', chip: '#356E59',
          },
          rose: {
            surface: '#FFF1F3', icon: '#F8DDE1', 'icon-text': '#A94D5B',
            value: '#8F3E4B', chip: '#8A5360',
          },
          amber: {
            surface: '#FFF8E8', icon: '#F8E8B9', 'icon-text': '#9B6A12',
            value: '#81570E', chip: '#80652D',
          },
          cyan: {
            surface: '#ECFAFC', icon: '#CDEFF3', 'icon-text': '#26747D',
            value: '#1D626A', chip: '#326E75',
          },
          lime: {
            surface: '#F3F9E9', icon: '#E1EFC8', 'icon-text': '#627B2A',
            value: '#536A22', chip: '#61733B',
          },
          peach: {
            surface: '#FFF3EC', icon: '#FADFCC', 'icon-text': '#A55D35',
            value: '#8C4E2C', chip: '#8A6048',
          },
          indigo: {
            surface: '#F0F2FF', icon: '#DCE1FA', 'icon-text': '#5264A8',
            value: '#435493', chip: '#58658F',
          },
          slate: {
            surface: '#F3F5F7', icon: '#E1E6EB', 'icon-text': '#536273',
            value: '#3F4D5C', chip: '#5B6673',
          },
          orchid: {
            surface: '#FCEFFC', icon: '#F1D7F0', 'icon-text': '#8A4389',
            value: '#743573', chip: '#7C527B',
          },
        },
        // 상태 신호색 — 텍스트(DEFAULT)/배경(subtle)/보더(border) 3단계 (토스 스타일 HSL 계열 튜닝)
        success: { DEFAULT: '#059669', subtle: '#ECFDF5', border: '#D1FAE5' },
        warning: { DEFAULT: '#D97706', subtle: '#FFFBEB', border: '#FEF3C7' },
        info: { DEFAULT: '#0064FF', subtle: '#F0F5FF', border: '#E0EBFF' },
        // 붉은 액센트는 화면 어디서나 **한 값(#E02424)**이다. 텍스트든 배지든 버튼이든 쉬고 있는
        // 상태의 빨강은 전부 이 색이며, DEFAULT와 700은 같은 값을 가리킨다(두 이름을 남겨 둔 것은
        // 기존 사용처를 일괄 교체하지 않기 위함이다 — 어느 쪽을 써도 같은 빨강이 나온다).
        //
        // 이전에는 텍스트용 #EF4444와 버튼·보더용 #B31A0F 계열이 따로 있었다. 밝기도 색상각도
        // 달라 같은 '주의' 신호가 자리마다 다른 빨강으로 보였고, 후자는 채도가 낮고 노란기가 돌아
        // 흰 배경에서 갈색·버건디처럼 읽혔다 — NEW 배지·[공지] 말머리·건수처럼 "여기를 보라"는
        // 자리가 정작 눈에 띄지 않았다. 하나로 모으면서 색상각을 순적색(0°)으로 세우고 채도를
        // 올렸다(2026-08-03).
        //
        // 대비도 함께 나아졌다 — 구 텍스트색 #EF4444는 흰 배경에서 3.8:1로 본문 기준(4.5:1)에
        // 미달했으나, #E02424는 흰 배경 위 글자·흰 글씨 배경 양쪽 모두 4.7:1이다.
        //
        // 800·900은 색이 아니라 **누르는 감각**이다. 파괴성 버튼의 hover·active에서만 쓰는 같은
        // 빨강의 음영이며, 쉬고 있는 요소에는 쓰지 않는다(누를 때 아무 변화가 없으면 버튼이
        // 죽은 것처럼 보인다).
        danger: {
          DEFAULT: '#E02424',
          subtle: '#FFF5F5',
          border: '#FFE2E2',
          700: '#E02424',
          800: '#C81E1E',
          900: '#A81A1A',
        },
        // 버건디(#800020)는 제거했다(2026-08-03). 회의록 '일부공개' 한 곳에만 쓰이면서
        // 화면의 붉은 계열을 둘로 갈라, 같은 '주의' 신호가 자리마다 다른 색으로 보였다.
        // 붉은 액센트는 danger 램프 하나로 모은다.
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
        'table-card': ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0em' }],
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
        // 데이터 테이블 행 — 표가 놓인 자리로 갈린다(2026-08-20).
        row: '2.25rem',          // 36px — 카드섹션 안의 표(ctl-table 24 + 위아래 6px)
        // 페이지에 바로 놓인 표. 컨트롤(ctl-card 32px) 위아래로 4px씩 남긴다.
        // 카드 안 표의 6px 비율을 그대로 옮기면 44px인데, 목록 화면의 표는 행이 수십 줄
        // 쌓이므로 한 줄에 얹은 여유가 화면 전체의 높이로 곱해진다 — 실제로 세워 보니 넓었다.
        'row-lg': '2.5rem',      // 40px — 페이지에 바로 놓인 표
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
        // 본문을 통째로 덮는 전체 화면 패널(표 전체 화면 보기 등). 사이드바(300)까지 덮되
        // 모달 딤(1000) 아래 — 패널 위에서 모달을 열 수 있어야 한다.
        fullscreen: '500',
        overlay: '1000',
        modal: '1010',
        // 모달 위에 떠야 하는 포털 팝오버(모달 안 드롭다운·툴팁). 임의값(z-[1100]·9999)으로
        // 우회하지 않는다. 근거: 8_z_index_system_rules.md §3.1
        popover: '1100',
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
        // 2026-08-20 한 단계 상향(2/4/6 → 4/6/10): 헤어라인 테두리+무그림자 표면에서
        // 2px는 각진 것과 구분되지 않았다.
        'radius-sm': '4px',
        'radius-md': '6px',
        'radius-lg': '10px',
        // Tailwind 기본 스케일도 동일 기조로 정렬 (rounded / rounded-sm / rounded-lg 사용처)
        DEFAULT: '4px',
        sm: '4px',
        md: '6px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        // 쉬고 있는 표면(카드·입력·테이블 래퍼)에는 그림자를 쓰지 않는다(2026-08-20) —
        // 구획은 헤어라인 테두리와 면의 색차(page↔white)가 만든다. soft가 none이 아니라
        // 투명 그림자인 이유: Tailwind shadow 유틸은 `box-shadow: <ring>, <ring>, var(--tw-shadow)`로
        // 그림자를 쉼표로 잇는데, 여기에 none이 들어가면 목록 전체가 문법 오류가 되어 선언이
        // 통째로 버려진다. 떠 있는 요소(popover·dialog)만 그림자를 유지한다.
        'soft': '0 0 #0000',
        'popover': '0 8px 20px rgba(0, 0, 0, 0.06)',
        'dialog': '0 12px 32px rgba(0, 0, 0, 0.08)',
        // 가로 스크롤 표의 고정(sticky) 선두 열이 스크롤되는 셀 위에 떠 있음을 알리는 seam.
        // 쉬고 있는 표면이 아니라 '떠 있는 요소'의 그림자이므로 폐지 대상이 아니며,
        // 우측으로만 번지는 방향성 때문에 popover/dialog와 별도 토큰으로 둔다.
        'pinned': '10px 0 14px -4px rgba(17, 24, 39, 0.16)',
      },
    },
  },
}
