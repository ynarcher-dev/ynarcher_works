# [3-6] M&A (M&A팀) 워크스페이스 상세 기능 요건서

본 문서는 M&A팀 담당자가 인수합병(M&A) 및 경영참여 딜을 기밀이 보장된 환경에서 관리할 수 있도록 화면 요건과 비즈니스 흐름을 정의합니다. M&A 워크스페이스는 **AC 워크스페이스와 동일한 사업(Program) 관리 구조를 공유**하며, 원장 테이블과 사업구분(카테고리)만 M&A 고유값을 사용합니다.

> [!IMPORTANT]
> 화면 구현체는 `apps/works/src/features/program`(공용 모듈) 하나이며, M&A는 `features/mna/MnaWorkspace.tsx`의 `MNA_WORKSPACE` 설정만 주입합니다. 따라서 AC 상세 기획서([3_4_2_ac_program_overview.md](./3_4_2_ac_program_overview.md) 등 `3_4_*` 문서군)의 화면 규칙이 M&A에도 그대로 적용되며, 본 문서는 **차이점만** 기술합니다.

---

## 1. 워크스페이스 구성

### 1.1 사이드바와 기본 진입

* **내 프로젝트**: 사이드바 첫 항목이자 탭 미지정 시 기본 화면입니다. 로그인 사용자가 담당자 또는 생성자인 딜만 조회합니다.
* **전체 프로젝트**: `?tab=all`. `내 프로젝트`와 같은 목록 화면을 담당 스코프 없이 넓혀 씁니다.

> [!NOTE]
> M&A의 관리 대상은 딜이지만 화면 표기는 다른 사업 워크스페이스와 맞추어 '프로젝트'로 부릅니다(`MNA_WORKSPACE.entityNoun`). 2026-08-20에 메뉴 라벨도 같은 이유로 통일했습니다 — 종전 `내 딜 관리`/`전체 딜`을 AC·PROJECT와 같은 `내 프로젝트`/`전체 프로젝트`로 바꾸었고, 라벨은 `config/navigation.ts`의 `PROGRAM_MINE_LABEL`·`PROGRAM_ALL_LABEL`이 단일 원천입니다.

화면은 라우트가 아니라 `?tab=` 쿼리스트링으로 전환하며, 두 항목은 동일 컴포넌트에 `scope` 값만 달리 전달합니다.

> [!NOTE]
> 2026-08-03에 사업구분별 세분화 항목(`Sell 프로젝트`·`Buy 프로젝트`·`PE 프로젝트`·`기타 프로젝트`)을 내렸습니다. 분류를 메뉴로 두면 그것이 '어디에 있는가'가 되어 상태·부서 같은 다른 축과 함께 걸 수 없고, 분류를 늘릴 때마다 사이드바가 길어집니다. 사업구분은 목록 필터의 축 하나가 되었고, 종전에 `기타 프로젝트`가 겸하던 미분류(`category is null`) 사각지대 방어는 구분 무관 전부를 보여주는 `전체 프로젝트`와 필터의 `미지정` 선택지가 대신합니다. 옛 링크(`?tab=sell`, 구 `?tab=dashboard`)로 들어오면 `전체 프로젝트`로 주소까지 바로잡습니다.

### 1.2 리스트뷰

AC 사업 목록과 동일한 컬럼 구성(딜명 → 코드 → 사업구분 → 담당 부서 → 설명 → 상태 → 시작일 → 종료일 → 담당자)을 사용하며, 사업명·생성자 검색, 서버 페이지네이션, 상태/시작일 필터, 다중 선택 동작이 동일합니다. 생성자는 목록에서 숨기고 상세 기본 정보에만 표시하며, 소프트 삭제는 상세에서 수행합니다.

* **사업코드**: 등록 시 6자리 영숫자 난수가 DB 트리거로 자동 부여됩니다. 혼동 문자(`0`, `O`, `1`, `I`)는 제외합니다.
* **상태 수명주기(운영 4단계)**: M&A는 AC와 달리 제안 단계를 운용하지 않습니다. 딜은 착수 결정이 곧 시작이므로 `DRAFT`(준비) -> `OPERATING`(진행중) -> `FINISHED`(종료), 중단 시 `CANCELLED`(취소) 네 단계만 사용합니다. 등록/편집 폼에는 단계 라디오와 제안 블록이 없고 상태·기간이 한 평면에 놓이며, 목록 상단 진행 현황 프로세스 뷰도 이 네 칸만 그립니다. 운용 여부는 `ProgramWorkspaceConfig.hasProposalStage`(false)가 단일 원천이고, `ma_programs`에는 제안 상태(`PROPOSED`/`SELECTED`/`NOT_SELECTED`) 저장을 막는 CHECK 제약이 걸려 있습니다(`20260803120000_program_stage_scope.sql`). 기존 제안 상태 행은 같은 마이그레이션이 시도·선정 -> `DRAFT`, 미선정 -> `CANCELLED`로 환산했습니다.

### 1.3 사업구분(카테고리)

M&A는 AC(공공/민간/매출/신규/기타)와 달리 다음 4분류를 사용합니다.

| 값 | 표시 | 설명 |
| :--- | :--- | :--- |
| `SELL` | Sell | 매도 측 자문·매각 주관 딜 |
| `BUY` | Buy | 매수 측 자문·인수 검토 딜 |
| `PE_FUND` | PE Fund | 경영참여형 사모펀드 관련 딜 |
| `ETC` | 기타 | 위 분류에 속하지 않는 딜 |

물리 저장은 `ma_programs.category`(text)이며 CHECK 제약으로 위 4값을 강제합니다.

### 1.4 딜 상세

AC 사업 상세와 **완전히 동일한 화면**입니다. 좌측 2/3에 기본 정보 카드와 운영 모듈 보드(목록/칸반/간트 3뷰), 우측 1/3에 일정 카드·관련 전자결재·자료·피드백·변경 이력을 배치합니다.

* **모듈 템플릿**: M&A는 **기본 템플릿 3종(글쓰기 `POST`·URL첨부 `LINK`·파일첨부 `FILE`)만** 운용합니다. 모집/서면평가/대면평가/OT/멘토링/비즈니스 매칭/데모데이/성과 등 AC 정형 운영 모듈은 노출하지 않으며, 모듈 추가 모달에서 '운영 템플릿' 섹션 자체가 렌더되지 않습니다.
* **담당자 배치**: 부서 계층(메인 1개 + 협업 부서, 협업비율 합 100)과 기간 세그먼트별 투입률 규칙이 AC와 동일하게 적용되며, 쓰기는 `set_ma_program_staffing` RPC를 통해서만 가능합니다.

---

## 2. 데이터 구조

원장은 AC와 물리적으로 분리된 `ma_*` 테이블 세트를 사용합니다. 스키마 형태는 AC와 동일하며 enum은 AC가 쓰는 `public` enum(`program_status`, `module_type`, `module_status`, `module_visibility`, `participation_mode`, `program_manager_role`, `program_department_kind`, `program_participant_role`, `activity_visibility`)을 그대로 재사용합니다.

| AC 원장 | M&A 원장 |
| :--- | :--- |
| `programs` | `ma_programs` |
| `program_modules` | `ma_program_modules` |
| `program_module_assignees` | `ma_program_module_assignees` |
| `program_managers` | `ma_program_managers` |
| `program_departments` | `ma_program_departments` |
| `program_participants` | `ma_program_participants` |
| `program_timeline_items` | `ma_program_timeline_items` |
| `custom_activities` | `ma_custom_activities` |

* **RPC**: `set_ma_program_staffing`, `set_ma_program_module` (둘 다 `SECURITY DEFINER`, `search_path` 고정, `authenticated` 한정 GRANT).
* **기본 템플릿 3종만 운용**하므로 모집·평가·멘토링·매칭·데모데이·성과 하위 테이블은 생성하지 않습니다.
* 근거 마이그레이션: `supabase/migrations/20260720140000_ma_program_schema.sql`

---

## 3. 정보 격리 및 보안 특화 정책

* **엄격한 부서 격리**: M&A 딜 정보는 회사의 기밀에 속하므로, `ADMIN` 권한 제어 콘솔을 통해 M&A팀 담당자와 최고 관리자(Admin)를 제외한 타 부서(AC, 투자실, 프로젝트팀 등) 사용자의 읽기 권한을 기본 비활성화(`Hidden`) 처리합니다.
* **RLS**: 모든 `ma_*` 테이블은 생성 즉시 RLS를 활성화하고 `SELECT`/`INSERT`/`UPDATE` 정책을 분리합니다. 판정은 `app.can_read_workspace('mna')`/`app.can_write_workspace('mna')`와 `app.can_access_ws_program('mna', ...)` 헬퍼를 경유합니다.
* **게스트 전면 차단**: 외부 게스트용 정책을 부여하지 않아 Default Deny로 차단됩니다.
* **물리 삭제 금지**: `deleted_at` 기반 소프트 삭제만 사용하며 `DELETE` 정책을 만들지 않습니다.
* **NETWORKS 연계**: 딜 대상 기업이나 인수 희망 기업의 기본 정보는 `NETWORKS` 디렉토리 마스터에서 검색하여 연결하며, 딜이 생성된 이후에도 NETWORKS에 등록된 정보와 동기화된 마스터 구조를 유지합니다.

---

## 4. 후속 확장 과제

아래 항목은 구 M&A 화면(딜 소싱 칸반·매칭 매트릭스)의 요건으로, 사업 원장 구조 전환에 따라 **모듈 템플릿 형태로 재도입**하는 것을 전제로 보류합니다.

* **딜 파이프라인 칸반**: `소싱 ➔ 예비 실사 ➔ 정밀 실사 ➔ 조건 협상 ➔ 계약 ➔ 완료/무산` 단계 전환과 타임라인 로그 자동 기록. 사업 상태(`program_status`)와 별개 축이므로 전용 모듈 템플릿(`DEAL_PIPELINE`)으로 설계합니다.
* **NDA·비밀문서 체크리스트**: 비밀유지약정(NDA), 예비 양해각서(MOU), 주주 동의서 등 필수 보안 문서의 업로드 상태 관리와 [검토 완료] 잠금.
* **정밀 실사 의견서 관리**: 실사 보고서 파일 관리 및 **목적 기반 첨부파일 다운로드 로그**(사유 입력 필수) 연동.
* **매수/매도 매칭 매트릭스**: 매수 조건(업종·금액 상한·키워드)과 매도 조건을 대조해 적합도 백분율을 산출하고 상위순 정렬 후 [신규 딜 생성]으로 인계하는 흐름. 산출 점수를 `ma_match_candidates`에 저장하도록 설계합니다.
