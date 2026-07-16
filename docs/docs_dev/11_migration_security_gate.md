# [11] Supabase 마이그레이션 보안 게이트

본 문서는 Supabase/PostgreSQL 마이그레이션을 작성하거나 수정할 때 반드시 통과해야 하는 보안 검수 기준입니다. Claude, Codex, 사람이 직접 작성하는 모든 `supabase/migrations/*.sql` 변경은 본 문서를 기준으로 점검합니다.

> [!IMPORTANT]
> 새 테이블, 새 RPC, 새 Edge Function 경로, Storage 정책, 권한 변경 로직을 추가할 때는 기능 구현 완료가 아니라 **보안 게이트 통과까지 완료**로 봅니다.

---

## 1. 적용 대상

아래 변경은 모두 보안 게이트 대상입니다.

* `CREATE TABLE`, `ALTER TABLE`, `CREATE VIEW`, `CREATE POLICY`, `CREATE FUNCTION`, `CREATE TRIGGER`
* `storage.buckets`, `storage.objects` 관련 정책
* `SECURITY DEFINER` 함수와 `GRANT EXECUTE`
* `service_role`을 사용하는 Edge Function, 배치, 관리자 RPC
* 개인정보 원본 조회, 파일 다운로드, 대량 Export, 권한 변경, 게스트 초대/링크 발급

---

## 2. 마이그레이션 작성 전 질문

마이그레이션을 만들기 전에 아래 질문에 먼저 답합니다.

* **소유 워크스페이스**: 이 데이터는 `office`, `startup`, `networks`, `ac`, `fund`, `mna`, `project`, `management`, `admin`, `guest` 중 어디 소유인가?
* **데이터 등급**: `Public`, `Internal`, `Restricted`, `Personal`, `Secret` 중 어디에 해당하는가?
* **접근 주체**: 내부 사용자, 외부 스타트업, 외부 전문가, 임시 게스트 중 누가 접근하는가?
* **Scope 기준**: `global`, `department`, `program`, `project`, `fund`, `company`, `self`, `temporary` 중 어떤 범위가 필요한가?
* **감사 로그 대상**: 조회, 수정, 다운로드, Export, 권한 변경 중 감사 로그가 필요한 행위가 있는가?
* **운영 영향**: 기존 RLS, 권한 템플릿, 테스트 계정, 프론트 쿼리에 깨지는 부분이 있는가?

---

## 3. 필수 SQL 체크리스트

새 테이블 또는 보안 관련 변경은 아래 항목을 충족해야 합니다.

* [ ] 테이블 생성 즉시 `alter table ... enable row level security;`를 선언한다.
* [ ] `SELECT`, `INSERT`, `UPDATE` 정책을 분리한다.
* [ ] 일반 업무 테이블에는 `DELETE` 정책을 만들지 않고 `deleted_at` 기반 soft delete를 사용한다.
* [ ] 정책은 `auth.jwt()`를 직접 파싱하지 않고 `app.current_app_user_id()`, `app.current_app_role()`, `app.can_read_workspace()`, `app.can_write_workspace()`, `app.can_access_*()` 헬퍼를 경유한다.
* [ ] `WITH CHECK`가 필요한 `INSERT`/`UPDATE` 정책에 누락이 없다.
* [ ] 외부 게스트가 내부 마스터, FUND, M&A, HR, 감사 로그를 직접 조회할 수 없다.
* [ ] 개인정보 원본, 파일 다운로드, Export, 권한 변경은 `audit_logs` 또는 `access_logs` 적재 경로가 있다.
* [ ] `SECURITY DEFINER` 함수는 `set search_path = app, public` 또는 필요한 최소 스키마로 고정한다.
* [ ] `SECURITY DEFINER` 함수는 호출자 권한 확인을 함수 내부에서 먼저 수행한다.
* [ ] `GRANT EXECUTE` 대상은 `authenticated`, `supabase_auth_admin` 등 필요한 역할로만 제한한다.
* [ ] Storage 버킷은 기본 비공개이며 `storage.objects` RLS 정책 또는 서버 signed URL 흐름을 가진다.
* [ ] 시드/더미 데이터가 실제 개인정보, 운영 secret, 실제 토큰을 포함하지 않는다.

---

## 4. Claude 마이그레이션 프롬프트 규칙

Claude에게 Supabase 마이그레이션 작성을 맡길 때는 아래 문장을 작업 지시 앞부분에 붙입니다.

```txt
이번 Supabase 마이그레이션은 docs/docs_dev/11_migration_security_gate.md를 반드시 따른다.
새 테이블은 RLS를 즉시 활성화하고 SELECT/INSERT/UPDATE 정책을 분리한다.
DELETE 정책은 만들지 말고 soft delete를 사용한다.
권한 판정은 app.* RLS 헬퍼를 경유한다.
SECURITY DEFINER 함수는 search_path를 고정하고 함수 내부 권한 검사를 포함한다.
외부 게스트, 개인정보, 파일 다운로드, Export, 권한 변경 영향이 있으면 감사 로그 또는 access_logs 경로를 같이 설계한다.
마지막에 보안 게이트 체크리스트 통과 여부를 항목별로 보고한다.
```

---

## 5. 리뷰 기준

마이그레이션 PR 또는 커밋 리뷰에서는 기능 동작보다 먼저 아래를 확인합니다.

* **RLS 커버리지**: `public` 업무 테이블 중 RLS가 꺼진 테이블이 없는가?
* **권한 경계**: 내부/외부, read/write, workspace/scope 경계가 DB에서 강제되는가?
* **민감 액션 로그**: 다운로드, Export, 원본 개인정보 조회, 권한 변경, 병합/삭제가 추적되는가?
* **Service Role 최소화**: 일반 조회나 사용자 요청 처리에 `service_role` 의존이 없는가?
* **테스트 갱신**: 새 테이블이나 새 위험 경계가 생겼다면 `supabase/tests/rls_regression_test.sql` 또는 동등 테스트가 갱신되었는가?

---

## 6. 관련 정본 문서

* [2_auth_permissions_architecture.md](./2_auth_permissions_architecture.md): 사용자 역할, 워크스페이스 권한, 데이터 Scope
* [3_database_rls_policy_matrix.md](./3_database_rls_policy_matrix.md): RLS 정책 매트릭스와 테스트 계정
* [4_security_privacy_policy.md](./4_security_privacy_policy.md): 개인정보, Secret, Service Role, 파일/Export 보안
* [6_api_contracts.md](./6_api_contracts.md): 서버 액션, 에러 코드, 감사 로그 API 계약
* [7_database_design_guidelines.md](./7_database_design_guidelines.md): 테이블 통합, 다형 테이블, 마이그레이션 관리
* [9_database_physical_schema.md](./9_database_physical_schema.md): 현재 물리 스키마와 RLS 헬퍼 구조
