# 📑 와이앤아처 통합 Works 플랫폼 서비스 기획 종합 인덱스 (0_service_spec_draft.md)

본 문서는 와이앤아처 통합 Works 플랫폼의 **각 폴더별 기획/설계 문서들이 무엇을 의미하고 설계상 어떤 역할을 담당하는지**에 대해 상세하게 요약 정리한 종합 인덱스 가이드입니다. 전체 기획 산출물의 체계적인 탐색과 상호 유기성을 파악하는 지도로 활용됩니다.

---

## 📂 1. 마스터 정책 및 종합 안내 (`docs_master`)
플랫폼의 최상위 방향성을 수립하고 문서들의 목적지를 제어하는 공간입니다.

* **[readme_master.md](./readme_master.md) (서비스 비전 명세서)**
  * **의미**: 본 플랫폼의 비즈니스 배경, 추진 비전(데이터 통합, 전 주기 유기성, 금융 보안), 주요 핵심 워크스페이스(OFFICE, STARTUP, NETWORKS, AC, FUND, M&A/PE 등)의 정의 및 사용자 타겟팅을 가장 포괄적으로 정리한 기획 개념 원천 문서입니다.
* **[0_service_spec_draft.md](./0_service_spec_draft.md) (서비스 기획 종합 인덱스)**
  * **의미**: 기획 문서 5대 폴더 및 하위 모든 세부 파일들의 요약과 기획적 역할을 일목요연하게 안내하는 문서 네비게이터(본 문서)입니다.
* **[CLAUDE.md](./CLAUDE.md) (작업 규칙 및 개발 진입점)**
  * **의미**: 확정된 아키텍처 결정(NETWORKS SSOT, Vite SPA + Edge Functions, Tailwind 등), 커밋 컨벤션, 문서 톤앤매너 및 작업 시작 절차를 정의한 **모든 개발 작업의 단일 진입점** 문서입니다.
* **[PROGRESS.md](./PROGRESS.md) (개발 진행현황 체크리스트)**
  * **의미**: 전체 개발 작업을 Phase 0(문서 정비) ~ Phase 14(배포) 단위로 분할한 체크리스트로, 작업 완료 시마다 체크박스를 갱신하고 즉시 커밋/푸쉬하여 진행 상태를 추적하는 단일 트래커입니다.

---

## 📂 2. 비즈니스 시나리오 및 상세 요건 (`docs_planning`)
플랫폼의 실제 비즈니스 프로세스, 권한 테이블 및 각 워크스페이스별 화면/기능 명세를 포함하고 있습니다.

* **[readme_planning.md](../docs_planning/readme_planning.md) (기획 폴더 인덱스)**
  * **의미**: 비즈니스 기획 문서들의 구성 및 작업 히스토리를 관리하는 요약 인덱스 파일입니다.
* **[1_roles_permissions.md](../docs_planning/1_roles_permissions.md) (상세 권한 및 역할 정의서)**
  * **의미**: 사용자 그룹별(임직원, 스타트업, 외부 전문가, 슈퍼 관리자 등) 접근 권한 매트릭스와 워크스페이스별 CRUD 읽기/쓰기 범위를 명시하여 철저한 정보 보안 경계를 수립합니다.
* **[2_business_scenarios.md](../docs_planning/2_business_scenarios.md) (비즈니스 시나리오 흐름 규격서)**
  * **의미**: 스타트업 발굴 ➔ 보육 프로그램 선발 ➔ 멘토링 매칭 ➔ 최종 평가 ➔ 투자 검토 ➔ 사후 관리 ➔ M&A 딜 검토에 이르는 전체 비즈니스 라이프사이클 속에서 데이터가 어떻게 누락 없이 유기적으로 전달되고 순환되는지 규정합니다.
* **[3_0_workspace_overview.md](../docs_planning/3_0_workspace_overview.md) (워크스페이스 개요 및 파일 맵)**
  * **의미**: 9개 내부 워크스페이스와 GUEST 외부 채널의 목적을 간략히 대조하고 세부 요건 기획 문서(3_1 ~ 3_9 및 파생 문서)로 연결하는 게이트웨이 문서입니다.
* **[3_1_workspace_hub.md](../docs_planning/3_1_workspace_hub.md) (OFFICE 워크스페이스 상세 기획서, 구 HUB 문서명 유지)**
  * **의미**: 기존 HUB의 전사 포털 역할을 승계한 OFFICE 화면 요건을 정의합니다. 전사 대시보드, 통합 검색, AI 에이전트, 임직원 조회 전용 디렉토리, 전사 캘린더, 전자결재, 게시판, 회의실 예약을 포함하며, 거래처 정보는 MANAGEMENT 원장을 가려진 뷰로 읽는 조회면입니다(§1.10).
* **[3_1_1_board_archive_notice.md](../docs_planning/3_1_1_board_archive_notice.md) (OFFICE 게시판·자료실·공지사항 구조 설계)**
  * **의미**: 게시 기능을 게시판(`POST`)과 자료실(`ARCHIVE`) 두 종류로 확정하고, 공지사항을 별도 게시판이 아닌 게시글 플래그(`global_notice`) 기반 조회 뷰로 재정의합니다. `boards`/`board_posts` 물리 스키마와 권한 범위(`board_scope`)를 규정합니다.
* **[3_1_2_office_asset_checkout.md](../docs_planning/3_1_2_office_asset_checkout.md) (OFFICE 자산 현황 기획서)**
  * **의미**: 회사에 어떤 공용 물품이 어느 지사에 몇 개 있고 누가 맡고 있는지를 임직원 전원에게 보여 주는 **조회 전용 목록**을 명세합니다. 2026-08-25에 예약·승인·반출·반납·연체 흐름을 폐지하고 화면을 여기까지로 축소했습니다 — 반출 흐름은 누군가 반납을 눌러 주어야 재고가 풀리는데 그 클릭이 실제로는 눌리지 않아, 한 사람이 잊는 순간 원장이 굳었기 때문입니다. 갱신을 사람에게 기대야 하는 사실(지금 누가 들고 나갔나)은 창고의 오프라인 현황판이 갖고, 앱은 원장이 아는 사실만 보여 준다는 경계를 담습니다. MANAGEMENT 권한이 없는 임직원에게 물품과 사진만 노출하는 `portable_assets` 뷰, 지사 탭·검색·표·상세 모달 사양, 폐지된 `asset_checkouts` 원장의 처분과 `assets.requires_approval` 정리를 후속 과제로 포함합니다.
* **[3_1_3_approval_return_flow.md](../docs_planning/3_1_3_approval_return_flow.md) (전자결재 되돌림·재상신 기획서)**
  * **의미**: 결재자가 문서를 되돌리는 일(반려·반송·보완 요청)과 기안자가 다시 올리는 일(재상신)을 명세합니다. 2026-09-05에 **반려를 종결에서 목적지를 갖는 되돌림으로** 재정의했습니다 — 종전에는 반려가 문서를 `REJECTED`로 못 박고 수정·재상신 경로를 모두 닫아, 오탈자 하나에도 새 문서를 써야 했습니다. 되돌림은 **돌아갈 지점**(내 앞 순번 중 이미 승인한 행)과 **기안자 경유 여부** 두 축을 갖고, 네 조합이 각각 현행 반려·보완 요청·반송·재판단에 대응합니다. 건너뛴 단계가 정당한지는 시스템이 판정하지 않고 되돌린 사람이 책임지며, 시스템은 그 지정을 기록하고 결재선 표에 생략으로 세우는 일만 합니다. 도장은 지우지 않고 회차(`round`)로 쌓으며, 상태 enum은 늘리지 않습니다.
* **[3_2_workspace_admin.md](../docs_planning/3_2_workspace_admin.md) (ADMIN 워크스페이스 상세 기획서)**
  * **의미**: 사용자 등급별 메뉴 접근 권한 제어 콘솔과 시스템 보안 감사 로그 모니터링 화면 요건을 기획합니다.
  * **[3_2_1_admin_module_registry.md](../docs_planning/3_2_1_admin_module_registry.md) (ADMIN 모듈 관리 기획서)**: 사업 운영 모듈의 템플릿 카탈로그를 ADMIN이 배치하는 원장(`module_templates`)과 화면을 정의합니다. 종전에 DB enum·코드 상수·워크스페이스별 허용 목록·화면 메타 네 곳으로 흩어져 있던 판단(순서·분류·사용 여부·워크스페이스 노출·공유 상한)을 원장 하나로 모으되, 화면 구현이 있어야 성립하는 것(아이콘·진입 탭·라벨)은 코드에 남깁니다. 관통 규칙은 **카탈로그와 노출 상한이 기존 인스턴스에 다르게 작용한다**는 것입니다 — 사용 여부·워크스페이스 노출을 끄면 새로 만들 수만 없고 진행 중인 인스턴스는 그대로 동작하는 반면, GUEST 공개·링크 공유 상한을 내리면 이미 열린 것도 즉시 닫힙니다(주소·저장값은 보존되어 되돌리면 복구).
* **[3_3_workspace_networks.md](../docs_planning/3_3_workspace_networks.md) (NETWORKS 워크스페이스 상세 기획서)**
  * **의미**: 외부 전문가, 투자사, 기업, 기관, 대학, 외주/거래처, 글로벌 네트워크 등 전사 핵심 외부 네트워크 마스터 데이터를 개별 등록/수정/관리하고 대량 임포터 화면을 명세합니다. 스타트업 물리 원장은 `public.startups`로 유지하되, 업무 화면은 STARTUP 워크스페이스에서 다룹니다.
  * **[3_3_1_startup_pool_classification.md](../docs_planning/3_3_1_startup_pool_classification.md) (STARTUP 워크스페이스 / 스타트업 풀 구분·담당자·관리현황)**: 스타트업 마스터의 구분(발굴/보육/투자/기타) 라이프사이클, 담당자 권한 모델, 관리현황 적용 범위 및 STARTUP 워크스페이스의 4개 목록 뷰를 규정합니다.
  * **[3_3_2_networks_dashboard.md](../docs_planning/3_3_2_networks_dashboard.md) (NETWORKS 대시보드 및 최근 업로드 현황)**: 네트워크 자산의 규모·구성·성장 추이·데이터 건강도 인포그래픽과 8종 통합 최근 업로드 리스트 화면을 명세합니다.
  * **[3_3_3_startup_menu_stat_cards.md](../docs_planning/3_3_3_startup_menu_stat_cards.md) (STARTUP 메뉴별 통계 카드 섹션)**: 대시보드에 지표를 몰아넣는 대신 각 목록 메뉴(내 기업 관리·투자·보육·발굴·기타)가 메뉴명 아래에 자기 통계 카드 4장을 이고 가는 구조를 기획합니다. 카드별 집계 정의와 데이터 원천, 현행 스키마 기준 실현 가능성(즉시/조인/신규) 판정을 담은 후보안 단계 문서입니다.
  * **[3_3_4_networks_unified_ledger.md](../docs_planning/3_3_4_networks_unified_ledger.md) (NETWORKS 통합 원장 — 구분·지역 2축)**: 원장 11종(국내 10 + 글로벌 1)을 `public.networks` 하나로 합치고 구분(카테고리)과 지역(국내/해외)을 직교한 두 컬럼으로 세우는 설계 정본입니다. 이관 값 매핑, 다형 키 정규화, 구 원장 보존 방식, 메뉴·목록·폼·업로드 재편과 회귀 지점을 규정합니다.
  * **[3_3_5_startup_ai_fill.md](../docs_planning/3_3_5_startup_ai_fill.md) (STARTUP 상세 'AI 작성하기' — 첨부 자료 기반 카드 자동 채움)**: 자료 관리 카드 아래 버튼 하나로 첨부 PDF를 Gemini에 보내 상세 카드 10종(역량 4·실적 6)을 카드 단위 체크박스로 골라 채우는 기능의 정본입니다. 카드↔컬럼 매핑과 보존 키 규칙, 공통 프롬프트 규약(핵심단어 표기), 카드별 상세 프롬프트, 데이터 없음·상충·형식 미지원 예외 처리, Edge Function 설계와 보안 게이트를 규정합니다. 저장은 사람이 하며 DB 변경은 없습니다.
* **[3_4_workspace_ac.md ~ 3_4_15_ac_public_links.md](../docs_planning/3_4_workspace_ac.md) (AC 워크스페이스 시리즈)**
  * **의미**: Program First 기반의 모듈형 스타트업 보육 프로그램 운영 플랫폼 명세로서, 프로그램 개요 및 모듈 보드, 모집 랜딩 및 신청 DB, 통합 참가자 풀, 공통 평가 엔진 및 서면/대면 심사, OT 및 출석 세션, N:N 멘토링 관계, 1:1 비즈니스 매칭 및 AI 자동 배정, 데모데이 피칭 및 투자자 관심 매칭, 통합 타임라인 충돌 방지, KPI 성과 요약 및 통합 엑셀 다운로더, 기본 템플릿 3종(글쓰기·URL첨부·파일첨부) 기록 등을 포함하는 액셀러레이팅 핵심 흐름을 담고 있습니다.
  * **[3_4_15_ac_public_links.md](../docs_planning/3_4_15_ac_public_links.md) (모듈 링크 공유 기획서)**: 운영 모듈 하나를 로그인 없이 열람·제출할 수 있는 단독 주소로 내보내는 축을 정의합니다. 종전 공유 범위의 세 번째 값 `PUBLIC`이 이름만 있고 익명 접근 경로가 없어 `GUEST_ONLY`와 동일하게 동작하던 상태를 정리하고, 공유 범위는 로그인 사용자 사이의 노출(2값)만 답하도록 좁힙니다. 가르는 기준은 *이 화면이 보는 사람이 누구인지 알아야 성립하는가*이며, 허용 템플릿 4종(모집·글쓰기·URL첨부·파일첨부)·주소 발급과 재발급·공개 상태와 기간·링크가 죽는 조건 4종·익명 RLS 정책을 두지 않는 보안 경로를 담습니다. AC·M&A·PROJECT 공통 적용.
* **[3_5_workspace_fund.md](../docs_planning/3_5_workspace_fund.md) (FUND 워크스페이스 상세 기획서)**
  * **의미**: 결성 펀드 개요, 출자자(LP) 명부 관리, 분기별 자본금 납입 요청(캐피탈 콜) 관리 및 피투자 스타트업의 지분율 현황과 재무 정보 추적 화면 요건을 정의합니다.
* **[3_6_workspace_ma.md](../docs_planning/3_6_workspace_ma.md) (M&A 워크스페이스 상세 기획서)**
  * **의미**: 투자 유치 및 인수합병 딜 소싱 관리를 위해 매수/매도 희망 조건 기반의 매칭 매트릭스와 협상 진척 사항을 기록하는 명세서입니다.
* **[3_7_workspace_management.md](../docs_planning/3_7_workspace_management.md) (MANAGEMENT 워크스페이스 상세 기획서)**
  * **의미**: 인사 관리(HRD/HRM), 재무 실적 및 성과 지표 대시보드, 전자결재 등 경영지원 업무 처리를 위한 대시보드 기획입니다.
* **[3_7_1_management_performance_kpi.md](../docs_planning/3_7_1_management_performance_kpi.md) (MANAGEMENT 조직 성과·KPI 관리 기획서)**
  * **의미**: 조직/부서 버전 구조 위에서 부서·개인 KPI를 「지표 카탈로그 / 스코어링 룰(BAND·PER_UNIT_CAP·GRADE_MAP) / KPI 템플릿(조직용·개인용)」 3층 룰 엔진으로 커스터마이즈하는 성과관리 기획서입니다. 항목별 상이한 점수 규정(구간·음수·상한개방·건당한도·정성등급)을 노코드 빌더로 편집하고, 조직용/개인용 템플릿을 조직·임직원에 수동+자동추천으로 할당(복수 겹침)하며, 소속(dept_members) 조인으로 조직↔개인 롤업 뷰를 도출합니다. 조직 계보(lineage) 귀속으로 개편 연속성을 보장하고, 실적·증빙→점수 산출→상대평가·정원 배분·조건부 보정·인센티브 지급률까지 15절 정형 템플릿으로 명세합니다.
* **[3_7_2_management_assets.md](../docs_planning/3_7_2_management_assets.md) (MANAGEMENT 자산 관리 기획서)**
  * **의미**: 자산 조회 표를 취득부터 폐기까지 추적하는 자산 원장으로 확장하는 기획서입니다. 지사 원장(branches)에 필수 귀속시켜 지사 탭이 곧 화면 구조가 되게 하고, 분류(구매·리스·렌탈·기타)·상태 4종·할당 대상(임직원)·취득/폐기일자·금액·반출 가능 여부(토글)를 원장 필드로 정의합니다. 등록자 열 없이 수정일만 남기는 표 규격, OFFICE 반출대장이 소비할 `is_portable` 기준값, 새 테이블 없이 `public.assets`를 확장하는 마이그레이션 설계를 포함합니다.
* **[3_7_3_management_attendance.md](../docs_planning/3_7_3_management_attendance.md) (MANAGEMENT 근태 관리 기획서)**
  * **의미**: 임직원이 대시보드 `근무체크`에서 찍은 출근·퇴근을 MANAGEMENT `근태 관리`가 판독·정정하는 근태 원장 기획서입니다. 판정 기준(출근 가능 시간대·출근 마감=지각선·소정 근무시간·근무 요일)을 코드가 아니라 근무 정책 원장에 두고 전사 기본 + 임직원별 예외 2단으로 운용하며, 근태 상태를 원장(시스템 5종 + 관리자가 늘리는 휴가류)으로 두어 값 추가가 마이그레이션을 부르지 않게 합니다. 자동 판정값과 관리자 확정값을 한 행에 함께 남기고 정정에는 사유를 강제하며(전용 이력 원장), 판정 기준을 행에 복사해 두어 정책을 바꿔도 과거 판정이 흔들리지 않게 합니다.
* **[3_7_4_management_partners.md](../docs_planning/3_7_4_management_partners.md) (MANAGEMENT 거래처 정보 기획서)**
  * **의미**: 회사가 대금을 주고받는 상대(거래처)를 코드·상호·구분(개인/법인)·등록번호·계좌(은행·계좌번호·예금주)·증빙 서류 2종으로 담는 원장 기획서입니다. 거래처 코드는 `YN-` + 등록순 5자리를 원장 트리거가 잠금 아래에서 매기며 사람이 고르지 않고 발급 후 불변입니다. 구분 하나가 등록번호의 뜻(사업자등록번호 10자리 ↔ 생년월일 8자리)과 서류 이름(사업자등록증 ↔ 신분증)을 함께 가르고, 계좌 세 값은 함께 서거나 함께 비며, 증빙은 비공개 버킷에 두고 열람 시 `access_logs` 적재를 선행합니다. NETWORKS 외주/거래 마스터(`vendors`)와 합치지 않는 이유(노출 범위)와, OFFICE 조회면을 원장 정책 확대가 아니라 가려진 뷰(계좌번호 뒤 4자리·개인 생년월일은 연도까지·증빙 서류 없음)로 내는 이유를 함께 정의합니다.
* **[3_8_workspace_project.md](../docs_planning/3_8_workspace_project.md) (PROJECT 워크스페이스 상세 기획서)**
  * **의미**: 신사업 및 글로벌 사업부 통합 프로젝트/태스크 관리 및 간트 차트 기반 마일스톤 화면 요건입니다.
* **[3_9_workspace_guest.md](../docs_planning/3_9_workspace_guest.md) (GUEST 워크스페이스 상세 기획서)**
  * **의미**: 스타트업 대표 및 외부 전문가가 별도 회원가입 절차 없이 간편 로그인하여 지원서 접수, 자료 제출, 정성 피드백 작성을 진행하는 외부 참여자용 전용 채널의 명세입니다.
* **[3_9_1_guest_unified_account.md](../docs_planning/3_9_1_guest_unified_account.md) (게스트 통합 계정 기획서)**
  * **의미**: 게스트 계정의 단일 원천입니다. 계정을 **사업 단위가 아니라 대상 단위**로 발급하고(키는 이메일이 아니라 원장 행), 자격증명을 초대 행에서 신설 원장 `guest_credentials`로 옮기며, 로그인을 이메일·비밀번호 2요소로 좁힙니다. 사업코드는 안내·식별용으로만 남고, 세션 맥락 클레임을 `context_type`+`context_id`로 일반화해 FUND 연동에 대비합니다. 접근 기간은 계정이 아니라 참여 줄이 갖고, 권한은 **발급=내부 전원 / 매핑·기간·차단=사업 담당자 / 정지·해제=ADMIN / 비밀번호=본인만** 셋으로 갈립니다. WORKS(OFFICE·ADMIN·사업 3종) + GUEST 앱 공통 적용.

---

## 📂 3. UI/UX 디자인 및 내비게이션 (`docs_design`)
기획된 비즈니스 요구사항을 시각적 디자인과 시스템으로 구체화하기 위한 디자인 토큰 및 UI 가이드라인입니다.

* **[readme_design.md](../docs_design/readme_design.md) (디자인 가이드라인 인덱스)**
  * **의미**: 디자인 가이드라인 폴더의 전체 문서 목록과 개정 상태를 관리하는 인덱스입니다.
* **[1_ui_ux_mobile.md](../docs_design/1_ui_ux_mobile.md) (모바일 UX 가이드라인)**
  * **의미**: 모바일 환경에서의 뷰포트 적응 규칙, 터치 인터랙션(스와이프, 길게 누르기 등) 가이드라인을 정의합니다.
* **[2_app_layout_navigation.md](../docs_design/2_app_layout_navigation.md) (공통 레이아웃 및 이동 규칙)**
  * **의미**: 공통 쉘(AppShell), 상단바(Topbar), 좌측 사이드바(Sidebar)의 UI 설계 및 화면 전환(1열/2열 가변 콘텐츠 그리드) 규칙, 그리고 역할 권한에 따라 사이드바와 상단바의 이동 메뉴를 필터링하는 내비게이션 흐름을 정의합니다.
* **[3_typography_rules.md](../docs_design/3_typography_rules.md) (타이포그래피 및 폰트 표준)**
  * **의미**: 폰트 패밀리(Inter/Pretendard), 화면 크기별 Line-Height, 타이틀/본문 계층 구조(H1~H6) 및 스타일링 규칙을 정의합니다.
* **[4_color_system_rules.md](../docs_design/4_color_system_rules.md) (브랜드 컬러 및 접근성 가이드)**
  * **의미**: 브랜드 포인트 컬러(CI Red), 대시보드 상태 배지용 HSL 컬러 스케일링 체계 및 명도 대비 웹 접근성 표준을 규정합니다.
* **[5_component_spec_rules.md](../docs_design/5_component_spec_rules.md) (공통 컴포넌트 표준 명세서)**
  * **의미**: 표준 디자인 시스템 구축을 위해 버튼(Button), 입력 폼(Input Form), 드롭다운(Select), 확인 대화상자(Confirm Dialog) 등의 규격을 표준화합니다.
* **[6_motion_transition_rules.md](../docs_design/6_motion_transition_rules.md) (모션 및 트랜지션 가이드)**
  * **의미**: 화면 로딩 스켈레톤 애니메이션 및 탭 전환, 드롭다운 토글 시 시각적 인지 향상을 위한 애니메이션 가이드입니다.
* **[7_chart_visualization_rules.md](../docs_design/7_chart_visualization_rules.md) (차트 및 데이터 시각화 표준)**
  * **의미**: 전문가 평점 분포 및 펀드 지분율 시각화를 위한 바 차트, 파이 차트, 히트맵 컬러 정의 및 범례(Legend) 가이드라인입니다.
* **[8_z_index_system_rules.md](../docs_design/8_z_index_system_rules.md) (Z-Index 레이어 설계서)**
  * **의미**: 모달, 팝오버, 툴팁, 플로팅 버튼 등 화면 계층 간에 꼬임이 없도록 전역 Z-Index 값을 레이어 모델로 표준화합니다.
* **[9_feedback_notification_rules.md](../docs_design/9_feedback_notification_rules.md) (피드백 및 알림 UI 설계서)**
  * **의미**: 성공, 경고, 오류 발생 시 사용자에게 노출할 알림 토스트(Toast), 인라인 배너, 다이얼로그 폼의 시각적 형태 및 시스템 피드백 규칙입니다.

---

## 📂 4. 물리 DB 설계 및 개발 명세 (`docs_dev`)
실제 코딩 및 시스템 구현을 앞두고 논리적 아키텍처와 규칙을 설정하는 테크니컬 개발 명세 레이어입니다.

* **[readme_dev.md](../docs_dev/readme_dev.md) (개발 가이드라인 인덱스)**
  * **의미**: 개발 기술서들의 변경 및 이관 히스토리를 추적하는 인덱스 파일입니다.
* **[1_development_stack.md](../docs_dev/1_development_stack.md) (공통 개발 스택 및 설계의견서)**
  * **의미**: 사용자가 확정한 기술(React, TS, AWS S3/CloudFront)을 기반으로, 모노레포 패키지 격리 및 ESLint 규칙, 임직원용 표준 JWT와 외부 참여자용 커스텀 JWT의 이원화 인증 모델 리스크 대응, 그리고 파일당 코드 라인수 제한(500줄 이하) 및 Supabase RLS 필수 적용 규칙 등을 담고 있는 기술 표준서입니다.
* **[2_auth_permissions_architecture.md](../docs_dev/2_auth_permissions_architecture.md) (인증 및 권한 아키텍처 설계서)**
  * **의미**: 사용자 역할군(11개)과 워크스페이스 권한 등급, 데이터 Scope의 결합을 통해 다각적인 보안 경계를 수립하고, 권한 변경 감사 로그 및 임시 권한 관리 규칙을 기술한 구현 기준 문서입니다.
* **[3_database_rls_policy_matrix.md](../docs_dev/3_database_rls_policy_matrix.md) (데이터베이스 RLS 정책 매트릭스)**
  * **의미**: PostgreSQL/Supabase Row Level Security(RLS) 기본 원칙과 주요 테이블별 데이터 접근 허용 매트릭스, RLS 검증용 테스트 시나리오를 규정한 최종 데이터 방어선 설계서입니다.
* **[4_security_privacy_policy.md](../docs_dev/4_security_privacy_policy.md) (보안 및 개인정보 보호 정책서)**
  * **의미**: 개인 식별 정보(PII)의 마스킹 기준, Secret Key 저장 통제, Supabase `service_role` 제한 및 S3 파일/대량 내보내기(Export) 다운로드 로그 감사 규정을 정의한 사내 보안 정책 표준입니다.
* **[5_backup_retention_privacy.md](../docs_dev/5_backup_retention_privacy.md) (백업, 보존 및 개인정보 파기 운영 기준서)**
  * **의미**: 서비스 연속성을 위한 가용성 백업/복구 표준(RPO/RTO)과 더불어 법적 의무를 반영한 데이터별 보존 기간, 개인정보 파기 및 익명화 프로세스를 정의한 데이터 수명 관리 기준서입니다.
* **[6_api_contracts.md](../docs_dev/6_api_contracts.md) (API 계약 및 서버 액션 보안 기준서)**
  * **의미**: 클라이언트와 백엔드 통신 시의 통일된 응답 규격 및 에러 코드 정의, 파일/내보내기 API 보안 검증 및 Zod 스키마 검증, IDOR 방지 등 API 레이어의 구현 표준 계약서입니다.
* **[7_database_design_guidelines.md](../docs_dev/7_database_design_guidelines.md) (데이터베이스 설계 및 테이블 통합 가이드라인)**
  * **의미**: 화면 중심 테이블 생성 금지, 1:1 관계 단일 테이블 통합, 다형적 관계의 공통 테이블 처리 등 테이블 단편화를 방지하는 설계 원칙과 JSONB 활용 기준, 멱등성 마이그레이션 수칙을 정의한 DB 설계 표준입니다.

> [!NOTE]
> 위의 개발 보안 및 운영 관련 기술 표준 문서들(2 ~ 6번)은 단순한 기술 구현 가이드가 아니며, 개인정보, 기밀정보 노출, 권한 오남용, 데이터 불법 유출 및 비즈니스 운영 장애 리스크를 줄이기 위해 통제 기준을 선언하는 중요한 정책 문서입니다.

---

## 📂 5. 기타 보조 자료 및 아카이브 (`docs_etc`)
기획 및 설계 과정에서 보조적으로 사용되는 회의록, 아카이브 성격의 문서들입니다.

* **[readme_etc.md](../docs_etc/readme_etc.md) (기타 문서 아카이브 인덱스)**
  * **의미**: 기획 회의 내용 요약, 참조용 자료 등의 임시 보조 파일 목록을 안내합니다.
* **[gemini_matching_ac_planning_rework_guide.md](../docs_etc/gemini_matching_ac_planning_rework_guide.md) (AC 기획 보강 작업 지시서 - 반영 완료)**
  * **의미**: AC 워크스페이스를 Program First 구조(3_4_1 ~ 3_4_14 신규 14문서 체계)로 재설계하도록 지시한 작업 지시서 원문입니다. 지시 내용은 기획 문서에 반영 완료되었으며 이력 보존 목적으로 아카이브합니다.
* **[gemini_security_docs_master_guide.md](../docs_etc/gemini_security_docs_master_guide.md) (보안/운영 문서 마스터 가이드 - 반영 완료)**
  * **의미**: `docs_dev`의 5대 보안·운영 상세 명세서(2 ~ 6번) 작성을 지시한 작업 지시서 원문입니다. 지시 내용은 개발 문서에 반영 완료되었으며 이력 보존 목적으로 아카이브합니다.
