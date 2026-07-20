# 📂 Planning Documents Index (readme_planning.md)

본 문서는 와이앤아처 통합 Works 플랫폼의 **상세 비즈니스 시나리오 및 워크스페이스별 기능 기획(Planning)**에 관한 문서들을 인덱싱하고 진행 상태를 추적하는 관리 파일입니다.

---

## 📄 기획 문서 목록 및 진행 상태

| 문서명 | 파일 링크 | 설명 | 상태 |
| :--- | :--- | :--- | :---: |
| **역할 및 권한 정책** | [1_roles_permissions.md](./1_roles_permissions.md) | 내부 임직원 및 외부 파트너 역할 정의, 상세 권한 매트릭스 및 게스트 일회성 인증/로그인 프로세스 | 작성 완료 |
| **비즈니스 유기성 시나리오** | [2_business_scenarios.md](./2_business_scenarios.md) | 스타트업 발굴 ➔ 보육 ➔ 투자 ➔ 멘토링 ➔ 양방향 평가의 데이터 연결성 규격 | 작성 완료 |
| **워크스페이스 요건 개요** | [3_0_workspace_overview.md](./3_0_workspace_overview.md) | 9개 내부 워크스페이스 및 외부 채널 요건의 최상위 인덱스 | 구현 반영 |
| **3-1. OFFICE (전사 업무 허브)** | [3_1_workspace_hub.md](./3_1_workspace_hub.md) | 구 HUB 문서명을 유지하되, 실제 구현 기준인 OFFICE 대시보드·AI 에이전트·임직원 정보·캘린더·전자결재·게시판 요건 | 구현 반영 |
| **3-2. ADMIN (관리자)** | [3_2_workspace_admin.md](./3_2_workspace_admin.md) | 사용자 권한 통제 콘솔, 게시판/태그/민감정보 관리, 보안 감사 로그 요건 | 구현 반영 |
| **3-3. NETWORKS (네트워크 원장)** | [3_3_workspace_networks.md](./3_3_workspace_networks.md) | 전문가·투자사·기관·기업·대학·기타·글로벌 네트워크 원장 및 대량 업로드 요건 | 구현 반영 |
| **3-3-1. STARTUP (스타트업 풀)** | [3_3_1_startup_pool_classification.md](./3_3_1_startup_pool_classification.md) | 투자·보육·발굴·기타기업 구분, 담당자, 관리현황, STARTUP 4개 목록 뷰 요건 | 구현 반영 |
| **3-3-2. NETWORKS 대시보드** | [3_3_2_networks_dashboard.md](./3_3_2_networks_dashboard.md) | 네트워크 규모 KPI, 구분별 분포, 최근 업로드 통합 현황 | 구현 반영 |
| **3-4. AC (사업부)** | [3_4_workspace_ac.md](./3_4_workspace_ac.md) | Program First 기반의 모집, 평가, OT, 멘토링, 비즈니스 매칭, 데모데이, KPI/Export 운영 모듈 기획 | 구현 반영 |
| **3-5. FUND (투자실)** | [3_5_workspace_fund.md](./3_5_workspace_fund.md) | 조합/펀드 결성 관리, 포트폴리오 투자 및 캐피탈 콜 관리 요건 | 구현 반영 |
| **3-6. M&A/PE (딜 관리)** | [3_6_workspace_ma.md](./3_6_workspace_ma.md) | 딜 소싱 파이프라인 칸반, 매수/매도 매칭 매트릭스, NDA 체크리스트 요건 | 구현 반영 |
| **3-7. MANAGEMENT (경영지원)** | [3_7_workspace_management.md](./3_7_workspace_management.md) | 인사(HRD/HRM), 조직 버전/개편, 재무, 자산, KPI 관리 요건 | 구현 반영 |
| **3-7-1. MANAGEMENT KPI** | [3_7_1_management_performance_kpi.md](./3_7_1_management_performance_kpi.md) | 조직·개인 KPI 스코어링 룰 엔진 및 성과관리 사이클 | 기획 완료 |
| **3-8. PROJECT (프로젝트)** | [3_8_workspace_project.md](./3_8_workspace_project.md) | 신사업 및 글로벌 사업부 통합 프로젝트 발굴, 태스크 보드 및 마일스톤 관리 요건 | 구현 반영 |
| **3-9. GUEST (외부 파트너)** | [3_9_workspace_guest.md](./3_9_workspace_guest.md) | 외부 스타트업/전문가 전용 대시보드 및 미팅 예약, 만족도 평가지 작성 요건 | 구현 반영 |

---

## ✍️ 히스토리 및 진행 예정 사항

### 2026-07-16 (최신)
* **WORKS 최상위 구조 최신화**: 실제 앱 기준으로 기존 `HUB` 포털 기능은 `OFFICE` 워크스페이스로 이관되었고, 스타트업 운영 화면은 `STARTUP` 워크스페이스로 분리되었습니다. 링크 호환성을 위해 `3_1_workspace_hub.md` 파일명은 유지하되 문서 내용은 OFFICE 기준으로 해석합니다.
* **구현 반영 상태 갱신**: NETWORKS 대시보드, STARTUP 4개 구분 뷰, AC 프로그램 상세 카드섹션/담당자 배치, M&A 딜 상세, MANAGEMENT 조직 버전/개편, OFFICE 전자결재·게시판 이관 등 최근 구현 산출물을 기획 인덱스에 반영했습니다.
* **권한 정합화 후속 과제 명시**: 프론트 라우팅의 `office`/`startup` 권한 키와 기존 DB `workspace_key` enum·permission seed·ADMIN 권한 콘솔 노출 항목 사이의 차이를 후속 정비 대상으로 기록했습니다.

### 2026-07-05
* **AC 구버전 문서 정리 및 마스터 SSOT 통일**: 신규 14문서 체계와 번호가 충돌하던 구버전 AC 문서 5종(`3_4_3_ac_startups`, `3_4_4_ac_mentoring`, `3_4_5_ac_milestones`, `3_4_6_ac_evaluations`, `3_4_7_ac_custom_events`)을 삭제 완료. 삭제 전 승계 자산(양방향 평가 5대 지표 ➔ 3-4-9, 표준 일정 카테고리 10종 및 전사 캘린더 동기화 매핑 ➔ 3-4-12)을 신규 문서로 이식 완료. 스타트업/전문가 마스터의 단일 원천(SSOT)은 `NETWORKS`로, 임직원 마스터는 `MANAGEMENT`로 전 문서 용어 통일 완료.
* **외부 게스트 로그인 정책 이관**: 모바일 UI 디자인서(`1_ui_ux_mobile.md`)에 혼용되어 있던 '외부 게스트용 일회성 인증 및 로그인 프로세스' 요건을 기획 성격에 부합하도록 역할 및 권한 정책서([1_roles_permissions.md](./1_roles_permissions.md)) 하단으로 이관 병합 완료.
* **권한 정책 문서 플래닝 이관**: 기존 마스터 폴더에 있던 `1_roles_permissions.md` 문서를 비즈니스 기획 연계를 위해 기획(`docs_planning`) 폴더로 이동 및 재배치 완료.
* **넘버링 로컬 최적화**: 기획 폴더의 문서들을 1번(권한), 2번(비즈니스 시나리오), 3-X번(워크스페이스 명세) 시리즈로 유기적 기획 흐름에 맞춰 재정렬 완료.

* **폴더 분리 및 구조화**: 기존 기획 관련 문서들을 `docs_planning` 폴더로 이동 및 재배치 완료.
* **기획 인덱스 생성**: 본 `readme_planning.md`를 신규 생성하여 각 워크스페이스 기획 진척도를 한눈에 트래킹할 수 있도록 구성.

### 진행 예정
* 각 개별 워크스페이스 상세 기능 요건 검토 및 구체화 진행.
* AC Program First 확장 문서(3-4-6 ~ 3-4-14)를 기준으로 서면평가, 대면평가, OT, N:N 멘토링, 1:1 비즈니스 매칭, 데모데이, 통합 타임라인, KPI/Export, Custom Activity의 DB/API/RLS 연계 규격 검증.

