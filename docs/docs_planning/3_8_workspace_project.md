# [3-8] PROJECT (프로젝트) 워크스페이스 상세 기능 요건서

본 문서는 신사업팀, 글로벌 사업부 등 다양한 부서가 AC(액셀러레이팅) 및 M&A 외에 개별적으로 추진하는 각종 신규 비즈니스 개발, 파일럿 프로젝트, 해외 협력 파트너십 구축, 내부 협업 태스크를 관리하고 트래킹할 수 있도록 화면 요건과 비즈니스 흐름을 정의합니다. **본 워크스페이스는 플랫폼의 PMS(Project Management System)적 성격을 담당하는 실무 협업 및 진척도 추적 영역입니다.**

> [!IMPORTANT]
> PROJECT 워크스페이스는 **AC 워크스페이스와 동일한 사업(Program) 관리 구조를 공유**합니다. 화면 구현체는 `apps/works/src/features/program`(공용 모듈) 하나이며, PROJECT는 `features/project/ProjectWorkspace.tsx`의 `PROJECT_WORKSPACE` 설정만 주입합니다. AC 상세 기획서(`3_4_*` 문서군)의 화면 규칙이 그대로 적용되며, 본 문서는 **차이점만** 기술합니다.

---

## 1. 워크스페이스 구성

### 1.1 사이드바 3분할

* **대시보드**: 프로젝트 상태 요약 타일. 진행 중 프로젝트 수와 전체 프로젝트 수를 노출합니다.
* **내 프로젝트**: 로그인 사용자가 담당자 또는 등록자인 프로젝트만 필터링합니다.
* **전체 프로젝트**: 열람 권한 범위 내 전체 프로젝트를 조회합니다.
* **사업구분 세분화**: 이어서 `글로벌`, `신사업`, `기타` 항목이 나열되며, 각각 해당 사업구분의 프로젝트만 조회합니다.

화면은 `?tab=` 쿼리스트링으로 전환합니다. 카테고리 항목의 `tab` 값은 소문자 사업구분 값(예: `new_biz`)이며, `내 프로젝트`와 `전체 프로젝트`·세분화 항목은 동일 컴포넌트에 `scope`·`category` 값만 달리 전달합니다.

### 1.2 리스트뷰

AC 사업 목록과 동일한 컬럼 구성(프로젝트명 → 코드 → 사업구분 → 설명 → 상태 → 시작일 → 종료일 → 담당자)을 사용하며, 서버 페이지네이션·상태 필터·다중 선택·소프트 삭제 동작이 모두 동일합니다.

* **사업코드**: 등록 시 6자리 영숫자 난수가 DB 트리거로 자동 부여됩니다.

### 1.3 사업구분(카테고리)

PROJECT는 다음 3분류를 사용합니다. 구 `project_type` enum(`GLOBAL`/`NEW_BIZ`/`GENERAL`)은 폐지되었으며, 저장은 `project_programs.category`(text) + CHECK 제약입니다.

| 값 | 표시 | 설명 |
| :--- | :--- | :--- |
| `GLOBAL` | 글로벌 | 해외 협력·글로벌 사업 프로젝트 |
| `NEW_BIZ` | 신사업 | 신규 비즈니스 개발·파일럿 프로젝트 |
| `ETC` | 기타 | 위 분류에 속하지 않는 내부 협업 태스크 |

> [!NOTE]
> 분류를 늘릴 때는 `PROJECT_WORKSPACE.categories` 목록과 `project_programs.category`의 CHECK 제약을 **함께** 확장해야 합니다.

### 1.4 프로젝트 상세

AC 사업 상세와 **완전히 동일한 화면**입니다. 좌측 2/3에 기본 정보 카드와 운영 모듈 보드(목록/칸반/간트 3뷰), 우측 1/3에 일정 카드·관련 전자결재·자료·피드백·변경 이력을 배치합니다.

* **모듈 템플릿**: PROJECT는 기본 템플릿인 **커스텀 활동(`CUSTOM_ACTIVITY`)만** 운용합니다. AC 정형 운영 모듈은 노출하지 않으며, 모듈 추가 모달에서 '운영 템플릿' 섹션 자체가 렌더되지 않습니다.
* **담당자 배치**: 부서 계층(메인 1개 + 협업 부서, 협업비율 합 100)과 기간 세그먼트별 투입률 규칙이 AC와 동일하게 적용되며, 쓰기는 `set_project_program_staffing` RPC를 통해서만 가능합니다.

---

## 2. 데이터 구조

원장은 AC와 물리적으로 분리된 `project_*` 테이블 세트를 사용합니다. 스키마 형태는 AC와 동일하며 enum도 AC가 쓰는 `public` enum을 그대로 재사용합니다.

| AC 원장 | PROJECT 원장 |
| :--- | :--- |
| `programs` | `project_programs` |
| `program_modules` | `project_program_modules` |
| `program_module_assignees` | `project_program_module_assignees` |
| `program_managers` | `project_program_managers` |
| `program_departments` | `project_program_departments` |
| `program_participants` | `project_program_participants` |
| `program_timeline_items` | `project_program_timeline_items` |
| `custom_activities` | `project_custom_activities` |

* **RPC**: `set_project_program_staffing`, `set_project_program_module` (둘 다 `SECURITY DEFINER`, `search_path` 고정, `authenticated` 한정 GRANT).
* **RLS**: 판정은 `app.can_read_workspace('project')`/`app.can_write_workspace('project')`와 `app.can_access_ws_program('project', ...)` 헬퍼를 경유하며, `DELETE` 정책 없이 `deleted_at` 소프트 삭제만 사용합니다.
* 근거 마이그레이션: `supabase/migrations/20260720150000_project_program_schema.sql`

---

## 3. 외부 워크스페이스 상호 참조 관계

* **NETWORKS 참조**: 신사업 진행 및 해외 협력 파트너사(해외 액셀러레이터, 외국 정부 기관, 현지 전문가 등) 협업 시, 해당 정보는 `NETWORKS` 디렉토리 마스터에서 검색 및 연동하여 프로젝트 협력사 패널에 매핑합니다.
* **OFFICE 공유 일정 연계**: 글로벌 런칭 일정, 주요 해외 IR 행사일, 파트너십 협약 체결일 등의 중요 마일스톤 일정은 `OFFICE` 전사 일정 레이어에 자동 연계 노출되어 전사 공유를 공고히 합니다.
* **MANAGEMENT 조직도 연동**: 담당자 배치는 `org_versions` 기준 부서·임직원 원장을 참조합니다.

---

## 4. 후속 확장 과제

아래 항목은 구 PROJECT 화면(태스크 칸반·간트 로드맵)의 요건으로, 사업 원장 구조 전환에 따라 **모듈 템플릿 형태로 재도입**하는 것을 전제로 보류합니다.

* **협업 태스크 보드**: `할 일 ➔ 진행 중 ➔ 검토 대기 ➔ 완료` 4열 칸반. 태스크 담당자(MANAGEMENT 조직도 연동), 마감 기한 표준시(UTC) 병기 및 마감 경고, 세부 체크리스트, 산출물 링크 아카이브. 전용 모듈 템플릿(`TASK_BOARD`)으로 설계합니다.
* **간트 마일스톤 로드맵**: 마일스톤 선후 의존 관계 표현, 일정 막대 드래그 리사이즈, 변경 시 전사 일정 테이블 자동 반영.
* **참여 인원 아바타 리스트**: 목록·대시보드에서 참여자 프로필을 요약 노출.
* **첨부 자료**: 사업 타당성 검토서, 다국어 제안서 등 개설 단계 첨부 업로드.
