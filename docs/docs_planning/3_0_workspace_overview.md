# [3-0] 워크스페이스별 상세 기능 요건 전체 개요

본 문서는 통합 Works 플랫폼 내의 9개 내부 워크스페이스(Works)와 게스트용 외부 채널(Guest)의 개별 기획 구성 및 상세 하위 문서(3_1 ~ 3_9, 파생 문서)의 인덱스를 보관합니다.

각 워크스페이스는 비즈니스 독립성과 확장성을 위해 화면 구성 요소와 조작 흐름이 개별 문서로 분할되어 기획되었습니다. 현재 구현 기준의 WORKS 상단 워크스페이스 순서는 **OFFICE ➔ STARTUP ➔ NETWORKS ➔ AC ➔ M&A/PE ➔ PROJECT ➔ FUND ➔ MANAGEMENT ➔ ADMIN**이며, GUEST는 별도 외부 앱으로 분리됩니다.

> [!NOTE]
> `3_1_workspace_hub.md`는 과거 HUB 문서명을 유지하지만, 실제 앱에서는 `OFFICE` 워크스페이스가 전사 포털·대시보드·AI 에이전트·캘린더·게시판 역할을 승계합니다. 링크 안정성을 위해 파일명은 유지하고 문서 제목과 본문에서 현재 기준을 명확히 표시합니다.
>
> 현재 화면의 실제 렌더링 상태와 기획 목표가 다를 때는 [현재 구현 화면 역기획 기준서](./0_as_built_reverse_spec.md)의 `사용 가능/부분 구현/골격/목표 기획` 판정을 우선합니다.

---

## 📂 세부 워크스페이스 기획 문서 목록 (현재 구현 기준)

| 문서 번호 | 문서명 | 대상 기능 및 기획 영역 |
| :--- | :--- | :--- |
| **[3-1]** | **[3_1_workspace_hub.md](./3_1_workspace_hub.md)** | **OFFICE (전사 업무 허브)**: 상단바 검색·AI·캘린더, 임직원·지사·결재·반출·회의실·회의록·게시 기능. 대시보드/거래처는 재설계·후속 |
| **[3-1-1 ~ 3-1-2]** | **[OFFICE 게시·반출 세부 문서](./3_1_1_board_archive_notice.md)** | 공지·게시판·자료실 레지스트리와 자산 반출 예약·승인·반납·연체 흐름 |
| **[3-3-1]** | **[3_3_1_startup_pool_classification.md](./3_3_1_startup_pool_classification.md)** | **STARTUP (스타트업 풀)**: 투자기업·보육기업·발굴기업·기타기업 4개 상호 배타 뷰, 담당자, 관리현황, 승격 플로우 |
| **[3-3-3]** | **[3_3_3_startup_menu_stat_cards.md](./3_3_3_startup_menu_stat_cards.md)** | **STARTUP 목록 통계 카드**: 내 기업·4개 구분 목록 위 카드 후보와 집계 정의(미구현 후보 기획) |
| **[3-3]** | **[3_3_workspace_networks.md](./3_3_workspace_networks.md)** | **NETWORKS (네트워크 원장)**: 전문가, 투자사, 기업, 기관, 대학, 기타, 글로벌 네트워크 원장 및 대용량 업로드 |
| **[3-3-2]** | **[3_3_2_networks_dashboard.md](./3_3_2_networks_dashboard.md)** | **NETWORKS 대시보드 목표안**: 네트워크 규모 KPI, 구분별 분포, 최근 업로드 통합 리스트(현재 화면은 재설계 대기 골격) |
| **[3-4]** | **[3_4_workspace_ac.md](./3_4_workspace_ac.md)** | **AC (사업부)**: Program First 기반 보육 프로그램 운영 플랫폼 및 14개 모듈 기획의 부모 아키텍처 |
| **[3-4-1 ~ 3-4-14]** | **[AC 세부 모듈 문서](./3_4_1_ac_dashboard.md)** | **AC 운영 모듈**: 대시보드, 프로그램 개요, 모집, 참가자 풀, 평가 엔진, 서면/대면평가, OT, 멘토링, 매칭, 데모데이, 타임라인, 성과, 커스텀 활동 |
| **[3-6]** | **[3_6_workspace_ma.md](./3_6_workspace_ma.md)** | **M&A/PE (딜 관리)**: 공용 사업 목록·상세와 커스텀 활동 구현, 딜 파이프라인·매칭·NDA는 후속 |
| **[3-8]** | **[3_8_workspace_project.md](./3_8_workspace_project.md)** | **PROJECT (프로젝트)**: 공용 사업 목록·상세와 커스텀 활동 구현, 태스크 칸반·의존 간트는 후속 |
| **[3-5]** | **[3_5_workspace_fund.md](./3_5_workspace_fund.md)** | **FUND (투자실)**: 펀드·인력·LP·포트폴리오·캐피탈 콜 구현, 조합 재무·보고서는 후속 |
| **[3-7]** | **[3_7_workspace_management.md](./3_7_workspace_management.md)** | **MANAGEMENT (경영지원)**: 인사, 조직 버전/개편, 재무, 자산, KPI 관리 등 전사 자원 관리(ERP)의 핵심 기능 |
| **[3-7-1]** | **[3_7_1_management_performance_kpi.md](./3_7_1_management_performance_kpi.md)** | **MANAGEMENT KPI**: 조직·개인 KPI 지표 카탈로그, 스코어링 룰, 템플릿, 할당, 실적, 등급/인센티브 사이클 |
| **[3-7-2]** | **[3_7_2_management_assets.md](./3_7_2_management_assets.md)** | **MANAGEMENT 자산**: 지사 귀속 자산, 비용·구독·사진·대량 업로드·OFFICE 반출 연계 |
| **[3-7-3]** | **[3_7_3_management_attendance.md](./3_7_3_management_attendance.md)** | **MANAGEMENT 근태**: 근무 정책·상태 원장, 일별 근태와 정정 이력, OFFICE 근무체크 위젯 연계 |
| **[3-2]** | **[3_2_workspace_admin.md](./3_2_workspace_admin.md)** | **ADMIN (시스템 관리자)**: 권한 제어 콘솔, 게시판/태그/민감정보 관리, 중복 병합 검증, 감사 로그 |
| **[3-9]** | **[3_9_workspace_guest.md](./3_9_workspace_guest.md)** | **GUEST (외부 파트너)**: 스타트업/전문가용 외부 대시보드, OTP/매직링크 로그인, 미팅 예약, 평가지 작성 |

---

## 2. 구현 기준 워크스페이스 키

프론트엔드 라우팅 및 권한 가드는 아래 워크스페이스 키를 기준으로 동작합니다.

| 앱 영역 | 경로 | 권한 키 | 비고 |
| :--- | :--- | :--- | :--- |
| OFFICE | `/office` | `office` | 기존 HUB 포털 기능 이관 |
| STARTUP | `/startup` | `startup` | 스타트업 풀 운영 뷰 |
| NETWORKS | `/networks` | `networks` | 외부 네트워크 원장 |
| AC | `/ac` | `ac` | 보육/액셀러레이팅 사업 |
| M&A/PE | `/mna` | `mna` | 딜 관리 |
| PROJECT | `/project` | `project` | 프로젝트/PMS |
| FUND | `/fund` | `fund` | 펀드 운용 |
| MANAGEMENT | `/management` | `management` | 경영지원/ERP |
| ADMIN | `/admin` | `admin` | 시스템 관리 |
| GUEST | 별도 앱 | `guest` | 외부 채널 |

## 3. 스위처 구획과 기본 진입

| 스위처 구획 | 워크스페이스 | 탭 미지정 시 기본 화면 |
| :--- | :--- | :--- |
| 업무 허브 | OFFICE | `dashboard` |
| 데이터베이스 | STARTUP, NETWORKS | 각각 `mine` |
| 워크스페이스 | AC, M&A/PE, PROJECT, FUND | 각각 `mine` |
| 경영·시스템 | MANAGEMENT, ADMIN | 각각 `dashboard`, `permissions` |

STARTUP·NETWORKS·AC·M&A/PE·PROJECT·FUND의 `dashboard`는 사이드바에서 `전체 …`로 표시하지만, 2026-07-31 현재 콘텐츠는 전면 재설계를 위해 비워 둔 골격입니다. 카테고리 목록과 `내 … 관리` 목록은 사용 가능하며, 메뉴명만 노출된 상태를 대시보드 구현 완료로 판정하지 않습니다.

> [!IMPORTANT]
> `office`·`startup`을 포함한 위 권한 키가 현재 정본입니다. 구 `hub` 키를 새 코드·기획·권한 seed에 다시 추가하지 않습니다. 기존 `/approval` 링크는 권한 키를 복원하지 않고 OFFICE 전자결재 탭으로만 리다이렉트합니다.
