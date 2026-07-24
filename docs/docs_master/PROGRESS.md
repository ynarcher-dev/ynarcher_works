# ✅ 와이앤아처 통합 Works 플랫폼 개발 진행현황 체크리스트 (PROGRESS.md)

본 문서는 통합 Works 플랫폼의 개발 작업을 단위별로 분할하여 진행 상태를 추적하는 체크리스트입니다. 각 작업 단위가 완료될 때마다 체크박스를 갱신하고, 갱신 즉시 커밋/푸쉬하는 것을 원칙으로 합니다.

> [!NOTE]
> **작업 규칙 및 시작 절차는 [CLAUDE.md](./CLAUDE.md)**, 서비스 비전은 [readme_master.md](./readme_master.md), 전체 문서 지도는 [0_service_spec_draft.md](./0_service_spec_draft.md)를 참조하십시오.

* 개발 우선순위는 [3_0_workspace_overview.md](../docs_planning/3_0_workspace_overview.md) 기준: `OFFICE → STARTUP → NETWORKS → AC → M&A/PE → PROJECT → FUND → MANAGEMENT → ADMIN → GUEST`
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
- [x] WORKS 최상위 구조 최신화: `HUB` 조회 센터 역할을 `OFFICE` 전사 업무 허브로 이관하고, 스타트업 운영 뷰를 `STARTUP` 워크스페이스로 분리하는 현재 구현 기준 문서화

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
- [x] 데이터 테이블 (헤더·행 36px, tabular-nums, 페이지네이션, 정렬)
- [x] 오버레이 컴포넌트 (Modal sm/md/lg, Drawer, Dropdown — z-index 스케일 준수)
- [x] 피드백 컴포넌트 (Toast, 인라인 배너, 스피너/스켈레톤, Empty State)
- [x] AppShell 레이아웃 (사이드바 240px + 상단바 56px + 1열/2열 콘텐츠 그리드, 1024px 미만 드로어 전환)
- [x] 워크스페이스 전환 드롭다운 (PermissionMap 기반 노출 제어)
- [x] 섹션 카드(Card)·언더라인 탭(Tabs) 컴포넌트 추가 <!-- 상세 화면 2컬럼 컴포지션용 카드 셸(제목·부제·우측 액션)과 건수 칩 지원 탭. AC 프로그램 상세·M&A 딜 상세 공용 -->
- [x] 컴포넌트 크기 축 재정의 — 중요도(lg/md/sm) → 밀도 맥락(일반 40px / 카드 32px / 표 24px) <!-- 근거: design_system_compliance_audit.md(종결). size prop 제거하고 Card·DataTable이 DensityProvider로 맥락을 하위에 내려준다. 조절판은 packages/ui/src/densityScale.ts 단일 파일. 신설 IconButton·Radio·TagChip·CardShell, 흡수 제거 InlineButton·InlineSelect. Accordion·Breadcrumb은 수요 없어 미신설. 포털 오버레이(Modal·Drawer→page / Dropdown·Toast→card) 맥락 재설정으로 카드·표 안에서 연 모달이 축소되던 결함 해소. 회귀 방어 ESLint 5종(임의 폰트값·컨트롤 임의높이·수제 카드셸·수제 태그·원시 색상). 규격 확인은 /styleguide(WORKS 내부, 메뉴 미노출)에서 3맥락 실측 비교. 주의: tailwind-preset.mjs는 Vite 감시 대상 밖이라 토큰 변경 시 dev 서버 재시작 필요 -->
- [x] 데이터 테이블 정렬·격자 규격 확정 <!-- 헤더·본문 기본 가운데 정렬(예외 열만 align='left'), 행 높이 36px, 셀 사이 세로선(divide-x, 가로선과 동일 굵기), 체크박스 세로 중앙 고정(align-middle). 모달 폭을 타이포 척도(max-w-lg 등)에서 modal-sm~2xl(400/600/800/1000/1200) 전용 토큰으로 분리 -->
- [x] 다중 선택 입력 통일 — 표준 토큰형(A) TokenMultiSelect 신설 <!-- 배경: 사람·태그를 추가할 때 선택 항목 표시 방식이 화면마다 제각각이라는 지적(입력창 안 토큰 vs 밖 칩 vs 행 vs 목록 체크)의 전수조사 결과, 표시 위치 4갈래·칩 스타일 7종으로 파편화. 결정: 검색·추가형 피커는 표시 위치를 (A)입력창 안 토큰형으로, 칩은 공용 TagChip으로 통일. 조치: (1) packages/ui/patterns/TokenMultiSelect 신설 — 제네릭 순수 UI(데이터 미로딩, 후보 풀은 호출부 주입), 선택 칩이 입력필드 안 인라인 TagChip으로 남고 검색·추가/칩클릭·Backspace 제거, allowFreeText로 자유토큰(외부참석자·핵심역량)까지 흡수. (2) 5개 피커 이관: 회의록 참석자·참조(InternalPersonPicker, 커스텀 사각칩 제거)·외부참석자(ExternalAttendeePicker)·캘린더 동행자(CompanionPicker)·스타트업 핵심역량(StartupBusinessTeamFields). (3) 중복 필터 드롭다운 수렴: StartupPoolFilters(MultiTagFilter)·ProgramFilters(StatusFilter)가 각자 복붙하던 팝오버를 공용 MultiSelectFilter로 교체. 유지(의도): 산업·분야 등 소수 고정 옵션 그리드(전부 깔고 선택 강조)와 @멘션(본문 인라인)은 토큰형이 오히려 나빠 현행 TagChip 그대로. tsc(ui+works) 통과 -->
- [x] 글자 위계 SSOT 확정 — cardText/tableText/CHART_TEXT + InfoField <!-- 배경: 카드섹션 텍스트가 전반적으로 연하고 위계가 안 잡힌다는 지적. 원인은 위계를 색이 아니라 크기로 만들고 있던 것 — 색이 gray-700/800 인접 두 단계라 안 보이니 라벨을 12px로 낮춰 보충했고, 그 결과 한 줄에 14/12/11px가 섞였다. 조치: (1) 카드섹션 텍스트 색을 연한 쪽만 한 단계 상향(300→400…600→700, 700·800·900 고정 — 전 단계를 올리면 800이 900과 합쳐져 위계가 눌린다), 상태색(disabled·placeholder) 제외, 50파일 165줄. (2) densityScale에 cardText 신설(title 16px=body-lg semibold / subtitle / subhead / label·value / count) — 카드 제목이 본문과 같은 14px이라 굵기 하나로만 버티던 것을 16px로 올려 `페이지 24 → 섹션 20 → 카드 16 → 본문 14` 사다리를 복원. 같은 클래스 문자열이 앱 40곳에 복제돼 있었고 공용 Card의 20px 규격은 죽은 스펙이었다. (3) 카드 제목 소유권을 Card/PanelCard로 이관, DetailPanelCard(PanelCard와 바이트 동일 중복)·PlaceholderCard 흡수, 수제 제목 6곳 제거. (4) InfoField(호출처 0곳이던 공용 컴포넌트)를 기준 규격으로 올리고 6곳에 복제돼 있던 수제 Info를 별칭으로 통합. (5) MiniTable이 tableText를 직접 참조 — 자체 재선언 과정에서 머리글/값이 한 칸씩 밀리고 primary·empty 두 단계가 사라져 있었다. (6) 차트 축·범례·툴팁 11/11/12px를 CHART_TEXT 하나로(11px 토큰은 배지 전용이라 스케일 밖이었음). (7) 카드 헤더 건수를 알약 배지에서 `[3]` 대괄호 말머리 danger-700로(게시판 [공지] 표기와 같은 판단), 변동 이력 행을 열 고정 격자 + `[수정]` 말머리로. (8) 대시보드 카드가 수제 div라 밀도 맥락을 못 내려주던 것을 CardShell로 교체(안의 버튼이 40px로 렌더되던 버그 동반 해소). 관통 원칙: 한 줄 안에서 크기를 갈라 위계를 만들지 않는다 — 단 제목은 본문보다 연해지면 안 된다(소제목을 gray-500로 내렸다가 되돌림) -->


## Phase 5. OFFICE 워크스페이스 (구 HUB 역할 이관)

> **참고 문서**: [3_1_workspace_hub.md](../docs_planning/3_1_workspace_hub.md) (OFFICE 화면/데이터 연동 규격, 파일명은 링크 연속성을 위해 유지) · [2_business_scenarios.md](../docs_planning/2_business_scenarios.md) (교차 참조/권한 필터) · [7_chart_visualization_rules.md](../docs_design/7_chart_visualization_rules.md) (랭킹 차트)

- [x] OFFICE 대시보드 (상단 개인화 인사, 통합 검색, 워크스페이스 대표 지표 카드, 공지/자료/인사이트 게시판)
- [x] AI 에이전트 탭 UI (자연어 검색/분석 진입점) <!-- Gemini/RAG/Text-to-SQL 실연동 방식 확정은 백로그 -->
- [x] 전사 통합 캘린더 (4개 레이어: AC/프로젝트/펀드/사내, system_events 연동)
- [x] 임직원 정보 조회 전용 탭 (MANAGEMENT 인사 데이터 동일 구조 재사용, 이메일/연락처 앱 계층 마스킹)
- [x] 전자결재 탭 OFFICE 이관 (ApprovalTable 재사용)
- [x] 게시판 홈 (고정 게시판: 공지사항/공용자료실, 일반 게시판: 인사이트 및 신규 생성분)
- [x] 게시판·자료실 구조 재편 + 스키마 신설 — [3_1_1](../docs_planning/3_1_1_board_archive_notice.md) <!-- 마이그레이션 20260720200000_office_boards: board_kind(POST/ARCHIVE)·board_scope enum, boards/board_posts 신설(RLS 분리 정책 + app.can_read/write/notice_board 헬퍼 + 시스템 게시판 가드·작성자 스탬프 트리거), 자료실 전체공지 금지 CHECK(board_kind 비정규화), 기본 3종 시드(전사 알림·인사이트·공용자료실). 프론트: 공지사항을 게시판이 아닌 globalNotice 조회 뷰(NoticeWorkspace)로 재정의해 크로스포스트 사본 폐기, ArchiveWorkspace 신설(상세페이지 없이 1행=1파일 즉시 다운로드), 사이드바 kind 기반 3블록(공지사항/게시판/자료실), pinned=게시판 내 고정과 globalNotice 분리, BoardAdminPanel 구분 선택 추가. tsc/vite build 통과 -->
- [x] 게시판 레지스트리(boards) DB 실연동 — 관리 콘솔·사이드바·OFFICE 탭 <!-- 20260720200000_office_boards를 운영 DB에 적용하고, zustand 인메모리 스토어(useBoardStore)를 react-query 서버 훅(boardHooks: useBoards/useCreateBoard/useUpdateBoard/useSetBoardActive)으로 교체. boardStore.ts는 타입·상수(BoardDef/BOARD_KIND_LABEL/boardsOfKind/시드)만 소유. 쓰기는 RLS로 admin 전용 강제. tsc/vite build 통과 -->
- [ ] 게시글·자료(board_posts) DB 실연동 (조회·작성 훅, 첨부 Storage 업로드, material-download 경유 다운로드) <!-- 게시글은 아직 zustand 인메모리 데모(boardPostStore). 스키마·설계는 3_1_1로 확정됨 -->
- [ ] 게시판 권한 범위 DEPT 구현 (board_scope='DEPT' + board_departments 연결 테이블) <!-- 이번 마이그레이션에서는 enum 값만 예약, 정책 분기 없음(admin 외 차단) -->
- [x] 전사 캘린더 사용자 일정(업무/휴가) 등록·수정·삭제 <!-- 슬라이드오버 캘린더를 상하 배치+컴팩트(이벤트=레이어색 점)로 재구성, 선택일 상세를 업무/휴가/기타로 그룹핑(업무↔휴가 구분선). EventEditorModal(등록/수정 겸용, 저장 후 계속 추가), 카테고리=event_type WORK/LEAVE, 종일·메모(내용)·동행자는 body JSON({all_day,memo,companions}), 시작/종료 날짜+시간(여러 날 걸침=기간 내 모든 날짜 칸 반영). 동행자=내부 임직원 토큰입력(CompanionPicker, 오버레이 드롭다운, TagChip), 작성자 고정 표시. 본인(created_by) 일정만 클릭해 수정/삭제(soft delete). 스키마 변경 없이 기존 system_events RLS(insert/update) 활용, 시스템 레이어(AC/PROJECT/FUND/COMPANY)는 조회에서 제외. hasWorkspaceWrite 추가 -->
- [ ] 회의실 예약/거래처 정보 상세 구현 <!-- 사이드바 메뉴와 준비 중 화면 골격만 존재 -->
- [x] 회의록 STARTUP→OFFICE 이관 + 스키마 신설(전사 공개/참석자 한정, 게시판형 에디터+첨부) <!-- 사이드바·헤더·아이콘을 STARTUP에서 OFFICE 회의실 예약 아래로 이동. 마이그레이션 20260723140000_office_meeting_minutes: 3역할 모델(작성자=author_id / 참석자·참조=meeting_minute_people.role), minute_visibility(OFFICE 전사공개/PARTICIPANTS 참석자한정, 기본 PARTICIPANTS=Default Deny) + minute_person_role enum. 열람 판정 app.can_read_minute(작성자/전사공개+office읽기/태그된사람/admin, 전자결재 재귀회피 패턴), 명단 쓰기는 작성자 전용 app.set_minute_people RPC로만(조인테이블 write 정책 없음=Default Deny). RLS SELECT/INSERT/UPDATE 분리, soft delete, 작성자 스탬프 트리거. 보정 20260723150000: 본문을 안건/논의/결정 3분할→단일 body(리치텍스트 HTML)로 통일, 첨부(attachments target_type='office_minute')를 회의록 접근범위에 종속(select=can_read_minute, insert=is_minute_author, target_type<>'office_minute' 가드로 타 타입 무영향). 프론트: features/office/minutes(minutesApi 서버훅, MinutesWorkspace 목록↔상세↔편집, 상세·편집 2:1 레이아웃(좌 본문 col-span-2 / 우 첨부 col-span-1), 본문=게시판과 동일한 @/components/RichTextEditor(TipTap), 첨부=MaterialPanel(수정)·PendingMaterialPanel+flush(신규), 공개범위 토글, MinutePeoplePicker 참석자·참조 typeahead). 첨부/DB 재사용으로 신규 스키마 없음(attachments 재사용). 보정 20260723160000: 외부참석자(external_attendees text[], 사외 인원=계정 없음, 접근권한 무관 메타) 추가. 인원 UI를 참석자/참조 각각의 별도 필드(InternalPersonPicker 역할 고정형)+외부참석자 텍스트칸(ExternalAttendeePicker)으로 분리. tsc 통과. 보안 게이트 통과 -->
- [x] 회의록 ↔ 사업(AC/M&A/PROJECT)·스타트업 관계형 연동(상호 참조, 양방향) <!-- 마이그레이션 20260723220000_meeting_minute_links: 다형 링크 조인 meeting_minute_links(minute_id, target_type∈{program/ma_program/project_program/startup}, target_id, unique(minute_id,target_type,target_id)) — attachments.target_type/entity_contributions.entity_table와 동일 다형 규약 재사용(전용 FK 미증식). 링크 SELECT RLS=app.can_read_minute(minute_id) 한 줄로 양방향 열람 처리(대상 상세에서 역조회해도 열람불가 PARTICIPANTS 회의록은 행이 안 돌아와 누수 차단). 쓰기는 작성자 전용 app.set_minute_links RPC로만(조인테이블 write 정책 없음=Default Deny), RPC가 대상별 app.can_link_minute_target(각 원장 SELECT 정책 재현 + 소프트삭제·미존재 배제)로 서버측 재검증→접근 가능 대상만 반영("접근 가능 대상만 연동" 결정, UI 숨김 아님 서버 강제). 프론트: minuteLinks.ts(종류·라벨·경로 config SSOT), minutesApi 확장(loadMinuteLinks로 상세에 links 로드+각 원장 제목 조회=접근불가 label null, useSaveMinute에 set_minute_links), relatedMinutesApi(useRelatedMinutes 역방향), minuteLinkSearch(원장별 ilike 검색=RLS로 접근분만), MinuteLinkPicker(종류 세그먼트→검색→칩, 편집기 참석자 아래), MinutesDetail LinkRow(접근시 상세 링크/미접근시 '접근 권한 없음' 배지), RelatedMinutesPanel(RelatedApprovalPanel 스타일, ProgramOverviewTab 우측·StartupDetailPage 우측 삽입, 스타트업은 기존 '회의록' placeholder 대체), OFFICE 회의록 딥링크(?tab=minutes&minute=, MinutesWorkspace initialMinuteId). 여러 개 연동 허용. tsc 통과. 보안 게이트 통과(신규 테이블 RLS Default Deny+SELECT만, SECURITY DEFINER 2종 search_path 고정·authenticated 한정 grant·첫 줄 권한검사, 개인정보 Export 없음) -->
- [x] 자료 간이 뷰어 확장 — 이미지·동영상·텍스트/CSV 인라인 미리보기 <!-- PDF 전용 PdfPreviewModal을 종류별 렌더 MaterialPreviewModal(신규 features/networks/MaterialPreview.tsx)로 일반화. materialHooks에 isImage/isVideo/isTextMaterial + materialPreviewKind(pdf/image/video/text, 오디오는 행 인라인 재생이라 제외) + fetchMaterialText(1MB 상한). 이미지=blob<img>, 동영상=blob<video>, 텍스트/코드/CSV=fetch 후 <pre>(html/svg도 텍스트로만 렌더=XSS 없음, svg는 <img>라 스크립트 미실행), pdf=blob iframe 유지. blob·material-download(RLS·access_logs)·전체화면 토글 인프라 재사용, 의존성 0. webm은 기존 오디오 판별과 겹쳐 content_type=video/일 때만 동영상(음성녹음 회귀 방지). 오피스/한글(docx·xlsx·pptx·hwp)은 브라우저 내장 렌더 불가+렌더러/DOMPurify 미도입이라 다운로드 유지(사용자 확정). tsc·vite build 통과. 회의록 자료 패널이 공용 MaterialPanel 재사용이라 NETWORKS 상세 등 전 화면에 동시 적용 -->
- [x] 전역 진입점(AI 에이전트·전사 캘린더·알림) 모듈형 슬라이드오버 전환 <!-- 상단바 AI/캘린더/알림을 페이지 이동(?tab)·드롭다운에서 현재 화면 위 우측 슬라이드오버로 개편. packages/ui SlideOver 신규(비차단 오버레이=뒤 화면 조작 유지, 우→좌 슬라이드+틴트 연출, z-panel), RightPanelProvider 단일 활성(하나 열면 다른 것 닫힘), 좁은 화면 전체폭 폴백. AiAgentPanel/CalendarPanel 재사용, 알림 목록 NotificationList 추출 -->


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
- [x] 스타트업 풀 구분·담당자·관리현황 라이프사이클 — [3_3_1](../docs_planning/3_3_1_startup_pool_classification.md) <!-- 마이그레이션 20260714120000: 구분(management_status) 코드화(sourced/incubated/invested/other 단일값)+한글→코드 이관, startup_managers(리드1+지원N)+RLS, app.is_startup_manager 헬퍼, pool_status/etc 투자 전용 게이팅 트리거, startups UPDATE 정책 행단위 담당자 잠금, public.promote_to_invested RPC(SECURITY DEFINER, 등록-후-승격 공용). 프론트: startupClassification(코드↔라벨 단일원천), 4개 메뉴 구분별 상호배타 필터 뷰(발굴=sourced만), 탭 인지형 조건부 컬럼(관리현황=투자·발굴경로=발굴)+투자 담당자(리드) 표시, 구분 고정 셀렉트·관리현황 조건부·기타 라벨·담당자 지정 UI·승격 플로우·비담당자 읽기전용. tsc/vite build 통과, 프로덕션 db push 적용 완료. 열린 이슈(강등 정책·담당자 배정 감사로그·컬럼명 리네이밍)는 후속. -->
- [x] NETWORKS 대시보드 탭 구현 (규모 KPI·구분별 분포 도넛·8종 통합 최근 업로드 리스트) — [3_3_2](../docs_planning/3_3_2_networks_dashboard.md) <!-- DashboardTab/dashboardHooks 신규. 규모 KPI 4종(총 보유·이번 달 신규·미분류 대기→others 이동·스타트업)은 테이블별 head 카운트 병렬 집계, 구분별 분포는 recharts 도넛+막대(chart.1~8 팔레트), 최근 업로드는 인물 8종+미분류+스타트업 UNION 최신순 20건(구분 배지·유입경로 배지·등록자·행클릭 상세 이동). tsc/vite build 통과. 후속: 집계 RPC화(SECURITY DEFINER), 분야(expertise) treemap·월별 추이·데이터 완성도/중복 건강도 위젯, 최근 업로드 필터·배치별 보기, 활동·만족도(_activity/_satisfaction 실집계 연동 후). -->
- [x] 신규 등록 화면에서 자료 선첨부 — 등록 저장 시 일괄 업로드 (NETWORKS 국내·글로벌 + STARTUP 등록) <!-- attachments.target_id(NOT NULL) 제약상 레코드 생성 전 업로드가 불가하므로, 등록 폼에서는 파일을 메모리에 보류(usePendingMaterials)했다가 저장 성공 직후 새 id로 순차 업로드한다(선업로드 시 등록 취소 고아파일 발생하므로 미채택). materialHooks에 uploadMaterialFile 공용 실행부 추출, MaterialDropZone(드롭존 공용)·PendingMaterialPanel(보류 목록) 신설, StartupDetailForm(분류 3종 슬롯)·NetworkForm(구분 변경 시 확정 대상 target_type으로 업로드)·GlobalNetworkForm 안내문구 대체. 일부 실패 시 등록은 유지하고 실패 건수를 warning 토스트로 안내. DB 변경 없음. tsc 통과 -->
- [x] '외주/거래(vendors)' 네트워크 은퇴 — 사이드바·대시보드·구분 옵션에서 제거 <!-- UI만 제거하고 public.vendors 테이블·데이터는 보존(물리 삭제 금지). config.ts ENTITY_ORDER/CATEGORY_OPTIONS에서 vendors 제외(정의는 partners와 동일하게 하위호환용 유지), navigation.ts 메뉴 삭제, dashboardHooks STATUS_SLOTS·DashboardTab 톤·WorksLayout 아이콘 제거, 관련 기획/디자인 문서 열거 갱신. tsc 통과. -->
- [x] 글로벌 대용량 업로드 추가 — 국내 9종과 별개로 글로벌 네트워크(global_networks) 전용 CSV 임포터를 한 화면 인페이지 탭으로 <!-- 111번 항목의 '국내/글로벌 탭 분리는 후속' 이행. 사이드바 메뉴는 '대용량 업로드' 하나(?tab=bulk)로 두고, 화면 안에서 BulkUploadSection이 공용 Tabs(국내 네트워크 ↔ 글로벌 네트워크)로 임포터를 전환한다(두 패널을 동시 마운트한 채 hidden 토글 — 탭을 오가도 올려둔 CSV·리뷰가 유지된다). ?tab=bulk_global은 글로벌 탭을 미리 연 딥링크로만 남긴다. 국내 임포터(BulkUploadPanel)와 UX는 동일(드래그앤드랍→구분/중복/결정 리뷰→합치기/신규/미업로드, 비활성 복구 확인, 파일 해시 재업로드 경고)하되 도메인 차이를 반영: (1) 단일 마스터라 재분류 이관(reassign)이 없고 구분(기업/기관/투자자)은 스칼라 컬럼 보강, (2) 링크드인·권역·국가 컬럼 추가 — 권역/국가는 CSV의 '이름'을 region_tags/country_tags에서 대소문자·공백 무시로 매칭해 FK로 저장(못 찾으면 null), (3) 중복 검사는 global_networks 단일 테이블만 조회. 신규 파일 globalBulkUpload.ts(파싱·템플릿·매칭·보강·페이로드)/GlobalBulkReviewTable.tsx/GlobalBulkUploadPanel.tsx/BulkUploadSection.tsx. DB 변경 없음 — global_networks는 이미 log_entity_contribution 트리거가 붙어 있어 카탈로그 게이트(app.has_contribution_trigger)를 통과하므로 기존 upload_insert_entities/upload_enrich_entity RPC를 그대로 재사용(SECURITY INVOKER라 쓰기 권한은 global_networks RLS가 판정). tsc/vite build 통과. -->


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
- [x] 7-15. 프로그램 상세 '개요' 탭 재구성 — 운영 모듈 카드 보드 + 통합 타임라인 캘린더 + 참가자 풀 2컬럼 — [3_4_2](../docs_planning/3_4_2_ac_program_overview.md) <!-- features/ac/detail/ 신설: ModuleBoardCard(활성 모듈 카드: 아이콘·상태 배지·기간·메모, 호버 설정/끄기, 점선 '모듈 추가' 일괄 활성화), ModuleSettingsModal(상태 DRAFT/OPEN/CLOSED·참여방식·일정·메모 → settings jsonb 병합 저장, 마이그레이션 불필요), ProgramScheduleCard(월간 그리드에 모듈 기간 바(상태별 색)+program_timeline_items 행사 점+선택일 상세), ParticipantPoolCard(역할 4그룹 탭+건수 칩+검색+컴팩트 테이블, users FK 조인+startups/experts soft ref 조회 합성). ProgramDetailPage 개요 탭 기본 진입+모듈 카드 클릭→운영 탭 이동+헤더 '성과 허브 →'/'편집' 액션, ProgramFormModal 등록/편집 겸용(기간·설명 확장). 구 ModuleBoard(스위치 리스트) 삭제. tsc/vite build 통과 -->
- [x] 7-16. 프로그램 상세 카드섹션화 + 담당자 배치 체계(부서 협업 · 조직개편 단계 · 기간 세그먼트) — [3_4_2](../docs_planning/3_4_2_ac_program_overview.md) <!-- 상세: PageHeader+전체폭 탭바 제거→NETWORKS·STARTUP식 슬림헤더+lg:grid-cols-3 카드섹션. 좌(2/3) 기본데이터 카드(ProgramInfoCard+ProgramPhotoBox)+서브탭(운영모듈/참가자풀/평가엔진), 우(1/3) 통합타임라인·자료관리·코멘트·변동이력(NETWORKS 공용 패널 target_type='program' 재사용). PanelExpandAction·programContributions 신설. entity_feedback/entity_contributions RLS를 program 대상까지 확장(20260715150000). 담당자 배치: role(PM/MEMBER)·수행기간·투입률 → 기간 세그먼트(사람당 복수구간, surrogate PK) → 부서 계층(program_departments: 메인1+협업n, 협업비율 합100) → org 버전(단계): 조직개편 경계마다 독립 재편성, 단계별 부서 일별 투입률 합=협업비율, 미발행 미래단계 pending. set_program_staffing RPC(SECURITY DEFINER, 직접쓰기 정책 없음)로 원자 저장·검증. 프론트 PhaseStaffingEditor/ProgramDepartmentEditor/ProgramManagerEditor + programManagerCoverage(computePhases·validateStaffing). Modal xl 사이즈+본문 스크롤. 마이그레이션 20260715150000~190000 프로덕션 적용. 목적: 투입률로 품의·지출결의 배분→1인당 생산이익 산출. tsc 통과 -->
- [x] 7-17. 프로그램 상태 단계 이원화 — 제안 단계(제안/미선정 + 제안서 작성~발표 기간) / 운영 단계(준비/진행중/종료/취소 + 실제 행사 관리 기간) — [3_4_2](../docs_planning/3_4_2_ac_program_overview.md) <!-- programs에 proposal_start_date/proposal_end_date 신설(20260716150000, 기존 start/end_date=운영 기간으로 의미 확정, enum 변경 없음). ProgramFormModal을 단계 라디오+제안/운영 2섹션 카드(ProgramStageFields 신설)로 재구성 — 현재 단계의 상태 셀렉트만 활성, 기간은 상시 입력. 상세 기본데이터 카드 제안/운영 기간 병기, 목록 컬럼 운영 시작/종료일로 명명. 기간 제약: 제안·운영 기간 겹침 금지 + 운영 모듈 기간은 제안 또는 운영 구간 내 포함 강제(programPeriods.ts 유틸, ProgramFormModal·ModuleSettingsModal 검증, 모듈 모달에 허용 범위 힌트 표기). ModuleBoardCard/ModuleSettingsModal props를 programId→program으로 전환. tsc/vite build 통과 -->


## Phase 8. FUND 워크스페이스

> **참고 문서**: [3_5_workspace_fund.md](../docs_planning/3_5_workspace_fund.md) · [2_business_scenarios.md](../docs_planning/2_business_scenarios.md) (자사 투자 배지/보안 메타)

- [x] 펀드 현황 보드 (결성액/집행액/잔액, LP 지분율 도넛 차트, 자사 투자 배지)
- [x] 포트폴리오 집행 기록 및 피투자사 NETWORKS 연동
- [x] 캐피탈 콜 스케줄러 (미납 LP 알림 발송) <!-- 콜 일정/상태(OVERDUE 등) 관리 구현. 알림 발송(알림톡/SMS)은 Phase 14 채널 연동 후 -->
- [x] FUND 데이터 모델/필드 상세 확정 (문서 보강 포함) <!-- 스키마 마이그레이션 20260705170000이 확정 모델(funds/lps/capital_calls/investments/portfolio_financials) -->
- [x] 자사 펀드 투자 ↔ 스타트업 관계형 연동 (집행액 자동 집계, 스타트업 투자 현황 병합 표시) <!-- 20260723120000: investments.valuation 추가, funds.drawn_amount(집행액)를 SUM(investments.amount) 트리거 집계로 전환(app.sync_fund_drawn_amount, SECURITY INVOKER), STARTUP 조회 브리지 public.startup_fund_investments(SECURITY DEFINER+호출자검사+authenticated grant). FUND 상세 포트폴리오 탭에 투자 집행 등록/수정/삭제 모달(InvestmentFormModal), StartupGrowthSection 투자 현황 표·차트에 자사 펀드 투자 병합('자사' 배지). 입력=FUND 소유, 스타트업=조회만. 결성액은 손입력 유지 -->

## Phase 9. M&A 워크스페이스

> **참고 문서**: [3_6_workspace_ma.md](../docs_planning/3_6_workspace_ma.md) · [3_database_rls_policy_matrix.md](../docs_dev/3_database_rls_policy_matrix.md) (부서 격리 정책)

- [x] 딜 소싱 칸반 (6단계 파이프라인, 단계 전환 타임라인 로그) <!-- 칸반 보드+단계이동 버튼, DB 트리거 자동 로그. 드래그앤드롭은 후속 -->
- [x] 딜 상세 및 NDA 체크리스트 (보안 문서 검토완료 잠금, 단계 타임라인)
- [x] 매수/매도 매칭 매트릭스 (업종/키워드 적합도 스코어 → 신규 딜 인계)
- [x] 부서 격리 RLS 검증 (M&A팀+관리자+경영진 읽기 외 차단) <!-- mna 워크스페이스 게이트 RLS. 권한 템플릿상 타 부서 mna 미부여로 자동 차단 -->
- [x] 딜 상세 2컬럼 리치화 — AC 프로그램 상세와 동일 골격(좌: 작업 카드 / 우: 타임라인·정보) <!-- features/mna/detail/ 신설: DealStageCard(소싱→계약 5단계 스텝퍼: 완료/진행/대기 배지+단계 진입일+다음 단계 전환 액션, 완료/무산 종결 행), DocChecklistCard(기존 체크리스트를 카드화+검토 n/n 배지), DealTimelineCard(전환 로그), DealInfoCard(대상기업·추정가액·담당 심사역 users 조회·보류·메모). MnaDealDetailPage 컴포지션 재구성. tsc/vite build 통과 -->
- [x] M&A 워크스페이스 사업 원장 구조 전환 — AC와 동일한 대시보드/내 딜/전체 딜 + 리스트뷰 + 사업 상세 <!-- features/program 공용 모듈 공유(MNA_WORKSPACE config 주입). 원장 ma_* 8테이블 신설(20260720140000), 카테고리 SELL/BUY/PE_FUND/ETC, 모듈 템플릿은 CUSTOM_ACTIVITY만. 구 화면(칸반·매칭 매트릭스·딜 상세) 제거, ma_deals 등 구 테이블은 soft 보존 -->
- [ ] M&A 딜 파이프라인·NDA 체크리스트·매칭 매트릭스 모듈 템플릿 재도입 <!-- 3_6_workspace_ma.md §4 후속 확장 과제 -->
- [ ] ma_* 원장 마이그레이션 운영 DB 반영(supabase db push) 및 RLS 회귀 테스트


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
- [x] PROJECT 워크스페이스 사업 원장 구조 전환 — AC와 동일한 대시보드/내 프로젝트/전체 프로젝트 + 리스트뷰 + 상세 <!-- features/program 공용 모듈 공유(PROJECT_WORKSPACE config 주입). 원장 project_* 8테이블 신설(20260720150000), 카테고리는 ETC 단일(구 project_type 폐지), 모듈 템플릿은 CUSTOM_ACTIVITY만. 구 화면(태스크 칸반·간트) 제거, projects 등 구 테이블은 soft 보존 -->
- [ ] PROJECT 태스크 보드·간트 마일스톤 모듈 템플릿 재도입 <!-- 3_8_workspace_project.md §4 후속 확장 과제 -->
- [ ] project_* 원장 마이그레이션 운영 DB 반영(supabase db push) 및 RLS 회귀 테스트


## Phase 12. MANAGEMENT 워크스페이스

> **참고 문서**: [3_7_workspace_management.md](../docs_planning/3_7_workspace_management.md) · [5_backup_retention_privacy.md](../docs_dev/5_backup_retention_privacy.md) (HR 데이터 보존 기간)

- [x] 전자결재 (결재선 지정, 상태 머신 확정, 알림 발송) <!-- 대기/진행/완료 대시보드+순차 결재선+승인/반려 상태 머신. 알림톡 발송은 Phase 14 채널 연동 후 -->
- [x] 인사관리 HRM/HRD (조직도, 근태, 교육 이력) <!-- departments 계층(parent_id) 조직도 트리+임직원 디렉토리, hr_profiles/assignments/trainings 스키마 -->
- [x] 재무·KPI 대시보드 (예산 대비 실지출 경고) <!-- dept_budgets 대비 승인 결재금액 실지출 대조+초과 경고 배지, kpi_records 달성률 -->
- [x] 자산관리 (assets 할당 상태·회수 예정일 트래킹)
- [x] 임직원 계정 생성 (로그인 가능 계정: 이메일·이름·초기 비밀번호 필수, 직책/직급·연락처 선택) <!-- Edge Function employee-create: 호출자 권한(super_admin/management write) 검증→auth.admin.createUser(초기 비번, email_confirm)→public.users(auth_user_id 연결)→권한 템플릿 프로비저닝→감사로그(ACCOUNT_CREATE), users 행 실패 시 auth 계정 롤백. useCreateEmployee(functions.invoke)+EmployeeCreatePage(/management/hr/new)+인사관리 헤더 '계정 생성' 버튼. 역할 옵션/라벨 config 공용화 -->
- [x] 마이페이지(내 계정 관리) — 본인 약력·노트 수정 + 자료 업로드 한정 <!-- 마이그레이션 20260708130000: users_update에서 self 절 제거(본인 직접 UPDATE 차단)+public.update_my_profile(bio,note) RPC(SECURITY DEFINER, 컬럼 화이트리스트). MyPage(/me)+약력/노트 편집(RPC)+MaterialPanel(employee) 자료 업로드, WorksLayout '내 계정 관리' 활성화. 계정 필드(이름/역할/부서)는 인사관리에서만 수정 -->
- [x] 임직원 프로필 사진·약력을 NETWORKS와 동일 규격으로 통일 — 원격 적용 완료(supabase db push) <!-- 문제: 마이페이지·인사관리의 약력이 NETWORKS의 구조 약력(학력/경력/자격증/수상)이 아니라 textarea 한 줄이었고, 사진은 EmployeeDetailPage가 `PhotoBox src={null}`로 자리만 잡아 저장 경로 자체가 없었다. 공용화: PhotoPicker(사진 미리보기+첨부/삭제, 2MB data URL 규약)·CareerView(약력 표시, hasCareerRows)를 features/networks에 추출하고 NetworkForm/NetworkDetailPage도 이 둘을 쓰도록 이관(중복 제거). 임직원 3면 반영: EmployeeForm(사진 카드+CareerEditor), MyPage(사진·약력·노트 3카드+하단 단일 저장), EmployeeDetailPage(PhotoBox src=profile.photo, 약력=CareerView, 구조 약력이 없으면 레거시 profile.bio 자유 텍스트 폴백). 저장 규약은 NETWORKS와 동일(profile.photo / profile.background), 노트는 임직원 기존 키 profile.note 유지(이관 없음). 마이그레이션 20260721180000: update_my_profile(bio,text) 폐기→(p_note, p_photo, p_background jsonb) 재정의(SECURITY DEFINER·search_path 고정·본인 행 한정·키 화이트리스트), 서버측 검증 추가(photo는 data:image/ 접두사+길이 2.8MB 상한, background는 알려진 4개 섹션 키의 배열만·10만자 상한). 세 값은 항상 함께 전송하며 빈 값=삭제. profile.bio는 RPC가 건드리지 않는다(읽기 폴백 전용) -->
- [x] OFFICE 임직원 정보 조회 전용 — 인사 데이터 동일 구조 재사용 <!-- OfficePage managers 탭 HubMasterPanel(임시)→EmployeeDirectory readOnly 재사용(비활성화 액션 숨김, 행 클릭 /office/managers/:id 읽기전용 상세). 마이그레이션 20260708140000: users_select 확대(내부 임직원 전원 조회 허용, 외부 게스트 차단)로 M&A팀 포함 전 직원 조회 가능. 이메일·연락처는 앱 계층 마스킹 유지 -->
- [x] 임직원 프로필 컬럼 확장 (users.phone/profile jsonb) <!-- 마이그레이션 20260708120000: 연락처(phone)+자유 프로필(profile jsonb: company/position/bio/note). EmployeeDirectory/DetailPage/Form 프로필 필드 반영, 부서/팀 2단 조직도 파생 -->
- [x] 조직 관리 (N-depth 조직도 · 조직 레벨 · 인력 배치) — 원격 적용 완료(supabase db push) <!-- '부서 관리'→'조직 관리' 개칭. 슬라이스1 마이그레이션(20260708150000): org_levels 신설+RLS, departments.level_id/sort_order 추가, 기본 레벨(회사›본부›팀›파트) 시드+깊이 백필. 슬라이스2 실 저장: DepartmentsPanel 서버(react-query) 원천화, orgHooks(useDepartments/useOrgLevels + create/update/move/setDeleted/level CRUD) 실 mutation, 드래그 이동은 변경분만 UPDATE, 인력 배치=users.department_id 갱신, 물리 삭제(영구삭제) 제거(soft delete만). 슬라이스3 인사관리 동적 컬럼: EmployeeDirectory 회사/부서/팀 하드코딩→org_levels 기반 동적 컬럼(resolveByLevel, 조상 경로). 확정: 회사도 조직 레벨(A안), 레벨=노드별 태그(B안). 병렬 티어: sort_order를 티어 값으로 재활용(같은 값=병렬 레벨, 예 본부·실). 인사관리 컬럼은 티어당 1개로 합침(buildTiers/resolveByTier, 헤더 '본부 / 실'). OrgLevelEditor 티어 가로·병렬 세로 스택(새 티어/병렬 추가), childLevelId는 다음 티어 기준. 마이그레이션 불필요. 인사 미노출: departments.hr_hidden(마이그레이션 20260708200000, clone 승계) — 트리 행 눈 토글로 지정. 토글은 계보(lineage_id) 단위로 전 버전 일괄 적용(useSetDeptHrHidden, 활성/편집 버전 불일치 방지). EmployeeDirectory/HrReflectPreview는 resolveByTier가 hrHidden 조상을 건너뛰고, EmployeeDetailPage/MyPage 소속 경로도 미노출 제외(하위·인원 정상). 잔여(레벨): 기존 레벨의 티어 이동 UI(현재는 삭제 후 재추가). -->
- [x] 조직 레벨 버전 스냅샷화 — 원격 적용 완료 <!-- 마이그레이션 20260709120000_org_levels_versioned.sql: org_levels에 version_id(소속 버전)+lineage_id(계보) 추가. 그동안 레벨이 전역 공유라 예정 버전에서 레벨명 변경 시 현재·인사 컬럼에 즉시 누수되던 설계 오류 해결. 백필: 기존 레벨→시드 버전 귀속(lineage=self), 시드 외 기존 버전엔 계보 유지 복제+그 버전 부서 level_id를 자기 버전 레벨로 재매핑. version_id NOT NULL+uq(version,lineage)+lineage 자동채움 트리거. clone_org_version 확장(레벨 스냅샷 복제+부서 level_id 계보 매핑, SECURITY DEFINER·search_path·권한검사 유지). 프론트: useOrgLevels(versionId?) 버전 스코프(미지정=활성 버전 자동), useCreateOrgLevel version_id 필수, OrgTreeEditor/DepartmentsPanel 선택 버전 전달, EmployeeDirectory는 활성 버전 자동. 보안 게이트: 새 테이블 없음(컬럼 추가)·RLS 기존 정책 유지·SECURITY DEFINER 규칙 준수·DELETE 정책 미추가(soft delete). 원격 적용(db push) 완료. -->
- [x] 조직 성과·KPI 관리 기획서 작성 (3_7_1) <!-- docs_planning/3_7_1_management_performance_kpi.md 15절 정형 템플릿. 실제 「2026년 KPI 세부기준」 반영해 스코어링 엔진으로 개정. 확정: KPI를 「지표 카탈로그(kpi_metrics) / 스코어링 룰(kpi_scoring_rules: BAND 구간·음수·상한개방·클램프 / PER_UNIT_CAP 건당+합계한도 / GRADE_MAP 정성등급) / KPI 템플릿(kpi_templates: scope_type ORG|INDIVIDUAL 조직용·개인용 복수 × 본부계보 × role_hint)」 3층으로 분리. 부서/개인 KPI는 scope_type 차이일 뿐 동일 엔진, 정량/정성=룰 타입, 상대수/절대수=목표값(target) 유무로 흡수. 노코드 빌더(구간 테이블 에디터·템플릿 복제). 할당(kpi_assignments): 조직용/개인용 템플릿을 조직(계보)/임직원에 수동+자동추천(본부 계보·profile.position 대조)으로 할당, 한 대상에 복수 겹침 허용. 조직↔개인 롤업은 dept_members(useActivePlacementMap) 조인으로 도출(새 인사 필드 is_leader 불필요). 할당별 목표 오버라이드(kpi_targets), 실적+전자문서 증빙(kpi_actuals.evidence_ref), fn_score 서버 산출, 상대평가·정원 배분 등급(S~E)·조건부 보정(회사 총매출/이익률 트리거)·인센티브 지급률·MI. 계보(subject_lineage_id) 귀속으로 개편 연속성. 15절 테스트는 첨부 문서 실제 수치 골든 케이스(155%→120점, cap 150, S→120). 인덱스(0_service_spec_draft) 등록. 마이그레이션/구현은 후속. -->
- [ ] 조직 성과·KPI 관리 구현 (3_7_1 기획 기반: kpi_metrics/kpi_scoring_rules/kpi_templates/kpi_template_items/kpi_assignments/kpi_targets/kpi_actuals/kpi_results/kpi_grade_policies 마이그레이션 + fn_score 엔진 + 노코드 빌더/템플릿 할당(수동+자동추천)/실적입력/조직·개인 롤업 대시보드 탭)
- [x] 조직 개편(Reorganization) 모달 — 현재 조직 현황 + DRAFT 초안 설계 → 예약/취소, 현재 조직 읽기모드 보호 <!-- 마이그레이션 불필요(기존 clone_org_version RPC + org_versions UPDATE RLS 활용). 흐름: 조직 개편 버튼→모달 상단 현재 운영 조직 현황(시작일/종료일 미정/운영 N일째, dayjs) + 구분선 + 개편 섹션(새 시작일·종료 예정일=비우면 무기한). '구조 설계 시작'→현재 조직을 복제 후 status=DRAFT로 낮춤(useUpdateOrgVersion 신설)→모달 안에서 OrgTreeEditor로 설계(즉시 저장). '예약하기'=status PUBLISHED 확정(예정 버전), '취소하기'/백드롭=초안 soft delete 폐기. DRAFT는 useOrgVersions에서 status=PUBLISHED 필터로 드롭다운/타임라인 비노출(모달이 draftId 로컬 관리). 리팩터: DepartmentsPanel 인라인 트리→OrgTreeEditor(versionId/activeVersionId/editable) 추출·재사용(365→148줄), DeptTreeRow editable prop(읽기전용 시 드래그·이름편집·레벨셀렉트·인력배치·액션 숨김). 조직관리 패널 기본 읽기모드(조회 배너)+‘직접 편집’은 경고 모달 후 전환, OrgVersionBar '새 버전 복제' 버튼 showClone=false로 숨김(개편이 대체·드롭다운은 조회 유지). 검증: tsc/vite build/모듈 트랜스폼/서버 부팅 통과(라이브 클릭스루는 미실행). --> 확정: 스냅샷=구조+인력배치, 활성=날짜기반 자동. 겹침 정책 변경: 초기 '겹침 금지'→'시작일 타임라인(겹침 허용)'으로 완화(20260708180000, org_versions_no_overlap 제거). 무기한 '현재 조직' 위에 예정 버전을 만들 수 있도록. 활성은 시작일 규칙으로 결정되어 겹쳐도 모호X. 드롭다운은 현재/예정/종료 3그룹(optgroup) + 복제 실패 모달 표시. 슬라이스A 마이그레이션(20260708160000): org_versions(label/effective_from/effective_to null=무기한/status/deleted_at) 신설+RLS(조회 내부전원·쓰기 admin/management), daterange '[)' GiST 배타제약으로 PUBLISHED 겹침 금지(공백 허용), departments.version_id(NOT NULL 백필)+lineage_id(계보) 추가·시드 버전'현재 조직'(2026-01-01~)로 백필, departments_name_key(전역 이름 유일) 해제, 계보 자동채움 트리거, clone_org_version RPC(SECURITY DEFINER: 권한검사→새 버전+부서 트리 복제·parent_id 계보 재매핑). 활성 규칙(단일): effective_from<=오늘 중 최신 시작 PUBLISHED=유효(공백 구간 직전 유지). 슬라이스B 마이그레이션(20260708170000): dept_members(version_id/department_id/user_id, 활성 unique(version,user)) 신설+RLS, users.department_id→시드 버전 배치 백필, current_org_version_id() 함수, clone_org_version 확장(3단계 인력배치 계보 복제 추가). UI: orgHooks(useOrgVersions/activeOrgVersionId/useCloneOrgVersion/useDeptMembers/useAssignDeptMember/useActivePlacementMap, useDepartments 유효버전 자동 스코프), OrgVersionBar(드롭다운·가용기간·상태배지·복제 모달), DepartmentsPanel 선택 버전 스코프 구조·배치 편집(dept_members, 활성 버전이면 users.department_id 미러), useEmployees/useEmployeesPage/useEmployee가 활성 버전 배치로 department_id 오버레이(버전 롤오버 시 임직원 소속 컬럼 자동 반영). 원격 적용(db push) 완료 및 런타임 검증 완료. -->


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
- [x] 보안 안정화 P0 일괄 조치 (12_immediate_security_stabilization_tasks.md) <!-- authStore 기본인증 제거, workspace_key office/startup 정합화(마이그레이션 2건), lint 0 error, log_sensitive_access RPC, material-download Edge Function+직접서명차단, CORS ALLOWED_ORIGINS, 알림 운영 폴백 차단, SSRF redirect 재검사, Vitest 17케이스 -->
- [ ] 운영 CORS 차단 활성화: 운영 도메인 확정 후 `supabase secrets set ALLOWED_ORIGINS=...` 적용 (현재 미설정 유예 모드) <!-- 12번 문서 P0-6 후속 -->
- [ ] 첨부 보안 등급(security_grade) 컬럼 설계 및 민감 파일 다운로드 사유 필수화 <!-- 12번 문서 P0-5 후속, 13번 가이드 §5 -->
- [x] NETWORKS 공동관리 확정: 기여 로그 기반 파괴적 작업 가드 해제 + 기여 로그 사칭 차단 <!-- 20260721120000. 기여 로그를 권한 판정에서 분리(로그 한 줄 삽입으로 가드 통과 / 로그 유실 시 전면 개방 두 구멍 제거). NETWORKS 8종은 수정·비활성화·병합 모두 networks 쓰기 권한자 공용(안전장치=soft delete+사유 필수+이력). 담당자 지정 콘텐츠(STARTUP 투자기업 startup_managers, PROGRAM program_managers)는 각자 원장으로 판정하므로 영향 없음. stamp_contribution_actor를 무조건 스탬프로 고정 + INSERT 정책에 user_id=current_app_user_id() 추가. 화면 라벨 '담당자(공동관리)'→'기여자'(값이 기여자인데 라벨이 담당자였음). RLS 회귀 테스트 15→20케이스. 운영 DB 반영은 별도 -->
- [x] **[선행]** entity_contributions·entity_feedback RLS를 워크스페이스 인지형으로 정합화 <!-- 20260721130000. AC·M&A·PROJECT가 다형 키 'program' 하나를 공유해 정책이 전부 AC로 판정했다 — M&A/PROJECT 사용자는 자기 사업의 변동 이력·코멘트를 못 보고, AC 권한자는 남의 워크스페이스 기록을 볼 수 있었다. 키를 원장별로 분리(program/ma_program/project_program)하고, 판정 헬퍼 app.entity_key_workspace(키→워크스페이스) + 기존 app.can_access_ws_program(ws,id)으로 위임. 대안(값 유지 + 정책이 세 원장을 조회)은 행마다 최대 3회 조회를 무는 구조라 기각. 백필은 실제 0행이었다(기여 14건 전량 AC, M&A/PROJECT 로그·코멘트 미발생, 고아 0) — 데이터 이동 없이 앞으로의 기록만 갈린다. attachments는 정책이 워크스페이스 무관이라 'program' 유지(불필요한 백필로 기존 첨부를 잃을 위험만 생김). 프론트: ProgramWorkspaceConfig.entityKey 신설로 세 워크스페이스가 각자 키를 주입, recordProgramContribution 시그니처에 키 추가, ProgramOverviewTab의 'AC 전용' TODO 해소. 운영 DB 반영 완료 -->
- [x] 기여 로그 트리거 이관 1단계 — 사업 원장 3종(programs·ma_programs·project_programs) <!-- 20260721140000. app.log_program_contribution() 하나를 세 원장이 공유하고 다형 키는 트리거 인자(TG_ARGV[0])로 주입한다(AC 'program' / M&A 'ma_program' / PROJECT 'project_program' — 20260721130000의 분리값과 동일해야 함). 기록 규칙: INSERT→created / deleted_at null→not null→deactivated / 그 외 실제 값 변경→edited. updated_at은 to_jsonb 차집합으로 비교에서 제외해 '아무것도 안 바뀐 저장'이 이력을 오염시키지 않게 했다. 얻은 것 둘 — (1) useDeactivateProgram이 기록 호출을 아예 갖고 있지 않아 소프트 삭제가 이력에 통째로 빠져 있던 누락을 메웠고, (2) 원장 쓰기와 로그 쓰기가 별개 요청이라 앞만 성공할 수 있던 비원자성을 없앴다(게다가 호출부가 .catch(()=>{})로 실패를 삼키고 있었다). SECURITY DEFINER인 이유: 로그 삽입은 사용자 요청이 아니라 원장 변경의 부산물이고, 원장 쓰기가 이미 자기 RLS를 통과한 뒤라 로그 정책이 막아 이력만 비는 편이 더 위험하다. 행위자 위조는 여전히 불가 — user_id는 기존 BEFORE 트리거 stamp_contribution_actor가 무조건 덮어쓴다. GRANT EXECUTE 없음(원장 트리거로만 기동). 사업 3종을 먼저 한 이유는 대량 업로드 경로가 없어 클라이언트 기록과 겹칠 여지가 없기 때문. 프론트: recordProgramContribution 함수 자체를 삭제하고 호출 2곳(useCreateProgram·useUpdateProgram) 제거, useDeactivateProgram에 contributions 무효화 추가. tsc/eslint 통과, 운영 DB db push 완료 -->
- [x] 기여 로그 트리거 이관 2단계 — startups·global_networks <!-- 20260721150000. 업로드 경로가 없는 두 원장을 먼저 옮겼다(업로드는 NETWORKS 전용이라 클라이언트 기록과 겹칠 여지가 없다). 범용 기록 트리거 app.log_entity_contribution() 도입 — 다형 키는 트리거 인자, 사유·배치처럼 트리거가 알 수 없는 정보는 트랜잭션 GUC app.contribution_ctx(jsonb)로 받는다. 컨텍스트가 없으면 평범한 수동 조작으로 간주하므로 원장을 직접 고치는 기존 화면 경로는 손대지 않아도 그대로 기록된다. 사유가 필요한 비활성화는 deactivate_entity RPC 경유. 이 RPC를 SECURITY INVOKER로 둔 것이 핵심 결정 — DEFINER면 RLS를 우회하므로 startups의 담당자 잠금 같은 정책을 함수 안에 복제해야 하고, 그 복제본이 정책과 어긋나는 순간 권한 구멍이 된다. INVOKER면 원장 UPDATE가 기존 정책으로 그대로 검사되고 함수는 사유를 실어 주기만 한다. 메워진 누락 둘: global_networks 수정은 기록 호출이 아예 없어 변경 이력이 남지 않았고, 비활성화는 로그를 먼저 남기고 원장을 지우는 2요청 구조라 뒤가 실패하면 비활성화 기록만 있고 실제로는 살아 있는 행이 생길 수 있었다. 투자 승격 RPC(promote_to_invested)에는 컨텍스트 한 줄을 더해 폼 저장 시 남는 수정 두 줄 중 뒤의 것이 무엇인지 알아볼 수 있게 했다. tsc/eslint 통과, 운영 DB db push 완료 -->
- [x] 기여 로그 트리거 이관 3단계 — NETWORKS 원장 11종 + 이관·병합·대량 업로드 RPC화 <!-- 20260721160000. 트리거를 켜는 순간 손으로 기록하는 경로는 전부 두 줄이 되므로 이 슬라이스는 쪼갤 수 없었다 — 트리거(experts·van·exp·investors·corporates·institutions·universities·vendors·etc·others·partners)와 이관·병합·업로드 전환을 한 번에 넣었다. 은퇴한 vendors·하위호환 partners도 포함(화면에서 내렸을 뿐 테이블은 살아 있고, 바뀐다면 남아야 한다). 허용 목록은 손으로 나열하지 않고 app.has_contribution_trigger()가 카탈로그에서 '기록 트리거가 실제로 붙어 있는가'를 읽는다 — 목록과 트리거 집합이 어긋나면 사유는 사라지고 로그도 안 남는 조용한 유실이 되기 때문. 신규 RPC 5종 전부 SECURITY INVOKER라 쓰기 권한은 각 원장 RLS가 그대로 판정한다(정책 복제 없음): reassign_entity(대상 등록+원본 비활성화 원자화 — 클라이언트가 방금 만든 행을 물리 삭제로 되돌리던 보상 로직이 사라져 물리 삭제 금지 규약에도 부합), merge_entity, upload_insert_entities, upload_enrich_entity, deactivate_entity(허용 목록 확대). app.insert_entity_row는 jsonb_populate_record가 빠진 컬럼을 NULL로 채워 기본값(id·created_at·created_by)을 덮어쓰는 것을 막으려 '넘어온 키'만 컬럼 목록으로 세운다. 병합 기록 방향 교정: 종전엔 정본에만 남겼는데 트리거는 실제 바뀌는 행(중복)에서 돌고, 중복은 병합 후 목록에서 사라져 이력을 열 수 없다 — RPC가 양쪽에 남긴다(중복=어디로 흡수됐는지, 정본=무엇을 흡수했는지). 보강할 값이 없는 '업로드 재유입'은 원장이 안 바뀌어 트리거가 볼 것이 없으므로 RPC가 기록만 남긴다. 트리거 함수는 deleted_at 판정을 jsonb 경유로 바꿔(merged_into_id와 동일 방식) 컬럼 구성이 다른 원장에서 런타임 오류가 나지 않게 했다. 해소된 결함: 수정·미분류 일괄 이관·임포터 누락, 구분 변경 created 2줄 중복, 업로드의 '원장은 들어갔는데 배치 표식이 없는 행'. 프론트에서 recordContribution·recordGlobalContribution 두 함수를 모두 삭제했다. tsc/eslint 0 error/vite build 통과, 운영 DB db push 완료 -->
- [x] 사업 원장 3종 등록자(created_by) 자동 기록 + 기여 로그 기반 백필 <!-- 20260721170000. AC·M&A·PROJECT 사업 목록의 등록자가 전부 `-`로 비어 있던 문제. programs/ma_programs/project_programs의 created_by에 기본값이 없고 등록 경로(useCreateProgram)도 값을 넣지 않아 모든 행이 NULL이었다. NETWORKS 13종은 20260714130000에서 같은 문제를 기본값으로 해결했는데 그때 사업 원장이 대상에서 빠졌고, 이후 M&A·PROJECT 원장이 AC를 복제하며 그 구멍까지 복제됐다. 표시만의 문제가 아니다 — '내 사업' 스코프가 created_by 또는 담당자 원장으로 판정하므로, 내가 등록했지만 담당자로 지정되지 않은 사업이 내 목록에서 사라지고 등록자 검색도 항상 빈 결과가 된다. 백필은 근사가 아니라 실제 복원이다: 변동 이력(entity_contributions)의 최초 'created' 행위자를 원장별 다형 키(program/ma_program/project_program)로 되짚어 귀속했다(20260714130000은 이력이 없어 운영자 계정으로 근사 귀속했던 것과 대비). 기여 로그조차 없는 행은 NULL로 둔다. NOT NULL 제약은 추가하지 않는다. 운영 DB 적용 완료 -->
- [x] 수정 사유(변동 이력 코멘트) 필수화 — NETWORKS·STARTUP·사업 3종 <!-- 20260721200000. 변동 이력의 마지막 열은 이미 source(수기/업로드)+note를 이어 붙여 보여 주는데, note를 채우는 경로가 비활성화·이관·병합·업로드뿐이라 일반 수정은 전부 '수기'로만 쌓여 무엇이 왜 바뀌었는지 읽을 수 없었다. 수정 저장에도 사유를 필수로 받는다. 클라이언트는 트랜잭션 GUC를 직접 세팅할 수 없으므로 deactivate_entity와 같은 방식의 update_entity(p_table,p_id,p_values,p_note) RPC를 신설했다 — SECURITY INVOKER라 쓰기 권한은 각 원장 RLS가 그대로 판정하고, 대상 판정은 app.has_contribution_trigger()에 위임한다(허용 목록을 손으로 나열하지 않는다). SET은 넘어온 키만(jsonb_populate_record 통째 사용 시 빠진 컬럼이 NULL로 덮인다), id·created_at·created_by·deleted_at·merged_into_id는 거절한다 — 조용히 무시하면 '보냈는데 반영되지 않은 저장'이 되고, 통과시키면 작성자·생성시각을 클라이언트가 갈아 끼울 수 있다. 사업 3종은 컨텍스트를 읽지 않는 app.log_program_contribution()을 쓰고 있어 note를 넘겨도 버려지고 has_contribution_trigger 판정에도 걸리지 않았다 — 트리거를 공용 app.log_entity_contribution()으로 교체하고 옛 함수를 제거해 기록자를 하나로 합쳤다. 프론트는 Promise를 돌려주는 공용 훅 useEditReasonPrompt(30자, 비활성화 사유와 동일 규격)로 두어 폼마다 모달을 배선하지 않고 저장 핸들러에 두 줄만 넣는다(NetworkForm·EntityFormModal·GlobalNetworkForm·StartupDetailForm·ProgramFormModal). 구분 이관은 이관 사유가 따로 기록되므로 제외. 임직원(users)은 기록 트리거가 없어 범위 밖. 보안 게이트: 신규 RPC는 INVOKER·revoke public·grant authenticated·인자 화이트리스트 검증 통과. tsc 통과, 운영 DB db push 완료 -->
- [x] INVOKER RPC 403 장애 해소 — app 스키마 USAGE 부여 <!-- 20260721210000. update_entity가 404(스키마 캐시) 뒤 403으로 계속 실패해 추적한 결과, 20260721160000 배포 이후 deactivate_entity·reassign_entity·merge_entity·upload_* 까지 전부 42501로 깨져 있었다(비활성화·이관·병합·대량 업로드가 운영에서 동작하지 않는 상태였다). 원인은 권한의 층이 하나 빠진 것: 이 RPC들은 의도적으로 SECURITY INVOKER라 본문의 app.has_contribution_trigger()·app.insert_entity_row()도 호출자 권한으로 해석되는데, 함수 EXECUTE는 부여했지만 authenticated에게 app 스키마 USAGE가 없어 이름 해석 단계에서 먼저 막혔다 — '권한은 줬는데 권한이 없다'로 보인 이유다. RLS 정책 속 app.is_admin()이 멀쩡했던 것은 정책 표현식의 함수가 이미 OID로 굳어 있어 스키마 이름 해석을 거치지 않기 때문으로, 이 결함은 평문으로 app.x()를 부르는 INVOKER RPC에만 나타난다. USAGE 부여가 노출을 넓히지 않는 근거: PostgREST에 노출된 스키마는 public 뿐이라 클라이언트가 app 함수를 REST로 부를 방법이 없고, 늘어나는 것은 이미 상위 권한인 SQL 직접 접속 주체의 접근뿐이며 함수별 EXECUTE는 종전 그대로다. 대안이었던 '헬퍼를 public으로 이동'은 app.insert_entity_row가 임의 원장 INSERT 진입점으로 노출되어 더 나쁘고, 'RPC를 DEFINER로'는 각 원장 RLS를 함수 안에 복제하게 되어 규약 위반이다. 운영 DB에서 authenticated 롤·실제 JWT claims를 흉내내 update_entity(성공/사유 누락 23514/보호 컬럼 22023)와 deactivate_entity를 트랜잭션 롤백으로 실증했고, 값이 실제로 바뀌는 수정에서 이력에 note가 붙는 것까지 확인했다 -->
- [ ] 기여 로그 읽기 훅 3벌(useContributions/useGlobalContributions/useProgramContributions) 통합 + 서버 페이징 <!-- 현재 limit 없이 전량 fetch 후 클라이언트에서 5건씩 절단. queryKey 규약도 PROGRAM만 어긋나 무효화 누락 -->

> _알림톡/SMS/이메일 실제 프로바이더 계약 및 AWS 계정 프로비저닝은 운영 착수 시점 과제(키 주입만으로 활성화되도록 폴백 구조 완비)._

## 백로그 (우선순위 미정)

- [ ] `features/hub` 폴더명 정리 (죽은 워크스페이스 이름 잔재) <!-- HUB는 워크스페이스로 삭제됐고(WORKS 키 10종에 없음, admin/config.test.ts가 not.toContain('hub')로 못박음) 역할은 OFFICE가 승계했다. 그런데 게시판·AI 에이전트·통합검색·캘린더 구현체가 아직 features/hub/에 남아 있어, 코드를 읽는 사람이 "HUB가 아직 있나"를 되묻게 된다(실제로 발생). 소비처는 OfficePage·WorksLayout·admin(BoardAdminPanel). features/office로 흡수하거나 features/board 등 기능명으로 개명. import 40여 곳이 바뀌는 기계적 변경 -->
- [ ] 프론트엔드 테스트 전략 수립 (단위/E2E, 러너 선정, 커버리지 기준)
- [ ] 디자인 보강: 다크모드 정책, `prefers-reduced-motion` 대응, 폼 검증 타이밍 규칙
- [ ] 심사 분과(Division) 그룹 배정 개념의 서면평가 모듈 도입 검토 (구버전 승계 후보)
- [ ] Google Calendar OAuth 연동 (타임라인 2차 범위)
- [ ] OFFICE AI 에이전트 검색 방식 확정 (RAG vs Text-to-SQL) 및 프롬프트/보안 설계
- [x] 권한 원장 정합화: 프론트 `WorkspaceKey`의 `office`/`startup`과 DB `workspace_key` enum·permission seed·ADMIN 권한 콘솔 노출 항목을 일치시키는 마이그레이션/설정 정비 <!-- 20260716130000(hub→office rename+startup 신설)·130100(시드/정책/RPC 갱신), admin config, RLS 회귀 케이스9 -->
- [ ] 프론트 로컬 데모용 mock/dev 인증 프로바이더 분리 (authStore 기본 인증 제거 후속, 필요 시)
- [ ] 관측성(모니터링/알림/APM) 인프라 설계
