# ✅ 와이앤아처 통합 Works 플랫폼 개발 진행현황 체크리스트 (PROGRESS.md)

본 문서는 통합 Works 플랫폼의 개발 작업을 단위별로 분할하여 진행 상태를 추적하는 체크리스트입니다. 각 작업 단위가 완료될 때마다 체크박스를 갱신하고, 갱신 즉시 커밋/푸쉬하는 것을 원칙으로 합니다. (운영 규칙은 [CLAUDE.md](./CLAUDE.md) 참조)

* 개발 우선순위는 [3_0_workspace_overview.md](./docs/docs_planning/3_0_workspace_overview.md) 기준: `HUB → NETWORKS → AC → FUND → M&A → ADMIN → PROJECT → MANAGEMENT → GUEST`
* 기술 스택은 [1_development_stack.md](./docs/docs_dev/1_development_stack.md) 기준: Turborepo 모노레포 + React/TS Vite SPA + Tailwind CSS + Supabase(PostgreSQL/RLS/Edge Functions) + AWS S3/CloudFront

---

## Phase 0. 기획 문서 정비 (완료)

- [x] 전체 기획 문서(57개) 전수 검토 및 개발 착수 가능성 진단
- [x] AC 구버전 문서 5종 삭제 및 승계 자산 이식 (5대 평가 지표, 표준 일정 카테고리 10종, 전사 캘린더 매핑)
- [x] 마스터 데이터 SSOT를 NETWORKS로 통일 (임직원 마스터는 MANAGEMENT)
- [x] 백엔드 실행 모델을 Vite SPA + Supabase Edge Functions로 정합화 (Next.js 표현 제거)
- [x] 디자인 컬러 팔레트 단일화 및 누락 토큰 보강 (웜그레이 기준, 사이드바 밝은 배경 확정)
- [x] 상태값/FK 드리프트 정합화 (WAITLISTED 통일, evaluation_targets 다형화, RLS 헬퍼 2계층화)
- [x] 인덱스 문서 최신화 및 Tailwind CSS 공식 스택 명문화

## Phase 1. 프로젝트 기반 셋업

- [ ] Turborepo 모노레포 스캐폴딩 (`apps/works`, `apps/guest`, `packages/ui`, `packages/master-data`)
- [ ] Vite + React + TypeScript 앱 초기화 및 공통 tsconfig/경로 별칭 구성
- [ ] Tailwind CSS 설치 및 디자인 토큰 이관 (`tailwind.config`: 브랜드/그레이/세만틱 컬러, 타이포 스케일, z-index, 모션 duration)
- [ ] ESLint + `no-restricted-imports` 의존성 경계 규칙 설정 (`packages/ui` 내 supabase/react-query 참조 차단)
- [ ] 공통 라이브러리 설치 (TanStack Query, Zustand, React Hook Form + Zod, Day.js, react-router-dom v6)
- [ ] Supabase 프로젝트 생성 및 로컬 개발 환경(supabase CLI) 구성
- [ ] 환경 변수 체계 수립 (`VITE_` 공개 변수 / Edge Function Secret 분리)
- [ ] Git 브랜치 전략 및 커밋 컨벤션 문서화 (`docs_dev` 개발 컨벤션 문서 신규 작성)

## Phase 2. 데이터베이스 물리 스키마

- [ ] 공통 기반 테이블 DDL 작성 (users, roles/permissions, audit_logs, system_events, attachments)
- [ ] NETWORKS 마스터 테이블 DDL 작성 (startups, experts, partners + 임시 마스터/병합 플래그)
- [ ] RLS 기저 헬퍼 함수 구현 (`current_app_user_id()`, `current_app_role()` + session_version 대조)
- [ ] RLS 업무 헬퍼 함수 구현 (`is_admin()`, `can_read_workspace()`, `get_scope_type()` 등 8종)
- [ ] 워크스페이스별 RLS 정책 작성 (3_database_rls_policy_matrix 매트릭스 기준)
- [ ] 권한 템플릿 시드 데이터 작성 (11개 사용자 유형)
- [ ] 감사 로그 트리거 구현 (권한 변경/다운로드 사유/민감 액션)
- [ ] RLS 회귀 테스트 구축 (pgTAP, 테스트 계정 10종 + 보안 케이스 8종)
- [ ] 문서 갭 해소: `docs_dev` 물리 스키마 정의서(ERD 포함) 작성 완료 처리

## Phase 3. 인증 (이원화)

- [ ] 임직원 인증: Supabase Auth 이메일/비밀번호 로그인 + 표준 JWT
- [ ] 게스트 인증: OTP/Magiclink 발급-검증 Edge Function + 커스텀 JWT 서명
- [ ] `guest_invitations` 초대/만료/사용 처리 플로우 구현
- [ ] `session_version` 기반 강제 로그아웃(세션 무효화) 구현
- [ ] `AuthService` 인터페이스 및 `authStore`(Zustand) 추상화 (`currentUser`/`userRole` 단일 관찰)
- [ ] 라우팅 가드 구현 (역할 기반 접근 제어, GUEST 서브도메인 분리)

## Phase 4. 공통 UI 패키지 (packages/ui)

- [ ] 디자인 토큰 기반 기초 컴포넌트 (Button 5종 variant, Input/Select/TextArea 4상태, Checkbox, Switch, Avatar, Badge)
- [ ] 데이터 테이블 (헤더 36px/행 44px, tabular-nums, 페이지네이션, 정렬)
- [ ] 오버레이 컴포넌트 (Modal sm/md/lg, Drawer, Dropdown — z-index 스케일 준수)
- [ ] 피드백 컴포넌트 (Toast, 인라인 배너, 스피너/스켈레톤, Empty State)
- [ ] AppShell 레이아웃 (사이드바 240px + 상단바 56px + 1열/2열 콘텐츠 그리드, 1024px 미만 드로어 전환)
- [ ] 워크스페이스 전환 드롭다운 (PermissionMap 기반 노출 제어)

## Phase 5. HUB 워크스페이스

- [ ] 통합 검색 대시보드 (일반 키워드 검색 — 권한 교차 필터 적용)
- [ ] AI 검색 탭 (Gemini API 연동 — RAG/Text-to-SQL 방식 확정 필요)
- [ ] 전사 통합 캘린더 (4개 레이어: AC/프로젝트/펀드/사내, system_events 연동)
- [ ] 전문가 만족도 랭킹 보드 (mentor_satisfaction_records 평균 내림차순)
- [ ] 임직원 프로필 디렉토리

## Phase 6. NETWORKS 워크스페이스 (마스터 원장)

- [ ] 스타트업/전문가/협력사 3단 탭 디렉토리 및 상세 뷰
- [ ] 개별 등록/수정 모달 (필수값/중복 검사)
- [ ] 엑셀 대량 임포터 (유효성 검사 + 행 단위 오류 피드백)
- [ ] 중복 병합(Merge) 콘솔 (임시 마스터 정리, 병합 감사 로그)
- [ ] 성장 지표 히스토리 패널 (멘토링 5대 지표 레이더 차트)

## Phase 7. AC 워크스페이스 (Program First 14모듈)

- [ ] 7-1. 프로그램 개요 및 모듈 보드 (programs/program_modules, participation_mode)
- [ ] 7-2. 모집 랜딩 빌더 + 신청서 폼 빌더 + 지원자 DB (NETWORKS 정규화 매핑)
- [ ] 7-3. 참가자 풀 및 3계층 역할 관리 (CSV 업로드, 매직링크/OTP 초대)
- [ ] 7-4. 공통 평가 엔진 (동적 평가표, 다형적 evaluation_targets, 가중치 집계)
- [ ] 7-5. 서면평가 모듈 (라운드 운영, 심사위원 배정, Split View)
- [ ] 7-6. 대면평가 모듈 (시간표/발표 순서, 현장 진행 상태, 최종 선발)
- [ ] 7-7. OT/공통 세션 (QR 출석 체크, 출석 상태 관리)
- [ ] 7-8. N:N 멘토링 (관계/회차/상담일지, 양방향 평가 피드백 루프)
- [ ] 7-9. 1:1 비즈니스 매칭 (슬롯 자동 생성, FCFS/수동/AI 배정, 노쇼 처리)
- [ ] 7-10. 데모데이 (발표 세션, 모바일 심사, 투자자 관심, 후속 미팅)
- [ ] 7-11. 통합 타임라인 및 충돌 방지 (표준 카테고리 10종, system_events 동기화, ICS)
- [ ] 7-12. 성과 KPI 및 통합 다운로더 (export_jobs, 마스킹/사유/감사 로그)
- [ ] 7-13. 커스텀 활동/회의록 (Action Item, 공개 범위 4단계)
- [ ] 7-14. AC 통합 대시보드 (전사 KPI 위젯, 오늘의 운영 이슈 보드)

## Phase 8. FUND 워크스페이스

- [ ] 펀드 현황 보드 (결성액/집행액/잔액, LP 지분율 도넛 차트, 자사 투자 배지)
- [ ] 포트폴리오 집행 기록 및 피투자사 NETWORKS 연동
- [ ] 캐피탈 콜 스케줄러 (미납 LP 알림 발송)
- [ ] FUND 데이터 모델/필드 상세 확정 (문서 보강 포함)

## Phase 9. M&A 워크스페이스

- [ ] 딜 소싱 칸반 (6단계 파이프라인, 단계 전환 타임라인 로그)
- [ ] 딜 상세 및 NDA 체크리스트
- [ ] 매수/매도 매칭 매트릭스
- [ ] 부서 격리 RLS 검증 (M&A팀+관리자+경영진 읽기 외 차단)

## Phase 10. ADMIN 워크스페이스

- [ ] 역할×워크스페이스 Read/Write 동적 권한 토글 콘솔 (Self-Lockout 방지)
- [ ] 감사 로그 모니터 (전/후 JSON 대조, IP)
- [ ] 다운로드 사유 로그 뷰
- [ ] ADMIN 데이터 모델(권한 저장 테이블/감사 로그 스키마) 상세 확정 (문서 보강 포함)

## Phase 11. PROJECT 워크스페이스

- [ ] 프로젝트 통합 대시보드 (유형/부서 필터)
- [ ] 태스크 칸반 (To-Do → In-Progress → Review → Done)
- [ ] 간트 마일스톤 로드맵 (글로벌: 다국어/UTC 병기)

## Phase 12. MANAGEMENT 워크스페이스

- [ ] 전자결재 (결재선 지정, 상태 머신 확정, 알림 발송)
- [ ] 인사관리 HRM/HRD (조직도, 근태, 교육 이력)
- [ ] 재무·KPI 대시보드 (예산 대비 실지출 경고)
- [ ] 자산관리

## Phase 13. GUEST 앱 (apps/guest)

- [ ] 게스트 로그인 화면 (OTP/매직링크, 모바일 우선)
- [ ] 스타트업 대시보드 (타임라인, 예약 콘솔, 지원서/자료 제출실, 만족도 평가지)
- [ ] 전문가 대시보드 (스케줄 보드, 상담일지/평가지 작성, 역할 전환 스위치)
- [ ] 임시 게스트 뷰 (일회성 링크, 만료 처리)
- [ ] 모바일 최적화 검증 (터치 48px, 키보드 반응형)

## Phase 14. 배포 및 운영

- [ ] AWS S3 + CloudFront 정적 호스팅 구성 (SPA 라우팅 폴백 403/404 → index.html)
- [ ] CI/CD 파이프라인 구축 (빌드/린트/테스트/배포 자동화)
- [ ] 백업/복구 절차 검증 (RPO 24h/RTO 4h, 분기 복구 리허설 절차 수립)
- [ ] 알림 채널 연동 (알림톡/SMS/이메일 프로바이더 확정 및 템플릿)
- [ ] 문서 갭 해소: 배포·CI/CD 가이드 문서 작성 완료 처리

## 백로그 (우선순위 미정)

- [ ] 프론트엔드 테스트 전략 수립 (단위/E2E, 러너 선정, 커버리지 기준)
- [ ] 디자인 보강: 다크모드 정책, `prefers-reduced-motion` 대응, 폼 검증 타이밍 규칙
- [ ] 심사 분과(Division) 그룹 배정 개념의 서면평가 모듈 도입 검토 (구버전 승계 후보)
- [ ] Google Calendar OAuth 연동 (타임라인 2차 범위)
- [ ] HUB AI 검색 방식 확정 (RAG vs Text-to-SQL) 및 프롬프트/보안 설계
- [ ] 관측성(모니터링/알림/APM) 인프라 설계
