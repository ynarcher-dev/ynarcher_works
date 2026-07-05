# 📂 Planning Documents Index (readme_planning.md)

본 문서는 와이앤아처 통합 Works 플랫폼의 **상세 비즈니스 시나리오 및 워크스페이스별 기능 기획(Planning)**에 관한 문서들을 인덱싱하고 진행 상태를 추적하는 관리 파일입니다.

---

## 📄 기획 문서 목록 및 진행 상태

| 문서명 | 파일 링크 | 설명 | 상태 |
| :--- | :--- | :--- | :---: |
| **역할 및 권한 정책** | [1_roles_permissions.md](./1_roles_permissions.md) | 내부 임직원 및 외부 파트너 역할 정의, 상세 권한 매트릭스 및 게스트 일회성 인증/로그인 프로세스 | 작성 완료 |
| **비즈니스 유기성 시나리오** | [2_business_scenarios.md](./2_business_scenarios.md) | 스타트업 발굴 ➔ 보육 ➔ 투자 ➔ 멘토링 ➔ 양방향 평가의 데이터 연결성 규격 | 작성 중 |
| **워크스페이스 요건 개요** | [3_0_workspace_overview.md](./3_0_workspace_overview.md) | 8대 내부 메뉴 및 외부 채널 요건의 최상위 인덱스 | 작성 중 |
| **3-1. HUB (데이터센터)** | [3_1_workspace_hub.md](./3_1_workspace_hub.md) | 통합 검색 엔진, 전사 통합 일정 캘린더, 전문가 만족도 랭킹 보드 등 단순 조회 요건 | 작성 중 |
| **3-2. ADMIN (관리자)** | [3_2_workspace_admin.md](./3_2_workspace_admin.md) | 사용자 권한 통제 콘솔 및 보안 감사 로그 요건 | 작성 중 |
| **3-3. NETWORKS (디렉토리)** | [3_3_workspace_networks.md](./3_3_workspace_networks.md) | 통합 스타트업/전문가/협력사 마스터 데이터 등록, 수정 및 엑셀 대량 임포터 요건 | 작성 중 |
| **3-4. AC (사업부)** | [3_4_workspace_ac.md](./3_4_workspace_ac.md) | Program First 기반의 모집, 평가, OT, 멘토링, 비즈니스 매칭, 데모데이, KPI/Export 운영 모듈 기획 | 작성 중 |
| **3-5. FUND (투자실)** | [3_5_workspace_fund.md](./3_5_workspace_fund.md) | 조합/펀드 결성 관리, 포트폴리오 투자 및 캐피탈 콜 관리 요건 | 작성 중 |
| **3-6. M&A (M&A팀)** | [3_6_workspace_ma.md](./3_6_workspace_ma.md) | 딜 소싱 파이프라인 칸반, 매수/매도 매칭 매트릭스, NDA 체크리스트 요건 | 작성 중 |
| **3-7. MANAGEMENT (경영지원)** | [3_7_workspace_management.md](./3_7_workspace_management.md) | 인사(HRD/HRM), 재무 실적, 성과 지표 대시보드 및 전자결재 요건 | 작성 중 |
| **3-8. PROJECT (프로젝트)** | [3_8_workspace_project.md](./3_8_workspace_project.md) | 신사업 및 글로벌 사업부 통합 프로젝트 발굴, 태스크 보드 및 마일스톤 관리 요건 | 작성 중 |
| **3-9. GUEST (외부 파트너)** | [3_9_workspace_guest.md](./3_9_workspace_guest.md) | 외부 스타트업/전문가 전용 대시보드 및 미팅 예약, 만족도 평가지 작성 요건 | 작성 중 |

---

## ✍️ 히스토리 및 진행 예정 사항

### 2026-07-05 (최신)
* **외부 게스트 로그인 정책 이관**: 모바일 UI 디자인서(`1_ui_ux_mobile.md`)에 혼용되어 있던 '외부 게스트용 일회성 인증 및 로그인 프로세스' 요건을 기획 성격에 부합하도록 역할 및 권한 정책서([1_roles_permissions.md](./1_roles_permissions.md)) 하단으로 이관 병합 완료.
* **권한 정책 문서 플래닝 이관**: 기존 마스터 폴더에 있던 `1_roles_permissions.md` 문서를 비즈니스 기획 연계를 위해 기획(`docs_planning`) 폴더로 이동 및 재배치 완료.
* **넘버링 로컬 최적화**: 기획 폴더의 문서들을 1번(권한), 2번(비즈니스 시나리오), 3-X번(워크스페이스 명세) 시리즈로 유기적 기획 흐름에 맞춰 재정렬 완료.

* **폴더 분리 및 구조화**: 기존 기획 관련 문서들을 `docs_planning` 폴더로 이동 및 재배치 완료.
* **기획 인덱스 생성**: 본 `readme_planning.md`를 신규 생성하여 각 워크스페이스 기획 진척도를 한눈에 트래킹할 수 있도록 구성.

### 진행 예정
* 각 개별 워크스페이스 상세 기능 요건 검토 및 구체화 진행.
* AC Program First 확장 문서(3-4-6 ~ 3-4-14)를 기준으로 서면평가, 대면평가, OT, N:N 멘토링, 1:1 비즈니스 매칭, 데모데이, 통합 타임라인, KPI/Export, Custom Activity의 DB/API/RLS 연계 규격 검증.

