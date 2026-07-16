# 📂 Design Documents Index (readme_design.md)

본 문서는 와이앤아처 통합 Works 플랫폼의 **UI/UX 디자인 시스템, 반응형 웹 규격 및 네비게이션 가이드(Design)**에 관한 문서들을 인덱싱하고 진행 상태를 추적하는 관리 파일입니다.

---

## 📄 디자인 문서 목록 및 진행 상태

| 문서명 | 파일 링크 | 설명 | 상태 |
| :--- | :--- | :--- | :---: |
| **모바일 UI/UX 기획** | [1_ui_ux_mobile.md](./1_ui_ux_mobile.md) | 모바일 해상도 적응(Reflow) 규칙, 모바일 특화 제어 요소(터치/스와이프) 기획 | 작성 완료 |
| **공통 레이아웃 및 내비게이션** | [2_app_layout_navigation.md](./2_app_layout_navigation.md) | 상단바 서비스 전환 드롭다운 및 좌측 사이드바 동적 전환 규칙 | 작성 완료 |
| **타이포그래피 및 폰트 규칙** | [3_typography_rules.md](./3_typography_rules.md) | 폰트 패밀리(Pretendard), 타이포 스케일, 웨이트 및 텍스트 컬러 위계 정의 | 작성 완료 |
| **브랜드 컬러 시스템 규칙** | [4_color_system_rules.md](./4_color_system_rules.md) | CI Red, 기본 무채색 가이드 및 KWCAG 준수 4종 상태 신호색 사양 | 작성 완료 |
| **공통 컴포넌트 표준 규격** | [5_component_spec_rules.md](./5_component_spec_rules.md) | 글로벌 토큰(Radius, Shadow), 조작 컨트롤, 데이터 테이블 및 모달 명세 | 작성 완료 |
| **인터랙션 모션 및 트랜지션** | [6_motion_transition_rules.md](./6_motion_transition_rules.md) | 애니메이션 속도(Duration) 및 가속도(Easing) 글로벌 토큰 정의 | 작성 완료 |
| **차트 및 데이터 시각화 컬러** | [7_chart_visualization_rules.md](./7_chart_visualization_rules.md) | 다중 계열 차트 범주형 컬러, 그리드, 범례 및 툴팁 시각 스펙 | 작성 완료 |
| **전역 레이어 계층 Z-Index** | [8_z_index_system_rules.md](./8_z_index_system_rules.md) | 겹치는 UI 레이어 간 충돌 방지를 위한 전역 Z-Index 스케일 수립 | 작성 완료 |
| **피드백 및 알림 시스템 규격** | [9_feedback_notification_rules.md](./9_feedback_notification_rules.md) | 토스트, 배너, 입력 에러 피드백 및 로딩/스켈레톤 UI 명세 | 작성 완료 |

---

## ✍️ 히스토리 및 진행 예정 사항

### 2026-07-16 (최신)
* **내비게이션 문서 최신화**: 실제 구현 기준의 `OFFICE`, `STARTUP`, `NETWORKS`, `AC`, `M&A/PE`, `PROJECT`, `FUND`, `MANAGEMENT`, `ADMIN` 사이드바 구조를 [2_app_layout_navigation.md](./2_app_layout_navigation.md)에 반영했습니다.

### 2026-07-05
* **신규 디자인 시스템 명세 4종 단위별 신규 생성**:
  * **인터랙션 모션 및 트랜지션 규격서** ([6_motion_transition_rules.md](./6_motion_transition_rules.md)) 작성 완료.
  * **차트 및 데이터 시각화 컬러 규칙서** ([7_chart_visualization_rules.md](./7_chart_visualization_rules.md)) 작성 완료.
  * **전역 레이어 계층 Z-Index 규격서** ([8_z_index_system_rules.md](./8_z_index_system_rules.md)) 작성 완료.
  * **피드백 및 알림 시스템 규격서** ([9_feedback_notification_rules.md](./9_feedback_notification_rules.md)) 작성 완료.
* **공통 컴포넌트 표준 규격서 보강**: 아코디언(Accordion), 브레드크럼(Breadcrumb), 아바타(Avatar)의 상세 사양을 [5_component_spec_rules.md](./5_component_spec_rules.md)에 보강 완료.
* **브랜드 컬러 시스템 규칙서 작성**: CI Red 및 Neutral Gray 스케일, KWCAG 웹 접근성 대비율(4.5:1)을 충족하는 4종 상태 신호색(성공/완료, 대기, 진행, 취소)을 수립한 [4_color_system_rules.md](./4_color_system_rules.md) 문서 신규 작성 완료.
* **타이포그래피 및 폰트 규칙서 작성**: 국문/영문 표준 폰트 적용 기준 및 크기/두께/자간/컬러 위계를 명시한 [3_typography_rules.md](./3_typography_rules.md) 문서 신규 작성 완료.
* **넘버링 로컬 최적화**: 디자인 폴더에 맞춰 파일명을 1번(모바일 UI/UX) 및 2번(레이아웃 및 네비게이션)으로 넘버링 갱신 완료.
* **공통 레이아웃 및 내비게이션 기획 명세서 작성**: 상단바 드롭다운과 좌측 사이드바의 스위칭 구조 및 해상도별 동작 요건을 담은 [2_app_layout_navigation.md](./2_app_layout_navigation.md) 문서 작성 완료.
* **폴더 분리 및 구조화**: 기존 디자인 관련 문서(`4_ui_ux_mobile.md`)를 `docs_design` 폴더로 이동 및 재배치 완료.
* **디자인 인덱스 생성**: 본 `readme_design.md`를 신규 생성하여 UI/UX 및 디자인 정책 문서를 체계적으로 누적할 수 있도록 뼈대 구성.

### 진행 예정
* 각 개별 워크스페이스(OFFICE, STARTUP, AC 등)의 상세 대시보드 및 상세 페이지 피그마 시안 요소와 연계할 UI 레이아웃 세부 사항 정립.
* 모바일 환경의 사이드바/상단바 접기/열기 인터랙션 규칙 보강.





