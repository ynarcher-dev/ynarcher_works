# [3] 데이터베이스 RLS 정책 매트릭스

## 1. 문서 목적 및 개요

본 문서는 Supabase/PostgreSQL의 Row Level Security(RLS) 기준을 정의한다. RLS는 애플리케이션의 버그나 프런트엔드 권한 우회 시도가 발생하더라도 데이터베이스 레이어에서 최종적으로 비인가 접근을 차단하는 플랫폼 보안의 최종 방어선이다.

---

## 2. RLS 기본 원칙

1. **기본 차단 (Default Deny)**: 모든 테이블은 생성 즉시 RLS를 활성화(`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`)하며, 명시적인 허용 정책(Policy)이 없는 한 어떠한 접근도 불가하다.
2. **명시 허용 (Explicit Allow)**: 각각의 테이블에는 작업(SELECT, INSERT, UPDATE, DELETE)별로 허가된 주체만 접근을 허용하는 정책을 정교하게 선언한다.
3. **읽기/쓰기 분리**: 하나의 정책으로 묶지 않고, SELECT 정책과 INSERT/UPDATE/DELETE 정책을 명확하게 분리하여 제어한다.
4. **외부 사용자 Scope 제한**: 외부 스타트업, 외부 전문가는 절대 타사 정보나 미배정 업무 레코드를 조회할 수 없도록 본인과 연동된 `company`, `program`, `self` scope 내의 데이터로 제한한다.
5. **물리 삭제 금지**: 비즈니스 데이터의 임의 삭제를 방지하기 위해 `DELETE` 정책은 원천 차단하거나 소프트 딜리트(`is_deleted = true` 또는 `deleted_at IS NOT NULL`) 필드 수정을 유도하는 `UPDATE` 권한으로 대체한다.
6. **Service Role 사용 최소화**: `service_role` key는 RLS를 완전히 우회하므로, 배치 작업이나 시스템 이관 등 극히 한정적인 어드민 서버 액션 경로 외에는 사용하지 않는다.
7. **UI 권한 신뢰 금지**: UI에서 특정 버튼이나 탭을 숨기는 행위는 오직 사용자 경험(UX) 최적화 목적일 뿐이며, 최종 보안은 데이터베이스 RLS가 담당한다.

---

## 3. 공통 RLS Helper 함수 설계

RLS 정책 선언 시 중복을 방지하고 비즈니스 규칙을 일관되게 처리하기 위해 PostgreSQL 내에 다음과 같은 보안 정의 함수(Security Definer Helpers)를 설계하여 활용한다.

> [!NOTE]
> **헬퍼 함수의 2계층 구조**: `1_development_stack.md`에서 정의한 **`current_app_user_id()` / `current_app_role()`**은 표준 JWT(임직원)와 커스텀 JWT(외부 게스트)의 클레임 차이 및 `session_version` 대조를 흡수하는 **기저(Base) 헬퍼**이다. 본 문서의 업무 헬퍼(`is_admin()`, `can_read_workspace()` 등)는 `auth.jwt()`를 직접 파싱하지 않고 반드시 이 기저 헬퍼를 경유하여 사용자 식별과 역할을 판정한다.

* **`is_admin()`**:
  * 역할: 현재 요청한 사용자가 `최고 관리자`인지 검증.
  * SQL 예시: `current_app_role() = 'super_admin'`
* **`can_read_workspace(workspace_key text)`**:
  * 역할: 현재 로그인한 사용자의 토큰 정보 또는 권한 테이블을 조회하여 해당 워크스페이스에 대한 읽기 권한(`read` 또는 `write`)이 있는지 검증.
* **`can_write_workspace(workspace_key text)`**:
  * 역할: 대상 워크스페이스에 대해 쓰기 권한(`write`)이 활성화되어 있는지 검증.
* **`get_scope_type(workspace_key text)`**:
  * 역할: 사용자의 해당 워크스페이스 내 데이터 접근 범위 유형(`global`, `department`, `program`, `fund`, `company`, `self` 등)을 반환.
* **`get_scope_id(workspace_key text)`**:
  * 역할: 범위 필터링 시 기준이 되는 부서 ID, 프로그램 ID, 기업 ID 등을 반환.
* **`can_access_program(program_id uuid)`**:
  * 역할: 현재 사용자가 외부 스타트업/전문가일 경우 본인이 배정된 프로그램인지 검사하고, 내부 직원일 경우 담당 범위 내에 해당 프로그램이 있는지 확인.
* **`can_access_company(company_id uuid)`**:
  * 역할: 로그인한 외부 스타트업 계정이 본인 기업(`company_id`)에 한해서만 접근하는지 확인.
* **`can_access_fund(fund_id uuid)`**:
  * 역할: 사용자가 해당 투자 조합(펀드)의 관리역이거나 경영진 등 읽기 권한을 가졌는지 검사.

---

## 4. 테이블별 RLS 정책 매트릭스

### 4.1 STARTUP / NETWORKS 마스터 테이블
* 대상 테이블: `startups`, `startup_managers`, `experts`, `partners`, `companies`, `people`, `identifiers`, `aliases`, `history`, `global_networks`

> [!NOTE]
> `OFFICE`는 전사 조회·업무 허브이며 마스터 테이블을 직접 소유하지 않습니다. 스타트업 물리 원장은 `startups`이고 STARTUP 워크스페이스가 구분별 운영 뷰를 담당하며, 외부 전문가·투자사·기관·기업·대학·외주/거래처·글로벌 네트워크 원장은 NETWORKS가 담당합니다.

> [!CAUTION]
> 외부 스타트업이나 전문가는 내부 마스터 테이블(전체 기업 목록, 전체 전문가 DB 등)을 직접 `SELECT`해서는 절대 안 된다. 외부 앱은 허용된 View나 별도 RPC를 통해서만 자신의 프로필 및 필수 데이터에 한정 접근한다.

| 사용자 유형 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **최고 관리자** | 전체 허용 | 허용 | 허용 | soft delete 유도 |
| **내부 write 권한자** | 전체 허용 | 허용 | 허용 | soft delete 유도 |
| **내부 read 권한자** | 전체 허용 | 불가 | 불가 | 불가 |
| **외부 스타트업** | 직접 접근 불가 | 불가 | 불가 | 불가 |
| **외부 전문가** | 직접 접근 불가 | 불가 | 불가 | 불가 |
| **기타 (권한 없음)** | 불가 | 불가 | 불가 | 불가 |

---

### 4.2 AC (액셀러레이팅) 테이블
* 대상 테이블: `programs`, `applications`, `participants`, `evaluations`, `mentoring_sessions`, `milestones`, `custom_events`, `feedbacks`

| 사용자 유형 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **최고 관리자 / 임직원 (AC RW)** | 전체 허용 | 전체 허용 | 전체 허용 | soft delete 유도 |
| **임직원 (AC R)** | 전체 허용 | 불가 | 불가 | 불가 |
| **외부 스타트업** | 본인 참여 `program`, 신청서(`application`), 본인 배정된 `mentoring` 세션, 본인 작성 `feedback`만 허용 | `application` 접수 시, `feedback` 제출 시만 본인 소유 건 허용 | 본인 소유 신청서/피드백만 허용 | 불가 |
| **외부 전문가** | 본인이 배정된 평가(`evaluation`), 멘토링 세션, 작성 피드백만 허용 | 배정된 `evaluation`, `feedback` 작성 시 본인 소유 건 허용 | 본인 작성 건만 허용 | 불가 |

* **보안 제한**: 심사위원의 상세 채점 데이터(`evaluations`)와 내부 평가지 의견 등은 Restricted 등급으로 분류하여 외부 스타트업 등에게 노출되는 것을 RLS 단에서 원천 차단한다.

---

### 4.3 FUND (투자 조합) 테이블
* 대상 테이블: `funds`, `lps` (출자자 명부), `capital_calls`, `investments`, `portfolio_financials`

> [!IMPORTANT]
> 조합 출자 지분율, 출자자 주소/연락처, 캐피탈 콜 요청 금액 등은 극히 민감한 내부 금융 정보이므로 투자실 담당 실무자 및 최고 관리자, 승인된 경영진 외 타 부서 직원(AC 사업부, M&A팀 등)의 접근을 기본 비공개(`none`)로 차단한다.

| 사용자 유형 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **최고 관리자 / 투자실 (FUND RW)** | 전체 허용 | 허용 | 허용 | soft delete 유도 |
| **경영진 / 투자실 (FUND R)** | 전체 허용 | 불가 | 불가 | 불가 |
| **타 부서 직원 (AC, M&A 등)** | 불가 | 불가 | 불가 | 불가 |
| **외부 게스트 / 파트너** | 불가 | 불가 | 불가 | 불가 |

---

### 4.4 M&A 테이블
* 대상 테이블: `deals`, `negotiations`, `dd_files` (실사 자료), `ndas` (비밀유지계약)

* **보안 제한**: M&A 협상 정보는 전사 기밀이므로 M&A팀 및 최고 관리자 외 임직원은 조회가 불가하다. 실사자료 및 계약서는 파일 메타데이터 조회 시에도 엄격히 통제된다.

| 사용자 유형 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **최고 관리자 / M&A팀 (RW)** | 전체 허용 | 허용 | 허용 | soft delete 유도 |
| **경영진** | 전체 허용 | 불가 | 불가 | 불가 |
| **타 부서 직원** | 불가 | 불가 | 불가 | 불가 |
| **외부 게스트 (임시 권한)** | 승인된 특정 `deal` 및 한시적 NDA 파일만 허용 | 불가 | 불가 | 불가 |

---

### 4.5 MANAGEMENT / HR 테이블
* 대상 테이블: `hr_profiles`, `salaries` (급여 계약), `performance_reviews` (인사 평가), `approvals` (전자결재)

| 사용자 유형 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **최고 관리자 / 경영지원 (RW)** | 전체 허용 | 허용 | 허용 | soft delete 유도 |
| **경영진** | 전체 허용 (급여 상세 제외 가능) | 불가 | 불가 | 불가 |
| **일반 임직원** | 본인 `hr_profile`, 본인 `performance_review`만 조회 허용 | 본인 결재서류(`approval`) 상신 시 허용 | 본인 상신 결재서류 중 대기 상태만 허용 | 불가 |

* **특이 사항**: 퇴사 처리된 임직원은 RLS 검사 단계에서 계정 활성 플래그가 `false`로 인식되므로, 로그인 세션이 남아있더라도 모든 테이블 접근이 실패한다.

---

### 4.6 Audit Log (감사 로그) 테이블
* 대상 테이블: `audit_logs`, `access_logs`

* **보안 제한**: 감사 로그는 시스템 침해 사고 발생 시 증적으로 사용되므로, 어떠한 사용자도 기존 로그를 수정(`UPDATE`)하거나 삭제(`DELETE`)할 수 없다. 오직 시스템 및 어드민 내부 트리거를 통한 추가(`INSERT`)만 허용된다.

| 사용자 유형 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| **최고 관리자 / 보안 담당자** | 전체 허용 | 불가 (트리거로만 작동) | 불가 | 불가 |
| **일반 임직원 / 외부 사용자** | 불가 | 불가 | 불가 | 불가 |

---

## 5. RLS 테스트 검증 설계

### 5.1 RLS 테스트용 계정 정의 (10개)
RLS 정책이 정상 작동하는지 회귀 테스트(Regression Test)를 수행하기 위해 데이터베이스 시드 작업 시 아래의 테스트 전용 계정 세트를 격리하여 생성해둔다.
1. `test_master_user`: 최고 관리자 등급 계정.
2. `test_no_permission_user`: 임직원 그룹에 속해 있으나 부여받은 워크스페이스 권한이 모두 `none`인 계정.
3. `test_read_only_user`: 전 영역에 대해 `read` 권한만 설정된 모니터링 전용 계정.
4. `test_ac_write_user`: AC 워크스페이스에 대해서만 `write` 권한을 보유한 실무자 계정.
5. `test_expired_permission_user`: 임시 게스트 권한을 부여받았으나 만료 일자(`expires_at`)가 과거 시점인 계정.
6. `test_guest_startup_user`: 특정 스타트업(예: 'A컴퍼니')에 매핑된 사외 사용자 계정.
7. `test_guest_expert_user`: 특정 AC 프로그램의 심사위원으로 위촉된 외부 전문가 계정.
8. `test_fund_user`: 투자실 실무자용 계정 (FUND RW).
9. `test_mna_user`: M&A팀 전용 실무자 계정 (M&A RW).
10. `test_hr_user`: 경영지원/인사 담당 실무 계정 (MANAGEMENT RW).

### 5.2 필수 보안 테스트 케이스 (8가지)
개발 및 CI 단계에서 SQL 테스트 도구(예: pgTAP 등)를 활용하여 아래 케이스에 대해 검증한다.
* **케이스 1**: `test_no_permission_user`로 로그인 후 `startups`, `funds`, `deals` 테이블 SELECT 수행 시 0건이 반환되거나 실패하는가?
* **케이스 2**: `test_read_only_user`가 `programs` 테이블에 `INSERT` 쿼리를 날릴 시 권한 오류가 정상적으로 발생하는가?
* **케이스 3**: `test_expired_permission_user`가 본인에게 한때 허용되었던 `deals` 데이터에 접근할 때 차단되는가?
* **케이스 4**: `test_guest_startup_user`가 다른 회사('B컴퍼니')의 데이터에 대해 SELECT, UPDATE 쿼리를 수행할 때 원천 차단되는가?
* **케이스 5**: `test_guest_expert_user`가 자신이 배정되지 않은 멘토링 세션 일지나 타 심사위원의 상세 채점 결과를 SELECT할 때 차단되는가?
* **케이스 6**: `test_fund_user` 외에 `test_ac_write_user`가 `lps` (출자자 명부) 테이블 접근 시 에러를 뱉는가?
* **케이스 7**: 임의의 테스트 사용자가 `audit_logs` 테이블의 특정 행을 `DELETE` 하거나 `UPDATE` 하려고 할 때 차단되는가?
* **케이스 8**: 데이터베이스 전체 테이블 목록을 검사하여 RLS 옵션(`rowsecurity` 플래그)이 `false`로 누락된 테이블이 존재하지 않는가?

---

## 6. RLS 설계 체크리스트

> [!NOTE]
> AC 확장 모듈의 RLS는 `Program -> Program Module -> Session/Assignment -> Result` 계층을 기준으로 설계한다. 외부 GUEST는 Program에 속해 있더라도 전체 Program 데이터를 볼 수 없으며, 평가/상담/출석/자료 제출처럼 자신에게 배정된 레코드만 조회하거나 작성할 수 있어야 한다.

* [ ] 신규 테이블 생성 시 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` 구문이 DDL 스크립트에 반드시 포함되어 있는가?
* [ ] RLS 정책 작성 시 `ALL` 대신 `SELECT`, `INSERT`, `UPDATE`, `DELETE`로 각각 쪼개어 선언했는가?
* [ ] 외부 스타트업이나 외부 전문가가 로그인했을 때의 데이터 경계를 다루는 `WHERE` 절 조건(`can_access_company`, `can_access_program` 등)이 올바르게 설계되었는가?
* [ ] `DELETE` 액션은 원천 차단하고 `UPDATE`를 통해 소프트 딜리트를 수행하도록 강제하였는가?
* [ ] 테스트 계정 10종에 대한 시나리오 기반 보안 검증 스크립트가 데이터베이스 마이그레이션 변경 마다 함께 작성되고 실행되었는가?
* [ ] 어플리케이션 소스코드에서 `service_role`을 사용하여 데이터베이스에 연결하는 경우가 정의된 목적(배치, 마이그레이션) 외에 존재하지 않는가?
