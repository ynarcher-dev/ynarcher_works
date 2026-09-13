# [9] 데이터베이스 물리 스키마 정의서

> 기준일: 2026-09-12 · 기준 커밋 `846dfb83` · 마이그레이션 361건

> [!IMPORTANT]
> **이 문서는 `supabase/migrations/`의 순차 SQL을 읽어 정리한 정적 해석입니다.** 어떤 데이터베이스에도 접속해 확인하지 않았으므로, 여기 적힌 구조가 로컬·스테이징·운영에 실제로 존재한다는 증거가 아닙니다([supabase/README.md](../../supabase/README.md)).
>
> **정본은 마이그레이션 전체이며, 스키마는 파일들이 순서대로 쌓인 결과입니다.** 초기 `create table`만 읽으면 이후 통합·폐지·개명을 놓치고, 가장 최근의 `alter` 한 건만 읽으면 그 앞에서 정해진 나머지를 놓칩니다. 어떤 대상의 현재 값을 확인하려면 그 대상을 건드린 마이그레이션을 시간순으로 따라가야 합니다.
>
> 본 문서는 도메인 관계와 **어느 파일을 읽어야 하는지**를 안내하고, 컬럼 목록은 중복 기재하지 않습니다.

---

## 1. 스키마 구성

| 스키마 | 용도 |
| :--- | :--- |
| `public` | 임직원·외부 사용자 원장, 워크스페이스 업무 테이블, 공통 Enum. PostgREST 노출면 |
| `app` | RLS 판정 헬퍼와 트리거 로직. **PostgREST에 노출하지 않습니다** — 정책이 쓰는 함수가 API가 되면 판정 근거를 외부에서 호출할 수 있게 됩니다 |
| `auth` | Supabase Auth(임직원 JWT). 게스트는 이 경로를 쓰지 않고 Edge Function이 커스텀 JWT를 발급합니다 |

### 1.1 공통 열거형 — 현재 값

* **`workspace_key`** (10값): `office`, `startup`, `networks`, `project`, `fund`, `mna`, `project_retired`, `management`, `admin`, `guest`
  * `hub` → `office` 개명, `startup` 신설: `20260716130000_workspace_key_office_startup.sql`
  * 구 PROJECT → `project_retired`, 구 AC → `project` 개명: `20260909150000_rename_ac_workspace_to_project.sql`
  * 개명은 `rename value`로 합니다. 값의 OID가 유지되어 저장된 행이 따라오지만 **정책 표현식과 함수 본문의 텍스트 상수는 따라오지 않으므로** 같은 변경에서 함께 고쳐야 합니다.
  * `project_retired`는 프런트 `WorkspaceKey` 타입에 없습니다(`apps/works/src/auth/types.ts`). 화면이 그 키를 모른다는 사실은 **프런트 동작의 설명일 뿐 접근 통제가 아닙니다** — 이 키로 남아 있는 권한 행이 서버(정책·헬퍼·RPC·PostgREST 직접 호출)에서 무엇을 여는지는 별도로 확인해야 합니다.
* **`permission_level`**: `none`, `read`, `write`
* **`scope_type`**: `none`, `global`, `department`, `program`, `project`, `fund`, `company`, `self`, `temporary` (워크스페이스 키와 다른 축이라 개명 대상이 아닙니다)
* **`user_type`** (11종): `super_admin`, `executive`, `management_support`, `ac_business`, `fund_manager`, `mna_manager`, `project_manager`, `external_startup`, `external_expert`, `temporary_guest`, `read_only`
  * `ac_business`는 조직(AC사업부) 이름이라 워크스페이스 개명을 따라가지 않았습니다.
* **업무 Enum 증분**: `program_status`에 `PROPOSED`/`NOT_SELECTED`/`SELECTED`/`SUSPENDED`, `module_status`에 `CANCELLED`, `module_type`에 `POST`/`LINK`/`FILE`/`QUICK_REVIEW`, `module_visibility`에 `PUBLIC_LINK`, `fund_strategy_type`에 `PROJECT`/`BLIND`가 차례로 추가되었습니다.

---

## 2. 도메인 지형

### 2.1 신원·권한·조직

| 대상 | 테이블 | 관계 |
| :--- | :--- | :--- |
| 사람 | `users` | 임직원·외부 사용자 단일 원장. `auth_user_id`로 Supabase Auth와 연결 |
| 권한 | `workspace_permissions`, `permission_templates` | 사용자 × 워크스페이스 = 레벨 + scope. 템플릿은 11종 user_type의 초기값 |
| 조직 | `org_versions` → `org_levels`·`departments`·`dept_members` | 조직 구조가 버전에 매답니다. `departments.lineage_id`가 개편을 가로질러 같은 부서를 잇고, `hr_hidden`이 민감 조직을 인사 화면에서 가립니다 |
| 지사 | `branches`, `branch_members` | 조직(부서)과 다른 축 — 사람은 부서에, 자산·회의실은 지사에 속합니다 |

`app.current_org_version_id()`가 오늘 기준 활성 버전을 판정하므로, 조직을 참조하는 질의는 버전을 명시하지 않으면 그 답을 씁니다.

### 2.2 전사 공용 원장(SSOT) 둘

| 원장 | 정본 마이그레이션 | 핵심 |
| :--- | :--- | :--- |
| `startups` | `20260705120400` 이후 다수. 식별 규칙 `20260911221000_ledger_identity_rules.sql` | 기업 단위. 사업자등록번호가 확실한 키(살아있는 행 유일 인덱스 `uq_startups_biz_reg_no_live`). 담당은 `startup_managers`(투자기업만 지정제) |
| `networks` | `20260904120000_networks_unified_ledger.sql` | **원장 11종을 하나로 합친 결과**. 구 `experts`·`van`·`exp`·`investors`·`corporates`·`institutions`·`universities`·`etc`·`vendors`·`others`·`global_networks`는 더 이상 현재 원장이 아닙니다 |

`networks`는 구분(`category`)과 국가(`country_tag_id`)를 직교한 두 축으로 세웁니다. 국내/해외(`region_scope`)는 국가에서 파생되어 트리거가 채우고, 권역은 저장하지 않고 `country_tags`를 조인해 읽습니다. `category`의 허용값은 `20260912002332_add_startup_network_category.sql`이 현재 값이며, 추가된 `startup`은 **사람의 분류이지 `startups` 행과의 연결이 아닙니다.**

두 원장으로의 연결은 상당수가 **다형 키(문자열 + uuid)**입니다. 외부 테이블이 FK로 이 원장들을 가리키는지 여부는 이 문서로 단정하지 않습니다 — 원장 구조를 바꾸기 전에 해당 마이그레이션과 제약을 직접 확인합니다.

### 2.3 사업 원장과 모듈 — 사업 축은 갈리고 모듈 축은 합쳐져 있다

| 축 | 상태 | 테이블 |
| :--- | :--- | :--- |
| **사업 본체** | 워크스페이스별로 **갈림** | `programs`(사업부) / `ma_programs`(M&A팀) + 각각의 `*_managers`·`*_departments`·`*_timeline_items` |
| **모듈·명부** | 하나로 **합쳐짐** + `entity_key` | `program_modules`, `program_module_assignees`, `program_posts`, `program_links`, `program_participants`, `program_participant_entries` |
| **모듈 내용물** | 모듈에 FK로 매달림 | 평가·멘토링·매칭·공지·개요·Q&A 등 30여 종 |

* 근거: `20260903100000_program_module_ledger_unify.sql`. 내용물마다 워크스페이스 키를 다는 대신 **모듈 원장 하나가 소유 워크스페이스를 답하게** 했습니다.
* `program_id`가 두 원장 중 하나를 가리키므로 FK를 걸 수 없습니다. 대신 (1) BEFORE 트리거가 `entity_key`가 지목한 원장에 그 사업이 실재하는지 확인하고, (2) 사업 원장의 AFTER DELETE 트리거가 종전 cascade를 대신합니다. **둘은 한 벌입니다.**
* `entity_key` 허용값은 `program`·`ma_program` 둘뿐입니다. 구 PROJECT 계열(`project_programs`·`project_program_*`)은 `20260907170000_retire_project_workspace.sql`에서 표까지 제거되었습니다.
* 초기 스키마의 `projects`·`project_tasks`·`project_milestones`·`project_members`는 **위 계통과 무관한 별개 원장**입니다. 이름이 비슷하다는 이유로 사업 원장으로 오인하지 마십시오.
* 공개 링크는 `program_module_public_links`(entity_key + module_id 유일)가 소유합니다. 배치 가능 템플릿의 상한은 `module_templates.workspaces`가 정합니다(텍스트 배열이라 워크스페이스 개명 시 자동으로 따라오지 않습니다).

### 2.4 M&A 거래상대와 기밀 경계

* `ma_buyers`(인수후보) · `ma_sellers`(매물): `20260907120000`, `20260907160000`. 스타트업 원장과 연결된 행은 번호를 스타트업이 갖고, 미연결 행만 자기 번호를 갖습니다.
* `ma_program_party_links`가 딜과 거래상대를 잇습니다.
* 기밀 경계: `20260911224000_mna_confidential_project_and_party_viewers.sql` — M&A 프로젝트는 관리자 또는 그 프로젝트 PM·MEMBER만, BUYER·SELLER 본문은 작성자(`created_by`)와 명시 열람자(`viewer_ids`)만 읽도록 정책이 작성되어 있습니다.
* **식별 규칙의 비대칭**: 미연결 셀러·바이어가 스타트업 원장의 기업과 같으면 저장을 막고 연결을 요구하지만, 반대 방향(스타트업 등록 시 M&A 조회)은 묻지 않습니다 — 매각 검토 사실의 노출을 막기 위한 의도된 비대칭입니다.

### 2.5 게스트 계정 — 세 축

`20260905120000_guest_unified_account_schema.sql` 이후 구조입니다.

| 축 | 자리 |
| :--- | :--- |
| 계정 = 사람 | `users`(게스트 user_type) — 로그인 ID(이메일) 하나, 비밀번호 하나 |
| 자격 = 참여 줄 | `program_participants.master_table` — 한 사람이 기업 대표이면서 전문가로도 참여 가능 |
| 원장 행 ↔ 계정 | `guest_identities` — 1:1 고정과 원장 이메일 변경에 따른 계정 증식을 피하기 위한 연결표 |

**자격증명은 `users`가 아니라 `guest_credentials`에 있습니다.** `users`의 SELECT는 내부 사용자에게 넓게 열려 있어(참가자 명부가 게스트 이름을 붙이기 위해) 해시를 거기 둘 수 없습니다. 이 표는 정책을 갖지 않고 service_role Edge Function만 접근하는 설계이며, 잠금 카운터도 여기 있습니다.

접근 기간은 사업이 갖습니다(`programs`·`ma_programs`의 `guest_access_ends_at`). 게스트 세션의 맥락은 JWT의 `context_type`/`context_id`가 싣고 `app.guest_session_program_id()`가 읽습니다.

### 2.6 전자결재

| 대상 | 테이블 |
| :--- | :--- |
| 양식 | `approval_forms`, `approval_form_versions`, `approval_doc_counters` |
| 문서 | `approval_documents`, `approval_lines`, `approval_recipients`, `approval_reads`, `approval_document_events` |
| 연결 | `approval_document_links`, `approval_program_links` |
| 예산·지출 | `dept_budgets`, `approval_budget_revisions` |
| 하이웍스 이관 | `approval_legacy_*` 8종 |

상태 흐름은 초기 순차 승인선에 반려(`20260905200000`), 재기안(`20260910030236`·`030352`·`032256`), 회수(`20260910170314`·`171352`), 기안 취소·삭제(`20260911230000`)가 더해진 결과입니다. 양식 카탈로그와 HTML 템플릿 문서는 `20260911190000`~`20260911200000`이 현재 값입니다.

### 2.7 경영·근태·KPI

* 근태: `attendance_statuses`, `attendance_policies`, `attendance_days`, `attendance_edits`. 반차는 길이가 아니라 **시각 구간**으로 받습니다(`20260910130000`). 반반차만 길이(분)입니다.
* KPI: `kpi_versions` → `kpi_blueprints`·`kpi_blueprint_items` → `kpi_templates`·`kpi_template_items` → `kpi_assignments` → `kpi_results`·`kpi_actual_revisions`(`20260910135000` 이후). 초기 `kpi_records`는 이 계통으로 대체되었습니다.
* 자산: `assets`(지사 귀속). `asset_checkouts`는 `20260906190000`에서 은퇴했습니다.
* 거래처: `trade_partners`(`20260903210000`~). 코드 체계와 노출 범위는 후속 마이그레이션에 있습니다.

### 2.8 OFFICE 공통

`boards`·`board_posts`·`board_comments`(게시판·자료실·공지), `meeting_minutes`·`meeting_minute_people`·`meeting_minute_links`(회의록), `meeting_rooms`·`meeting_room_reservations`·`meeting_places`(회의실 — 지사는 `branches`가 소유), `system_events`(전사 일정), `notifications`, `quick_memos`.

`branches`는 회의실 탭 전용 목록이던 `meeting_branches`를 원장으로 승격시킨 것입니다(`20260728150000_branches.sql` — `rename to`). 옛 이름으로 표를 찾으면 없습니다.

### 2.9 다형 연결 — 표를 늘리지 않고 잇는 자리

| 표 | 잇는 것 |
| :--- | :--- |
| `attachments` | `target_type` + `target_id`로 모든 원장의 첨부. `attachment_refs`가 같은 파일의 재참조를, `attachment_extracts`가 추출 결과를 보관 |
| `entity_feedback` | 대댓글형 댓글 |
| `entity_contributions` | 등록·수정 기여와 변동 이력. **권한 판정에 쓰지 않습니다** |
| `entity_codes` | 원장 공통 코드 채번 |
| `meeting_minute_links` | 회의록 ↔ program·ma_program·startup·fund·network·ma_buyer·ma_seller |
| `audit_logs` / `access_logs` | 권한·중요 변경 이력(Append-Only) / 민감정보 조회·대량 다운로드 사유 증적 |

다형 키는 문자열이므로 **워크스페이스나 원장 이름을 바꿀 때 자동으로 따라오지 않습니다.** 반대로 감사·접근 로그의 과거 값은 그때의 사실이므로 고치지 않습니다.

---

## 3. 접근 제어 헬퍼 (`app`)

| 계층 | 함수 | 역할 |
| :--- | :--- | :--- |
| 기저 | `current_app_user_id()` | JWT에서 현재 `public.users.id` |
| 기저 | `current_app_role()` | 현재 `user_type` |
| 기저 | `current_org_version_id()` | 오늘 기준 활성 조직 버전 |
| 업무 | `is_admin()` | `super_admin` 여부 |
| 업무 | `can_read_workspace(ws)` / `can_write_workspace(ws)` | 워크스페이스 읽기/쓰기 |
| 업무 | `get_scope_type(ws)` / `get_scope_id(ws)` | 조회 범위와 그 대상 |
| 사업 | `program_ws()`, `program_row()`, `is_program_manager()`, `can_access_program()`, `entity_key_workspace()`, `ws_module_tables()` | 다형 사업 원장 판정 |
| 게스트 | `is_guest()`, `guest_program_ids()`, `guest_session_program_id()`, `log_guest_access()` | 게스트 세션 경계 |
| 마스킹 | `mask_email()`, `mask_phone()` | 관리자가 아닌 호출자에게 나가는 값 |

> [!WARNING]
> **권한 헬퍼는 `workspace_key`가 아니라 `text`를 받아 `p.workspace_key::text = ws_key`로 비교합니다.** 없는 키를 물으면 오류가 아니라 `false`가 돌아옵니다 — 키를 바꾸면서 함수나 정책을 빠뜨리면 해당 화면이 에러 없이 비고 원인이 드러나지 않습니다. 키 변경 시 `pg_proc.prosrc`와 `pg_policies` 전수 조사가 한 벌입니다.

---

## 4. RLS 원칙 — 의도된 정책과 그 한계

아래는 마이그레이션이 **의도하는 정책**입니다. 각 테이블에서 RLS가 실제로 켜져 있고 정책이 의도대로 존재하는지는 마이그레이션 전수 확인 또는 대상 DB 점검으로만 확정됩니다.

1. **기본 거부(범위 한정)**: 업무 테이블에 RLS를 켜고 화이트리스트 정책만 답니다. RLS가 켜진 테이블에서 해당 동작의 정책이 없으면 **일반 API 롤(`anon`·`authenticated`)의 접근이 거부됩니다.**
   이 거부는 **특권 경로에는 적용되지 않습니다** — `service_role`, `BYPASSRLS` 속성을 가진 롤, 그리고 `FORCE ROW LEVEL SECURITY`가 걸리지 않은 테이블의 소유자는 정책을 우회합니다. `SECURITY DEFINER` 함수도 생성자 권한으로 실행되므로 그 안의 질의에는 호출자의 정책이 걸리지 않습니다. 따라서 "RLS가 켜져 있다"는 사실만으로 접근이 닫혔다고 결론짓지 않습니다.
2. **RPC·권한 부여는 따로 검토합니다**: 노출되는 함수마다 ① 첫머리의 자체 인가 검사, ② `EXECUTE` 권한을 가진 롤, ③ `SECURITY DEFINER` 함수의 고정된 `search_path`를 확인합니다. 셋 중 빠진 항목이 있으면 추가 검토가 필요하며, 실제 우회 여부는 함수의 권한과 실행 경로에 따라 달라집니다. `SECURITY INVOKER` 함수처럼 검사를 RLS에 정당하게 위임하는 경우도 있습니다.
3. **소프트 삭제 기본 + 문서화된 예외**: 논리 삭제(`deleted_at`)가 기본이므로 대부분의 표에 `DELETE` 정책을 두지 않습니다. 다만 운영 모듈 인스턴스 정리, 원장 대량 정리처럼 **물리 삭제가 필요한 도메인 예외**가 있고, 그 경로는 정책이 아니라 자체 인가를 수행하는 `SECURITY DEFINER` RPC로 제공됩니다. 전역 금지로 읽지 마십시오.
4. **부서·역할 격리**: `hr_profiles`(인사), M&A 딜과 거래상대(§2.4)는 워크스페이스 읽기 권한만으로 열리지 않도록 정책이 작성되어 있습니다.
5. **버전별 조직도 격리**: 일반 직원은 `PUBLISHED` 버전만, `DRAFT`는 management write 보유자와 관리자만 보도록 의도되어 있습니다.
6. **표를 지우면 함수 본문까지 본다**: `drop table`은 뷰·제약·정책만 따라가고 함수 본문(문자열)은 추적하지 않습니다. 남겨 두면 호출 순간에만 42P01로 죽고 PostgREST가 404로 내보냅니다.
7. **DEFINER 함수는 자기 인가를 직접 확인한다**: 실패는 빈 결과가 아니라 사유와 함께 멈춥니다(없는 것과 못 보는 것이 같은 화면이 되지 않도록).

정책 매트릭스는 [3_database_rls_policy_matrix.md](./3_database_rls_policy_matrix.md), 변경 절차는 [11_migration_security_gate.md](./11_migration_security_gate.md)가 소유합니다.

---

## 5. 회귀 검증

`supabase/tests/`에 8종의 SQL 회귀가 있습니다(RLS 전반, KPI 스냅샷, 결재 회수, 게스트 신원, 비활성 원장 복원·대량 처리, 생성자 비활성화, 생년월일 프라이버시). **CI 워크플로에 이 단계가 없으므로** DB 변경 시 `pnpm db:reset` 후 직접 돌리고 결과를 남깁니다.

전체 이력 재구축 스냅샷(`supabase/baseline/`)은 아직 생성되지 않았습니다. 즉 이 문서가 설명하는 구조를 한 번에 재현·검증한 산출물은 현재 없습니다.
