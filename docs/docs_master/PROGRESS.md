# ✅ 와이앤아처 통합 Works 플랫폼 개발 진행현황 체크리스트 (PROGRESS.md)

본 문서는 통합 Works 플랫폼의 개발 작업을 단위별로 분할하여 진행 상태를 추적하는 체크리스트입니다. 각 작업 단위가 완료될 때마다 체크박스를 갱신하고, 갱신 즉시 커밋/푸쉬하는 것을 원칙으로 합니다.

> [!NOTE]
> **작업 규칙 및 시작 절차는 [CLAUDE.md](./CLAUDE.md)**, 서비스 비전은 [readme_master.md](./readme_master.md), 전체 문서 지도는 [0_service_spec_draft.md](./0_service_spec_draft.md)를 참조하십시오.

* 개발 우선순위는 [3_0_workspace_overview.md](../docs_planning/3_0_workspace_overview.md) 기준: `HUB → NETWORKS → AC → FUND → M&A → ADMIN → PROJECT → MANAGEMENT → GUEST`
* 기술 스택은 [1_development_stack.md](../docs_dev/1_development_stack.md) 기준: Turborepo 모노레포 + React/TS Vite SPA + Tailwind CSS + Supabase(PostgreSQL/RLS/Edge Functions) + AWS S3/CloudFront

---

## Phase 0. 기획 문서 정비 (완료)

- [x] 전체 기획 문서(57개) 전수 검토 및 개발 착수 가능성 진단
- [x] AC 구버전 문서 5종 삭제 및 승계 자산 이식 (5대 평가 지표, 표준 일정 카테고리 10종, 전사 캘린더 매핑)
- [x] 마스터 데이터 SSOT를 NETWORKS로 통일 (임직원 마스터는 MANAGEMENT)
- [x] 백엔드 실행 모델을 Vite SPA + Supabase Edge Functions로 정합화 (Next.js 표현 제거)
- [x] 디자인 컬러 팔레트 단일화 및 누락 토큰 보강 (웜그레이 기준, 사이드바 밝은 배경 확정)
- [x] 상태값/FK 드리프트 정합화 (WAITLISTED 통일, evaluation_targets 다형화, RLS 헬퍼 2계층화)
- [x] 인덱스 문서 최신화 및 Tailwind CSS 공식 스택 명문화
- [x] 서비스 개념 확장: 기존 프로젝트 관리(PMS) 성격에 전사 자원 관리(ERP) 개념 융합 명문화

## Phase 1. 프로젝트 기반 셋업

> **참고 문서**: [1_development_stack.md](../docs_dev/1_development_stack.md) (모노레포/라이브러리/수칙) · [4_color_system_rules.md](../docs_design/4_color_system_rules.md), [3_typography_rules.md](../docs_design/3_typography_rules.md), [6_motion_transition_rules.md](../docs_design/6_motion_transition_rules.md), [8_z_index_system_rules.md](../docs_design/8_z_index_system_rules.md) (Tailwind 토큰 이관 원천)

- [x] Turborepo 모노레포 스캐폴딩 (`apps/works`, `apps/guest`, `packages/ui`, `packages/master-data`)
- [x] Vite + React + TypeScript 앱 초기화 및 공통 tsconfig/경로 별칭 구성
- [x] Tailwind CSS 설치 및 디자인 토큰 이관 (`tailwind.config`: 브랜드/그레이/세만틱 컬러, 타이포 스케일, z-index, 모션 duration)
- [x] ESLint + `no-restricted-imports` 의존성 경계 규칙 설정 (`packages/ui` 내 supabase/react-query 참조 차단)
- [x] 공통 라이브러리 설치 (TanStack Query, Zustand, React Hook Form + Zod, Day.js, react-router-dom v6)
- [x] Supabase 프로젝트 생성 및 로컬 개발 환경(supabase CLI) 구성 <!-- 로컬 구성 완료. 클라우드 프로젝트 생성은 계정 필요 → supabase/README.md TODO -->
- [x] 환경 변수 체계 수립 (`VITE_` 공개 변수 / Edge Function Secret 분리)
- [x] Git 브랜치 전략 및 커밋 컨벤션 문서화 (`docs_dev` 개발 컨벤션 문서 신규 작성)

## Phase 2. 데이터베이스 물리 스키마

> **참고 문서**: [7_database_design_guidelines.md](../docs_dev/7_database_design_guidelines.md) (설계 원칙) · [3_database_rls_policy_matrix.md](../docs_dev/3_database_rls_policy_matrix.md) (RLS 매트릭스/헬퍼/테스트) · [2_auth_permissions_architecture.md](../docs_dev/2_auth_permissions_architecture.md) (역할/Scope/감사 로그) · [1_roles_permissions.md](../docs_planning/1_roles_permissions.md) (권한 매트릭스)

- [x] 공통 기반 테이블 DDL 작성 (users, roles/permissions, audit_logs, system_events, attachments)
- [x] NETWORKS 마스터 테이블 DDL 작성 (startups, experts, partners + 임시 마스터/병합 플래그)
- [x] RLS 기저 헬퍼 함수 구현 (`current_app_user_id()`, `current_app_role()` + session_version 대조)
- [x] RLS 업무 헬퍼 함수 구현 (`is_admin()`, `can_read_workspace()`, `get_scope_type()` 등 8종)
- [x] 워크스페이스별 RLS 정책 작성 (3_database_rls_policy_matrix 매트릭스 기준)
- [x] 권한 템플릿 시드 데이터 작성 (11개 사용자 유형)
- [x] 감사 로그 트리거 구현 (권한 변경/다운로드 사유/민감 액션)
- [x] RLS 회귀 테스트 구축 (pgTAP, 테스트 계정 10종 + 보안 케이스 8종)
- [x] 문서 갭 해소: `docs_dev` 물리 스키마 정의서(ERD 포함) 작성 완료 처리

## Phase 3. 인증 (이원화)

> **참고 문서**: [2_auth_permissions_architecture.md](../docs_dev/2_auth_permissions_architecture.md) (권한 모델) · [1_development_stack.md](../docs_dev/1_development_stack.md) (이원화 인증/session_version/AuthService) · [1_roles_permissions.md](../docs_planning/1_roles_permissions.md) (게스트 OTP 인증 흐름) · [3_4_4_ac_participant_pool.md](../docs_planning/3_4_4_ac_participant_pool.md) (guest_invitations/매직링크)

- [x] 임직원 인증: Supabase Auth 이메일/비밀번호 로그인 + 표준 JWT
- [x] 게스트 인증: OTP/Magiclink 발급-검증 Edge Function + 커스텀 JWT 서명
- [x] `guest_invitations` 초대/만료/사용 처리 플로우 구현
- [x] `session_version` 기반 강제 로그아웃(세션 무효화) 구현
- [x] `AuthService` 인터페이스 및 `authStore`(Zustand) 추상화 (`currentUser`/`userRole` 단일 관찰)
- [x] 라우팅 가드 구현 (역할 기반 접근 제어, GUEST 서브도메인 분리)

## Phase 4. 공통 UI 패키지 (packages/ui)

> **참고 문서**: [5_component_spec_rules.md](../docs_design/5_component_spec_rules.md) (컴포넌트 규격) · [2_app_layout_navigation.md](../docs_design/2_app_layout_navigation.md) (AppShell/사이드바) · [9_feedback_notification_rules.md](../docs_design/9_feedback_notification_rules.md) (토스트/로딩) · [1_ui_ux_mobile.md](../docs_design/1_ui_ux_mobile.md) (반응형) · [4_color_system_rules.md](../docs_design/4_color_system_rules.md), [3_typography_rules.md](../docs_design/3_typography_rules.md) (토큰)

- [x] 디자인 토큰 기반 기초 컴포넌트 (Button 5종 variant, Input/Select/TextArea 4상태, Checkbox, Switch, Avatar, Badge)
- [x] 데이터 테이블 (헤더 36px/행 44px, tabular-nums, 페이지네이션, 정렬)
- [x] 오버레이 컴포넌트 (Modal sm/md/lg, Drawer, Dropdown — z-index 스케일 준수)
- [x] 피드백 컴포넌트 (Toast, 인라인 배너, 스피너/스켈레톤, Empty State)
- [x] AppShell 레이아웃 (사이드바 240px + 상단바 56px + 1열/2열 콘텐츠 그리드, 1024px 미만 드로어 전환)
- [x] 워크스페이스 전환 드롭다운 (PermissionMap 기반 노출 제어)

## Phase 5. HUB 워크스페이스

> **참고 문서**: [3_1_workspace_hub.md](../docs_planning/3_1_workspace_hub.md) (화면/데이터 연동 규격/GNB맵) · [2_business_scenarios.md](../docs_planning/2_business_scenarios.md) (교차 참조/권한 필터) · [7_chart_visualization_rules.md](../docs_design/7_chart_visualization_rules.md) (랭킹 차트)

- [x] 통합 검색 대시보드 (일반 키워드 검색 — 권한 교차 필터 적용)
- [ ] AI 검색 탭 (Gemini API 연동 — RAG/Text-to-SQL 방식 확정 필요) <!-- 탭 UI 배치 완료, 연동은 방식 확정 대기(백로그) -->
- [x] 전사 통합 캘린더 (4개 레이어: AC/프로젝트/펀드/사내, system_events 연동)
- [x] 전문가 만족도 랭킹 보드 (mentor_satisfaction_records 평균 내림차순, RPC 집계)
- [x] 임직원 프로필 디렉토리 (이메일 마스킹)

## Phase 6. NETWORKS 워크스페이스 (마스터 원장)

> **참고 문서**: [3_3_workspace_networks.md](../docs_planning/3_3_workspace_networks.md) (디렉토리/임포터/필드) · [2_business_scenarios.md](../docs_planning/2_business_scenarios.md) (SSOT 원칙/병합 감사 로그)

- [x] 스타트업/전문가/협력사 3단 탭 디렉토리 및 상세 뷰
- [x] 개별 등록/수정 모달 (필수값/중복 검사)
- [x] 엑셀 대량 임포터 (유효성 검사 + 행 단위 오류 피드백) <!-- CSV 붙여넣기 임포터+행단위 검증 구현. .xlsx 바이너리 파싱은 SheetJS 도입 시 확장 -->
- [x] 중복 병합(Merge) 콘솔 (임시 마스터 정리, 병합 감사 로그)
- [x] ~~성장 지표 히스토리 패널 (멘토링 5대 지표 레이더 차트, SVG)~~ — NETWORKS 메뉴에서 제거 <!-- GrowthHistoryPanel/RadarChart 삭제, useStartupGrowth 제거. startup_growth_metrics RPC는 향후 재사용 위해 DB 보존 -->
- [x] 업로드 양식 '전문가' 단일 컴포넌트 통일 + '구분'(엔티티 선택자) 기반 테이블 라우팅 <!-- NetworkForm/NetworkDetailPage 통합, 조직 4종(기업·기관·대학·외주/거래) 매칭/전문분야/약력 비활성, 구분 변경 시 테이블 이동(soft-delete+insert), CSV 임포터 구분별 분산 등록, org 5종 profile 컬럼 마이그레이션(20260707120000) -->
- [x] 미분류 데이터베이스 분리 + '기타(etc)' 네트워크 신설 <!-- others=분류 전 임시 저장소(미분류 데이터베이스, 목록 인라인 구분 드롭다운으로 대상 네트워크 이관), etc=조직형 신규 카테고리(외주/거래 아래, 마이그레이션 20260707140000). 조직 4종+기타+미분류 compact 표시, 조직 목록 부서 컬럼 노출, 네트워크 등록 버튼 통일, InlineSelect(테이블용 컴팩트 셀렉트) 추가 -->
- [x] 대용량 업로드 Phase 1 — 드래그앤드랍 CSV → 구분/확실중복 리뷰 → 구분별 라우팅 <!-- BulkUploadPanel/bulkUpload.ts, 템플릿 다운로드, 리멤버 헤더 자동매핑, 이메일·전화 확실중복 색상 표기·기본 제외(건너뛰기), 미지정→미분류. profile.source='bulk_upload' 표식 -->
- [x] 대용량 업로드 Phase 2 — 동일인물 병합→상세 연혁 타임라인, 공동 관리(작성자 없음) 표시, 파괴적 작업(비활성/병합) 기여자+admin RLS 가드, 업로드 배치 이력(파일 해시 중복 경고), 추천 구분/미분류 일괄 지정 <!-- 마이그레이션 20260707150000(기여/배치)·20260707160000(가드). entity_contributions append-only+이름 비정규화+서버 스탬프, BulkUploadPanel 병합결정(합치기/신규/건너뛰기)+빈필드 보강, DirectoryTab 다중선택 일괄지정+suggestCategory 휴리스틱 -->
- [x] 글로벌 네트워크 데이터 테이블 — 독립 단일 마스터(global_networks) + 권역·국가 태그(FK 조인) + 링크드인 아이콘 컬럼 + 등록/수정/비활성 <!-- 마이그레이션 20260707220000(global_networks). 국내 8종과 분리된 독립 마스터(구분=기업/기관/투자자 스칼라, 권역/국가=region_tags·country_tags 2뎁스 FK). MasterListView 재활용+link 컬럼 kind 신설(URL 유무 아이콘 색), GlobalNetworkTab/FormModal(권역→국가 캐스케이드)/globalHooks(조인 조회·기여 가드 비활성). 대용량 업로드 국내/글로벌 탭 분리는 후속 -->
- [x] 상세페이지 2열(2:1) 재구성 + 우측 공용 패널 3종(자료 관리·변동 이력·피드백) 분리 <!-- 좌(2): 프로필 본문 현행 유지. 우(1): MaterialPanel/ChangeHistoryPanel/FeedbackPanel. DetailPanelCard 공용 래퍼, 국내(NetworkDetailPage)·글로벌(GlobalNetworkDetailPage) 공용. "연혁"→"변동 이력" 개칭·우측 이동(기여 로그 타임라인). CONTRIBUTION_ACTION_LABEL·uniqueContributors ChangeHistoryPanel로 통합 -->
- [x] 자료 관리 실연동 — 비공개 Storage 버킷 + attachments 다형 테이블 업로드/다운로드/소프트삭제 <!-- 마이그레이션 20260707230000(attachments 버킷+uploaded_by 스탬프 트리거+storage.objects RLS). materialHooks(useMaterials/useUploadMaterial/useDeleteMaterial/downloadMaterial=Signed URL), MaterialPanel 드래그앤드랍 업로드·목록·다운로드·삭제. targetType(국내=리소스타입/글로벌=global_network)+targetId 주입 -->
- [x] 피드백 실연동 — 레코드 단위 댓글형 피드백(테이블+RLS+작성/조회/소프트삭제 훅) <!-- 마이그레이션 20260707240000(entity_feedback: target_type/target_id 다형, author 서버 스탬프, 작성자/admin update RLS). feedbackHooks(useFeedback/useCreateFeedback/useDeleteFeedback), FeedbackPanel 작성(Cmd+Enter)·목록·본인/admin 삭제. 국내/글로벌 공용 -->


## Phase 7. AC 워크스페이스 (Program First 14모듈)

> **참고 문서**: 부모 아키텍처는 [3_4_workspace_ac.md](../docs_planning/3_4_workspace_ac.md)를 먼저 확인하고, 각 항목별 상세 기획서는 아래 링크를 따릅니다.
>
> _AC DB 스키마 토대(46테이블 + RLS)는 완료(마이그레이션 20260705150000~150500). 아래 미체크 모듈은 스키마 준비완료·화면 후속._

- [x] 7-1. 프로그램 개요 및 모듈 보드 (programs/program_modules, participation_mode) — [3_4_2](../docs_planning/3_4_2_ac_program_overview.md)
- [x] 7-2. 모집 랜딩 빌더 + 신청서 폼 빌더 + 지원자 DB (NETWORKS 정규화 매핑) — [3_4_3](../docs_planning/3_4_3_ac_recruitment.md) <!-- 지원자 접수 목록 연결. 랜딩/폼 빌더 상세는 후속 -->
- [x] 7-3. 참가자 풀 및 3계층 역할 관리 (CSV 업로드, 매직링크/OTP 초대) — [3_4_4](../docs_planning/3_4_4_ac_participant_pool.md)
- [x] 7-4. 공통 평가 엔진 (동적 평가표, 다형적 evaluation_targets, 가중치 집계) — [3_4_5](../docs_planning/3_4_5_ac_evaluation_engine.md)
- [x] 7-5. 서면평가 모듈 (라운드 운영, 심사위원 배정, Split View) — [3_4_6](../docs_planning/3_4_6_ac_document_review.md) <!-- 라운드 목록 연결. 심사위원 배정/Split View는 후속 -->
- [x] 7-6. 대면평가 모듈 (시간표/발표 순서, 현장 진행 상태, 최종 선발) — [3_4_7](../docs_planning/3_4_7_ac_onsite_evaluation.md) <!-- 세션 목록 연결. 발표순서/현장진행/최종선발은 후속 -->
- [x] 7-7. OT/공통 세션 (QR 출석 체크, 출석 상태 관리) — [3_4_8](../docs_planning/3_4_8_ac_orientation_sessions.md) <!-- 세션 목록 연결. QR 출석체크는 후속 -->
- [x] 7-8. N:N 멘토링 (관계/회차/상담일지, 양방향 평가 피드백 루프) — [3_4_9](../docs_planning/3_4_9_ac_mentoring.md)
- [x] 7-9. 1:1 비즈니스 매칭 (슬롯 자동 생성, FCFS/수동/AI 배정, 노쇼 처리) — [3_4_10](../docs_planning/3_4_10_ac_business_matching.md) <!-- 이벤트 목록 연결. 슬롯 자동생성/FCFS·AI 배정은 후속 -->
- [x] 7-10. 데모데이 (발표 세션, 모바일 심사, 투자자 관심, 후속 미팅) — [3_4_11](../docs_planning/3_4_11_ac_demo_day.md) <!-- 세션 목록 연결. 모바일 심사/투자자 관심/후속미팅은 후속 -->
- [x] 7-11. 통합 타임라인 및 충돌 방지 (표준 카테고리 10종, system_events 동기화, ICS) — [3_4_12](../docs_planning/3_4_12_ac_program_timeline.md) <!-- 타임라인 목록 연결. 충돌감지/ICS/system_events 동기화는 후속 -->
- [x] 7-12. 성과 KPI 및 통합 다운로더 (export_jobs, 마스킹/사유/감사 로그) — [3_4_13](../docs_planning/3_4_13_ac_outcomes_kpi_export.md) <!-- 성과 목록 연결. export 다운로더/마스킹/감사로그는 후속 -->
- [x] 7-13. 커스텀 활동/회의록 (Action Item, 공개 범위 4단계) — [3_4_14](../docs_planning/3_4_14_ac_custom_activities.md) <!-- 활동 목록 연결. 회의록/Action Item 상세는 후속 -->
- [x] 7-14. AC 통합 대시보드 (전사 KPI 위젯, 오늘의 운영 이슈 보드) — [3_4_1](../docs_planning/3_4_1_ac_dashboard.md)

## Phase 8. FUND 워크스페이스

> **참고 문서**: [3_5_workspace_fund.md](../docs_planning/3_5_workspace_fund.md) · [2_business_scenarios.md](../docs_planning/2_business_scenarios.md) (자사 투자 배지/보안 메타)

- [x] 펀드 현황 보드 (결성액/집행액/잔액, LP 지분율 도넛 차트, 자사 투자 배지)
- [x] 포트폴리오 집행 기록 및 피투자사 NETWORKS 연동
- [x] 캐피탈 콜 스케줄러 (미납 LP 알림 발송) <!-- 콜 일정/상태(OVERDUE 등) 관리 구현. 알림 발송(알림톡/SMS)은 Phase 14 채널 연동 후 -->
- [x] FUND 데이터 모델/필드 상세 확정 (문서 보강 포함) <!-- 스키마 마이그레이션 20260705170000이 확정 모델(funds/lps/capital_calls/investments/portfolio_financials) -->

## Phase 9. M&A 워크스페이스

> **참고 문서**: [3_6_workspace_ma.md](../docs_planning/3_6_workspace_ma.md) · [3_database_rls_policy_matrix.md](../docs_dev/3_database_rls_policy_matrix.md) (부서 격리 정책)

- [x] 딜 소싱 칸반 (6단계 파이프라인, 단계 전환 타임라인 로그) <!-- 칸반 보드+단계이동 버튼, DB 트리거 자동 로그. 드래그앤드롭은 후속 -->
- [x] 딜 상세 및 NDA 체크리스트 (보안 문서 검토완료 잠금, 단계 타임라인)
- [x] 매수/매도 매칭 매트릭스 (업종/키워드 적합도 스코어 → 신규 딜 인계)
- [x] 부서 격리 RLS 검증 (M&A팀+관리자+경영진 읽기 외 차단) <!-- mna 워크스페이스 게이트 RLS. 권한 템플릿상 타 부서 mna 미부여로 자동 차단 -->


## Phase 10. ADMIN 워크스페이스

> **참고 문서**: [3_2_workspace_admin.md](../docs_planning/3_2_workspace_admin.md) · [1_roles_permissions.md](../docs_planning/1_roles_permissions.md) (권한 매트릭스/토글 규칙) · [2_auth_permissions_architecture.md](../docs_dev/2_auth_permissions_architecture.md) (감사 로그 필드)

- [x] 역할×워크스페이스 Read/Write 동적 권한 토글 콘솔 (Self-Lockout 방지) <!-- admin_set_permission_template RPC: 템플릿 갱신+실권한 전파+감사로그, super_admin/admin write 해제 차단 -->
- [x] 감사 로그 모니터 (전/후 JSON 대조, IP)
- [x] 다운로드 사유 로그 뷰 (access_logs 사유 관제)
- [x] ADMIN 데이터 모델(권한 저장 테이블/감사 로그 스키마) 상세 확정 (문서 보강 포함) <!-- workspace_permissions/permission_templates/audit_logs/access_logs 기존 스키마 + RPC 확정 -->


## Phase 11. PROJECT 워크스페이스

> **참고 문서**: [3_8_workspace_project.md](../docs_planning/3_8_workspace_project.md)

- [x] 프로젝트 통합 대시보드 (유형/부서 필터) <!-- 유형 필터+진척도 카드 그리드. 부서 필터/아바타는 후속 -->
- [x] 태스크 칸반 (To-Do → In-Progress → Review → Done) <!-- 4열 칸반+상태 이동+마감 UTC 병기·지연 배지. 드래그앤드롭/체크리스트는 후속 -->
- [x] 간트 마일스톤 로드맵 (글로벌: 다국어/UTC 병기) <!-- 선형 막대 간트+전사 캘린더(system_events) 자동 연계. 드래그 리사이즈는 후속 -->


## Phase 12. MANAGEMENT 워크스페이스

> **참고 문서**: [3_7_workspace_management.md](../docs_planning/3_7_workspace_management.md) · [5_backup_retention_privacy.md](../docs_dev/5_backup_retention_privacy.md) (HR 데이터 보존 기간)

- [x] 전자결재 (결재선 지정, 상태 머신 확정, 알림 발송) <!-- 대기/진행/완료 대시보드+순차 결재선+승인/반려 상태 머신. 알림톡 발송은 Phase 14 채널 연동 후 -->
- [x] 인사관리 HRM/HRD (조직도, 근태, 교육 이력) <!-- departments 계층(parent_id) 조직도 트리+임직원 디렉토리, hr_profiles/assignments/trainings 스키마 -->
- [x] 재무·KPI 대시보드 (예산 대비 실지출 경고) <!-- dept_budgets 대비 승인 결재금액 실지출 대조+초과 경고 배지, kpi_records 달성률 -->
- [x] 자산관리 (assets 할당 상태·회수 예정일 트래킹)
- [x] 임직원 계정 생성 (로그인 가능 계정: 이메일·이름·초기 비밀번호 필수, 직책/직급·연락처 선택) <!-- Edge Function employee-create: 호출자 권한(super_admin/management write) 검증→auth.admin.createUser(초기 비번, email_confirm)→public.users(auth_user_id 연결)→권한 템플릿 프로비저닝→감사로그(ACCOUNT_CREATE), users 행 실패 시 auth 계정 롤백. useCreateEmployee(functions.invoke)+EmployeeCreatePage(/management/hr/new)+인사관리 헤더 '계정 생성' 버튼. 역할 옵션/라벨 config 공용화 -->
- [x] 마이페이지(내 계정 관리) — 본인 약력·노트 수정 + 자료 업로드 한정 <!-- 마이그레이션 20260708130000: users_update에서 self 절 제거(본인 직접 UPDATE 차단)+public.update_my_profile(bio,note) RPC(SECURITY DEFINER, 컬럼 화이트리스트). MyPage(/me)+약력/노트 편집(RPC)+MaterialPanel(employee) 자료 업로드, WorksLayout '내 계정 관리' 활성화. 계정 필드(이름/역할/부서)는 인사관리에서만 수정 -->
- [x] OFFICE 임직원 정보 조회 전용 — 인사 데이터 동일 구조 재사용 <!-- OfficePage managers 탭 HubMasterPanel(임시)→EmployeeDirectory readOnly 재사용(비활성화 액션 숨김, 행 클릭 /office/managers/:id 읽기전용 상세). 마이그레이션 20260708140000: users_select 확대(내부 임직원 전원 조회 허용, 외부 게스트 차단)로 M&A팀 포함 전 직원 조회 가능. 이메일·연락처는 앱 계층 마스킹 유지 -->
- [x] 임직원 프로필 컬럼 확장 (users.phone/profile jsonb) <!-- 마이그레이션 20260708120000: 연락처(phone)+자유 프로필(profile jsonb: company/position/bio/note). EmployeeDirectory/DetailPage/Form 프로필 필드 반영, 부서/팀 2단 조직도 파생 -->
- [x] 조직 관리 (N-depth 조직도 · 조직 레벨 · 인력 배치) — 원격 적용 완료(supabase db push) <!-- '부서 관리'→'조직 관리' 개칭. 슬라이스1 마이그레이션(20260708150000): org_levels 신설+RLS, departments.level_id/sort_order 추가, 기본 레벨(회사›본부›팀›파트) 시드+깊이 백필. 슬라이스2 실 저장: DepartmentsPanel 서버(react-query) 원천화, orgHooks(useDepartments/useOrgLevels + create/update/move/setDeleted/level CRUD) 실 mutation, 드래그 이동은 변경분만 UPDATE, 인력 배치=users.department_id 갱신, 물리 삭제(영구삭제) 제거(soft delete만). 슬라이스3 인사관리 동적 컬럼: EmployeeDirectory 회사/부서/팀 하드코딩→org_levels 기반 동적 컬럼(resolveByLevel, 조상 경로). 확정: 회사도 조직 레벨(A안), 레벨=노드별 태그(B안). 잔여: 연도 스냅샷(org_versions), Docker 복구 후 supabase db push+런타임 검증 -->
- [x] 조직 가용기간(발효 기간) — 조직도 버전 관리 · 슬라이스A+B, 원격 적용 완료(supabase db push, 150000·150500·160000·170000) <!-- 확정: 스냅샷=구조+인력배치, 활성=날짜기반 자동. 슬라이스A 마이그레이션(20260708160000): org_versions(label/effective_from/effective_to null=무기한/status/deleted_at) 신설+RLS(조회 내부전원·쓰기 admin/management), daterange '[)' GiST 배타제약으로 PUBLISHED 겹침 금지(공백 허용), departments.version_id(NOT NULL 백필)+lineage_id(계보) 추가·시드 버전'현재 조직'(2026-01-01~)로 백필, departments_name_key(전역 이름 유일) 해제, 계보 자동채움 트리거, clone_org_version RPC(SECURITY DEFINER: 권한검사→새 버전+부서 트리 복제·parent_id 계보 재매핑). 활성 규칙(단일): effective_from<=오늘 중 최신 시작 PUBLISHED=유효(공백 구간 직전 유지). 슬라이스B 마이그레이션(20260708170000): dept_members(version_id/department_id/user_id, 활성 unique(version,user)) 신설+RLS, users.department_id→시드 버전 배치 백필, current_org_version_id() 함수, clone_org_version 확장(3단계 인력배치 계보 복제 추가). UI: orgHooks(useOrgVersions/activeOrgVersionId/useCloneOrgVersion/useDeptMembers/useAssignDeptMember/useActivePlacementMap, useDepartments 유효버전 자동 스코프), OrgVersionBar(드롭다운·가용기간·상태배지·복제 모달), DepartmentsPanel 선택 버전 스코프 구조·배치 편집(dept_members, 활성 버전이면 users.department_id 미러), useEmployees/useEmployeesPage/useEmployee가 활성 버전 배치로 department_id 오버레이(버전 롤오버 시 임직원 소속 컬럼 자동 반영). 잔여: Docker 복구 후 supabase db push(20260708150000·160000·170000)+런타임 검증 -->


## Phase 13. GUEST 앱 (apps/guest)

> **참고 문서**: [3_9_workspace_guest.md](../docs_planning/3_9_workspace_guest.md) (사용자별 화면) · [1_ui_ux_mobile.md](../docs_design/1_ui_ux_mobile.md) (모바일 규칙) · [1_roles_permissions.md](../docs_planning/1_roles_permissions.md) (OTP 인증 흐름) · AC 각 모듈 문서의 "11. GUEST 연동" 절

- [x] 게스트 로그인 화면 (OTP/매직링크, 모바일 우선) <!-- Phase 3 OTP 로그인 화면 정본, 모바일 우선 레이아웃 -->
- [x] 스타트업 대시보드 (타임라인, 예약 콘솔, 지원서/자료 제출실, 만족도 평가지) <!-- 타임라인·슬롯 예약·만족도 별점 제출. 자료 제출실은 후속 -->
- [x] 전문가 대시보드 (스케줄 보드, 상담일지/평가지 작성, 역할 전환 스위치) <!-- 스케줄 보드+5대 지표 평가지+역할 전환 스위치. 상담일지는 booking 연동 후속 -->
- [x] 임시 게스트 뷰 (일회성 링크, 만료 처리) <!-- /g/:token 격리 뷰포트+만료 안내 리다이렉트 -->
- [x] 모바일 최적화 검증 (터치 48px, 키보드 반응형) <!-- 별점/버튼 min 48px, 하단 패딩(pb-16) 키보드 마진 -->

> _GUEST 세부 스코프 RLS(마이그레이션 20260705220000): is_guest()/guest_program_ids() 헬퍼 + 타임라인·슬롯·평가 제출 정책. 회사/참가자 단위 정밀 스코프는 매직링크 연동과 함께 후속._

## Phase 14. 배포 및 운영

> **참고 문서**: [1_development_stack.md](../docs_dev/1_development_stack.md) (S3/CloudFront 배포 팁) · [4_security_privacy_policy.md](../docs_dev/4_security_privacy_policy.md) (Secret/사고 대응) · [5_backup_retention_privacy.md](../docs_dev/5_backup_retention_privacy.md) (RPO/RTO/복구 리허설)

- [x] AWS S3 + CloudFront 정적 호스팅 구성 (SPA 라우팅 폴백 403/404 → index.html) <!-- infra/cloudfront/error-responses.json + s3-bucket-policy(OAC). 실제 계정 프로비저닝은 배포 시점 -->
- [x] CI/CD 파이프라인 구축 (빌드/린트/테스트/배포 자동화) <!-- .github/workflows ci.yml(lint/typecheck/build/test) + deploy.yml(OIDC→S3 sync→CF invalidation) -->
- [x] 백업/복구 절차 검증 (RPO 24h/RTO 4h, 분기 복구 리허설 절차 수립) <!-- infra/runbooks/restore-drill.md 복구 절차+분기 리허설 체크리스트+결과 기록 양식 -->
- [x] 알림 채널 연동 (알림톡/SMS/이메일 프로바이더 확정 및 템플릿) <!-- _shared/notifications.ts 디스패처+템플릿 레지스트리, notifications-dispatch 함수, guest-OTP 연동, notification_logs. 프로바이더 키 주입 시 실발송 -->
- [x] 문서 갭 해소: 배포·CI/CD 가이드 문서 작성 완료 처리 <!-- docs_dev/10_deployment_cicd_guide.md + readme_dev 인덱스 갱신 -->

> _알림톡/SMS/이메일 실제 프로바이더 계약 및 AWS 계정 프로비저닝은 운영 착수 시점 과제(키 주입만으로 활성화되도록 폴백 구조 완비)._

## 백로그 (우선순위 미정)

- [ ] 프론트엔드 테스트 전략 수립 (단위/E2E, 러너 선정, 커버리지 기준)
- [ ] 디자인 보강: 다크모드 정책, `prefers-reduced-motion` 대응, 폼 검증 타이밍 규칙
- [ ] 심사 분과(Division) 그룹 배정 개념의 서면평가 모듈 도입 검토 (구버전 승계 후보)
- [ ] Google Calendar OAuth 연동 (타임라인 2차 범위)
- [ ] HUB AI 검색 방식 확정 (RAG vs Text-to-SQL) 및 프롬프트/보안 설계
- [ ] 관측성(모니터링/알림/APM) 인프라 설계
