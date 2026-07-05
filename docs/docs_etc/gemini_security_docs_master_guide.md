# Gemini Security/Operations Documentation Master Guide

본 문서는 Gemini에게 전달할 **보안/권한/개인정보/운영 리스크 문서 작성 지시서**이다.

목적은 Gemini가 이 문서를 읽고 세부 과업별로 쪼개어 `docs_dev`, `docs_planning`, `docs_master` 문서를 작성/보강하도록 하는 것이다. Codex의 역할은 실제 작성자가 아니라 문서 총괄/감수자이며, 이 문서는 그 감수 기준을 정리한 마스터 가이드이다.

---

## 1. 전체 작성 목표

와이앤아처 통합 Works 플랫폼 문서 체계에 아래 영역을 추가/보강한다.

```txt
인증
권한
데이터 접근 범위
Supabase/PostgreSQL RLS
감사 로그
개인정보 보호
Secret 관리
Service role 사용 제한
파일/첨부 보안
다운로드/export 보안
백업
복구
데이터 보존
개인정보 파기/마스킹/익명화
API 계약
운영 리스크
```

이 작업의 핵심은 단순 기능 기획이 아니라, 실제 서비스 운영 시 개발 지식이 부족해도 놓치기 쉬운 리스크를 문서로 먼저 통제하는 것이다.

---

## 2. 현재 문서 구조

현재 문서 구조는 다음과 같다.

```txt
docs/
  docs_master/
    0_service_spec_draft.md
    readme_master.md
  docs_planning/
    1_roles_permissions.md
    2_business_scenarios.md
    3_x_workspace_*.md
  docs_dev/
    1_development_stack.md
    readme_dev.md
  docs_design/
  docs_etc/
```

문서 성격은 다음처럼 유지한다.

```txt
docs_master   = 전체 비전, 문서 인덱스, 서비스 종합 원천 문서
docs_planning = 비즈니스 시나리오, 역할, 워크스페이스 기능 요건
docs_dev      = 개발자가 따라야 할 기술/보안/DB/API/운영 기준
docs_design   = UI/UX, 디자인 시스템, 컴포넌트/레이아웃 규칙
docs_etc      = 보조 자료, 외부 레퍼런스, 임시 가이드, 작업 지시서
```

---

## 3. 작성 원칙

Gemini는 아래 원칙에 따라 문서를 작성한다.

- `docs_planning`은 비즈니스/기획 언어로 유지한다.
- `docs_dev`에는 실제 개발자가 따라야 할 보안/권한/DB/API/운영 기준을 둔다.
- 문서는 추상적인 좋은 말이 아니라 **개발자가 구현 기준으로 삼을 수 있는 수준**으로 작성한다.
- 각 문서에는 목적, 적용 범위, 핵심 원칙, 구현 기준, 체크리스트를 포함한다.
- 문서 간 참조 관계를 명확히 적는다.
- 아직 구현 전이라도 "반드시 이렇게 설계해야 한다"는 기준을 잡는다.
- 법적 판단이 필요한 부분은 "최종 법무/회계 검토 필요"라고 명시하되, 제품 운영 기준은 제안한다.
- UI에서 버튼이나 메뉴를 숨기는 것은 보안이 아니며, API와 RLS에서 반드시 차단해야 한다고 반복 명시한다.
- 개인정보 원본 조회, 파일 다운로드, export, 권한 변경은 감사 로그 대상으로 정의한다.
- `service role key`는 클라이언트에서 절대 사용 금지라고 명시한다.
- staging/preview 환경에 운영 개인정보를 그대로 넣지 않는다고 명시한다.

---

## 4. 신규 작성 문서 목록

아래 문서를 새로 작성한다.

```txt
docs/docs_dev/2_auth_permissions_architecture.md
docs/docs_dev/3_database_rls_policy_matrix.md
docs/docs_dev/4_security_privacy_policy.md
docs/docs_dev/5_backup_retention_privacy.md
docs/docs_dev/6_api_contracts.md
```

각 문서는 아래 상세 지시에 따라 작성한다.

---

## 5. 신규 문서 1: 인증 및 권한 아키텍처

작성 파일:

```txt
docs/docs_dev/2_auth_permissions_architecture.md
```

문서 제목:

```md
# [2] 인증 및 권한 아키텍처 설계서
```

### 5.1 문서 목적

이 문서는 Works 플랫폼의 로그인, 사용자 역할, 워크스페이스별 권한, 데이터 접근 범위를 정의한다.

단순히 관리자/일반 사용자로 나누지 않는다. 권한 판단 기준은 아래 조합으로 설계한다.

```txt
User Role + Workspace Permission + Data Scope
```

의미:

```txt
User Role             = 사용자의 기본 역할
Workspace Permission  = 워크스페이스별 read/write 권한
Data Scope            = 해당 워크스페이스 안에서 접근 가능한 데이터 범위
```

### 5.2 사용자 유형

아래 사용자군을 정의한다.

```txt
최고 관리자
경영진
경영지원/관리부서
AC 사업부
투자/FUND 담당자
M&A 담당자
프로젝트 담당자
외부 스타트업
외부 전문가/멘토/심사위원
임시 게스트
읽기 전용 사용자
```

각 사용자군에 대해 다음 항목을 적는다.

```txt
역할 설명
기본 접근 가능한 워크스페이스
기본 쓰기 가능 여부
기본 데이터 범위
주의해야 할 보안 리스크
```

### 5.3 워크스페이스 도메인 권한

워크스페이스 키를 정의한다.

```txt
hub
networks
ac
fund
mna
project
management
admin
guest
```

권한 단계는 다음으로 정의한다.

```txt
none  = 접근 불가
read  = 조회 가능
write = 생성/수정/승인 가능
```

반드시 포함할 주의 사항:

```txt
write 권한은 항상 read 권한을 포함한다.
read 권한이 없으면 메뉴도 숨긴다.
그러나 메뉴 숨김은 보안이 아니다.
최종 보안은 서버 권한 체크와 DB RLS에서 강제해야 한다.
```

### 5.4 데이터 Scope 모델

도메인 권한만으로는 부족하므로 데이터 범위를 정의한다.

Scope 예시:

```txt
none
global
department
program
project
fund
company
self
temporary
```

각 scope의 의미를 표로 작성한다.

예시:

```txt
global      = 전사 데이터 접근
department  = 본인 부서 또는 담당 조직 데이터만 접근
program     = 특정 AC 프로그램 데이터만 접근
project     = 특정 프로젝트 데이터만 접근
fund        = 특정 펀드 데이터만 접근
company     = 특정 스타트업/기업 데이터만 접근
self        = 본인에게 직접 연결된 데이터만 접근
temporary   = 만료 시간이 있는 임시 접근
```

### 5.5 권한 템플릿 매트릭스

사용자 유형별 기본 권한표를 작성한다.

예시 형식:

```md
| 사용자 유형 | HUB | NETWORKS | AC | FUND | M&A | PROJECT | MANAGEMENT | ADMIN | GUEST |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 최고 관리자 | RW | RW | RW | RW | RW | RW | RW | RW | - |
| 경영진 | R | R | R | R | R | R | R | - | - |
| AC 사업부 | R | RW | RW | - | - | R | R | - | - |
```

표기:

```txt
R  = read
RW = read/write
-  = none
```

### 5.6 임시 권한

반드시 포함할 내용:

```txt
임시 권한에는 expires_at이 있어야 한다.
만료된 권한은 UI, API, RLS 모두에서 차단되어야 한다.
임시 권한 부여/연장/회수는 감사 로그 대상이다.
외부 감사, 투자 검토, 실사, 단기 협업자에게 사용할 수 있다.
```

### 5.7 권한 변경 감사 로그

권한 변경 시 기록할 항목:

```txt
actor_user_id
target_user_id
changed_workspace
before_permission
after_permission
reason
created_at
request_ip
user_agent
```

### 5.8 구현 기준

개발자가 구현해야 할 구성:

```txt
공통 권한 helper
API 권한 guard
RLS helper
권한 템플릿 seed
권한 변경 audit log
관리자 권한 UI
본인 권한 조회 API
```

### 5.9 체크리스트

아래 질문을 포함한다.

```txt
이 화면은 어떤 워크스페이스 권한이 필요한가?
read/write 중 어느 권한이 필요한가?
데이터 scope 제한이 필요한가?
외부 사용자가 접근 가능한가?
임시 권한 만료 처리가 필요한가?
권한 변경 감사 로그가 필요한가?
UI 숨김 외에 API와 RLS에서 차단되는가?
```

---

## 6. 신규 문서 2: 데이터베이스 RLS 정책 매트릭스

작성 파일:

```txt
docs/docs_dev/3_database_rls_policy_matrix.md
```

문서 제목:

```md
# [3] 데이터베이스 RLS 정책 매트릭스
```

### 6.1 문서 목적

Supabase/PostgreSQL Row Level Security 기준을 정의한다.

이 문서는 "어떤 테이블을 누가 조회/생성/수정/삭제할 수 있는지"를 명확히 한다. RLS는 보안의 최종 방어선이다.

### 6.2 RLS 기본 원칙

반드시 포함할 원칙:

```txt
기본 차단
명시 허용
read/write 분리
외부 사용자는 self/company/program scope 제한
service role 사용 최소화
물리 삭제 금지, 기본은 soft delete
UI 권한 처리는 사용자 경험이며 최종 보안은 RLS가 담당
```

### 6.3 포함할 섹션

이 문서에는 아래 섹션을 포함한다.

```txt
1. RLS 기본 원칙
2. 공통 RLS helper 함수 설계
3. 워크스페이스별 테이블 접근 정책
4. 외부 게스트 접근 정책
5. 첨부파일/다운로드 정책
6. 감사 로그 정책
7. staging/import 테이블 정책
8. RLS 테스트 계정 기준
9. 필수 테스트 케이스
10. 체크리스트
```

### 6.4 공통 RLS helper 예시

아래 개념을 문서화한다.

```txt
can_read_workspace(workspace_key)
can_write_workspace(workspace_key)
get_scope_type(workspace_key)
get_scope_id(workspace_key)
is_admin()
is_master()
can_access_program(program_id)
can_access_company(company_id)
can_access_fund(fund_id)
```

### 6.5 테이블별 정책표 작성

각 주요 도메인별로 표를 만든다.

예시:

```md
## HUB / NETWORKS 마스터 테이블

대상:

- startups
- experts
- partners
- companies
- people
- identifiers
- aliases
- history

| 사용자 | SELECT | INSERT | UPDATE | DELETE |
| :--- | :--- | :--- | :--- | :--- |
| 최고 관리자 | 전체 | 허용 | 허용 | soft delete |
| 내부 read 권한자 | 허용 | 불가 | 불가 | 불가 |
| 내부 write 권한자 | 허용 | 허용 | 허용 | soft delete |
| 외부 스타트업 | 직접 접근 불가 | 불가 | 불가 | 불가 |
| 외부 전문가 | 직접 접근 불가 | 불가 | 불가 | 불가 |
| 권한 없음 | 불가 | 불가 | 불가 | 불가 |
```

반드시 강조:

```txt
외부 사용자는 내부 마스터 테이블을 직접 SELECT하면 안 된다.
외부 앱은 별도 view/RPC/API를 통해 필요한 필드만 제공해야 한다.
```

### 6.6 AC 테이블 정책

대상 예시:

```txt
programs
applications
participants
evaluations
mentoring_sessions
milestones
custom_events
feedbacks
```

정책에 포함할 것:

```txt
AC 담당자는 담당 프로그램 기준 접근
스타트업은 자기 신청/참여 정보만 접근
전문가는 배정된 평가/멘토링 정보만 접근
평가 점수와 내부 의견은 Restricted 데이터로 분류
외부 사용자에게 내부 평가 메모 노출 금지
```

### 6.7 FUND 정책

반드시 포함:

```txt
펀드 출자자, 지분율, 투자금액, 캐피탈콜 정보는 Restricted
투자실 또는 승인된 경영진만 접근
다른 부서는 기본 비공개
export/download는 별도 권한 필요
수정/삭제는 감사 로그 필수
```

### 6.8 M&A 정책

반드시 포함:

```txt
M&A 딜 정보는 최고 기밀로 취급
NDA, MOU, 실사자료 등 첨부파일은 별도 보안 등급
M&A 담당자와 최고 관리자 외 기본 접근 불가
열람/다운로드 감사 로그 필수
외부 공유는 임시 링크/만료 권한 기반으로만 허용
```

### 6.9 MANAGEMENT/HR 정책

반드시 포함:

```txt
HR 기록, 인사 평가, 급여/계약 관련 정보는 Restricted + Personal
본인 정보 조회와 관리자 조회를 구분
경영지원 담당자라도 scope 제한 필요
HR 데이터 export는 강하게 제한
퇴사자 계정은 즉시 비활성화
```

### 6.10 Audit Log 정책

반드시 포함:

```txt
audit log는 일반 사용자가 수정/삭제할 수 없다.
생성은 서버/API/service role 경로로만 한다.
조회는 관리자 또는 보안 담당자만 가능하다.
audit log에 개인정보 원문을 과도하게 남기지 않는다.
```

### 6.11 필수 테스트 계정

아래 테스트 계정 유형을 정의한다.

```txt
master_user
no_permission_user
read_only_user
workspace_write_user
expired_permission_user
guest_startup_user
guest_expert_user
fund_user
mna_user
hr_user
```

### 6.12 필수 테스트 케이스

아래 테스트 케이스를 포함한다.

```txt
권한 없는 사용자는 모든 업무 테이블 접근 실패
read 권한자는 write 실패
expired permission은 접근 실패
외부 스타트업은 자기 회사 데이터만 접근
외부 전문가는 배정된 평가/멘토링만 접근
FUND/M&A 데이터는 타 부서 접근 실패
민감 파일 다운로드 시 audit log 생성
RLS 없는 테이블이 없는지 검사
```

---

## 7. 신규 문서 3: 보안 및 개인정보 보호 정책

작성 파일:

```txt
docs/docs_dev/4_security_privacy_policy.md
```

문서 제목:

```md
# [4] 보안 및 개인정보 보호 정책서
```

### 7.1 문서 목적

개인정보, 민감정보, secret, service role, 파일, 로그, 외부 사용자 보안 기준을 정의한다.

### 7.2 핵심 원칙

반드시 포함할 핵심 원칙:

```txt
최소 권한
기본 비공개
필요 최소 개인정보 수집
민감정보 마스킹
다운로드/export 제한
감사 로그 기록
운영/개발 데이터 분리
secret 코드 저장 금지
```

### 7.3 데이터 분류표

아래 등급을 정의한다.

```md
| 등급 | 예시 | 처리 기준 |
| :--- | :--- | :--- |
| Public | 공개 회사명, 공개 웹사이트 | 제한 낮음 |
| Internal | 내부 업무 메모, 프로그램 운영 데이터 | 로그인 사용자만 |
| Restricted | 평가 점수, 투자 내역, M&A 딜, HR 기록 | 권한자만 |
| Personal | 이름, 이메일, 전화번호, 주소, 담당자 정보 | 개인정보 기준 적용 |
| Secret | service role key, API secret | 서버 전용 |
```

### 7.4 개인정보 보호

반드시 포함:

```txt
이름, 이메일, 전화번호, 주소, 직책, 소속, 대표자명은 개인정보다.
평가 의견이나 상담 메모에도 개인 식별 정보가 포함될 수 있다.
목록 화면에서는 마스킹을 기본으로 한다.
상세 원본 조회는 권한자만 가능하게 한다.
원본 개인정보 조회/다운로드는 audit log 대상이다.
```

마스킹 예시:

```txt
전화번호: 010-****-5678
이메일: h***@example.com
이름: 홍*동
주소: 시/군/구 단위까지만 노출
```

### 7.5 Secret 관리

금지 사항:

```txt
Git에 secret 커밋
NEXT_PUBLIC_ 변수로 secret 노출
브라우저 번들에 service role 포함
로그에 secret 출력
문서에 실제 key 작성
```

Secret 예시:

```txt
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY
APP_ENCRYPTION_KEY
INTERNAL_API_SECRET
IMPORT_JOB_SECRET
```

### 7.6 Service Role 보안

반드시 포함:

```txt
service role은 RLS를 우회하므로 극히 제한적으로 사용한다.
클라이언트 코드에서 절대 사용 금지.
일반 조회 API에서 사용 금지.
```

허용 범위:

```txt
migration
batch job
관리자 승인 작업
데이터 이관
감사 로그 기록
```

추가 원칙:

```txt
service role 사용 작업은 batch log 또는 audit log를 남긴다.
```

### 7.7 파일/첨부 보안

포함할 내용:

```txt
파일은 DB에 직접 저장하지 않고 Storage/S3에 저장한다.
DB에는 파일 메타데이터만 저장한다.
파일 등급은 public/internal/restricted/confidential로 나눈다.
다운로드는 권한 체크 후 signed URL 또는 presigned URL 방식으로 제공한다.
민감 파일 다운로드는 audit log 대상이다.
URL은 만료 시간을 가져야 한다.
외부 공유 링크는 만료/회수 가능해야 한다.
```

### 7.8 Export/다운로드 보안

포함할 내용:

```txt
export는 데이터 유출 위험이 크므로 별도 권한으로 관리한다.
대량 export는 반드시 audit log를 남긴다.
개인정보 필드는 기본 마스킹한다.
FUND/M&A/HR export는 최고 위험 작업으로 분류한다.
export 파일 보존 기간을 정한다.
```

### 7.9 로그 보안

로그에 남기면 안 되는 것:

```txt
비밀번호
access token
refresh token
service key
주민번호 등 고유식별정보
전체 개인정보 payload
```

추가 원칙:

```txt
오류 추적에 필요한 최소 정보만 남긴다.
```

### 7.10 외부 사용자 보안

포함할 내용:

```txt
외부 스타트업은 자기 회사/신청 정보만 접근
외부 전문가는 배정된 평가/멘토링만 접근
외부 사용자는 내부 메모, 투자 정보, M&A 정보, HR 정보 접근 금지
임시 게스트 링크는 만료 시간, 접근 범위, 회수 기능이 필요
```

### 7.11 사고 대응

포함할 절차:

```txt
1. 의심 이벤트 식별
2. 관련 계정/권한 임시 차단
3. 로그와 audit trail 확보
4. 영향 범위 파악
5. secret 회전 필요 여부 판단
6. 사용자/관리자 공지 여부 판단
7. 재발 방지 조치 문서화
```

### 7.12 코드 리뷰 체크리스트

아래 질문을 포함한다.

```txt
권한 체크가 필요한 화면인가?
RLS가 필요한 테이블인가?
다운로드/export에 별도 권한 체크가 있는가?
로그에 개인정보나 secret이 남지 않는가?
외부 사용자가 내부 데이터에 접근할 수 없는가?
문서 갱신이 필요한 보안 변경인가?
```

---

## 8. 신규 문서 4: 백업, 보존 및 개인정보 파기 운영 기준

작성 파일:

```txt
docs/docs_dev/5_backup_retention_privacy.md
```

문서 제목:

```md
# [5] 백업, 보존 및 개인정보 파기 운영 기준서
```

### 8.1 문서 목적

백업, 복구, 데이터 보존, 개인정보 파기/마스킹/익명화 기준을 정의한다.

### 8.2 핵심 원칙

반드시 포함:

```txt
업무 이력은 필요한 기간 보존
개인정보는 목적 달성 후 최소화 또는 파기
기본 삭제는 soft delete
법적 필요 시 별도 절차로 physical delete
백업은 복구 가능성을 정기 검증
staging에는 운영 개인정보 반입 금지
audit log는 임의 수정/삭제 금지
```

### 8.3 백업 기준

포함할 대상:

```txt
DB
Storage/S3 파일
파일 메타데이터
원본 import 파일
migration 파일
릴리즈 기록
중요 설정
```

포함하지 말아야 할 것:

```txt
service role key
access token
refresh token
secret 원문
```

### 8.4 복구 기준

아래 개념을 포함한다.

```txt
RPO = 데이터 손실 허용 시간
RTO = 서비스 복구 목표 시간
```

권장 예시:

```md
| 항목 | 초기 권장 기준 |
| :--- | :--- |
| RPO | 24시간 이내 |
| RTO | 주요 서비스 4시간 이내 |
```

복구 리허설:

```txt
분기 1회 staging에서 복구 테스트
row count 검증
로그인 검증
RLS smoke test
첨부파일 접근 검증
```

### 8.5 보존 기간 기준

법무/회계 최종 검토 필요라고 명시하되, 운영 기준을 제안한다.

예시:

```md
| 데이터 | 권장 보존 |
| :--- | :--- |
| 마스터 기본 정보 | 업무상 필요 기간 |
| 프로그램 신청/평가 | 사업 종료 후 내부 기준 기간 |
| 투자/FUND 자료 | 회계/법무 기준 기간 |
| M&A 자료 | 계약/법무 기준 기간 |
| HR 기록 | 인사/노무 기준 기간 |
| audit log | 최소 3년 이상 권장 |
| import raw data | 검증 후 archive 또는 마스킹 |
| 임시 게스트 데이터 | 목적 달성 후 삭제/만료 |
```

### 8.6 개인정보 파기/익명화

처리 방식을 정의한다.

```md
| 방식 | 의미 | 사용 예 |
| :--- | :--- | :--- |
| soft delete | 삭제 표시 | 일반 업무 삭제 |
| masking | 일부 비식별화 | 목록/리포트 |
| anonymization | 개인 식별 불가 | 통계 보존 |
| physical delete | 물리 삭제 | 법적/보안상 완전 삭제 필요 |
```

삭제 요청 처리 절차:

```txt
1. 요청자 신원 확인
2. 대상 데이터 식별
3. 법적/업무상 보존 필요 여부 검토
4. 삭제/마스킹/익명화 방식 결정
5. 처리 기록 생성
6. 처리 수행
7. 결과 기록
```

### 8.7 Audit Log 보존

Audit log 대상:

```txt
권한 변경
민감 정보 조회
파일 다운로드
export
service role 작업
운영 hotfix
마스터 병합
```

원칙:

```txt
audit log는 수정/삭제 금지
단, audit log에 과도한 개인정보를 처음부터 남기지 않는다.
```

---

## 9. 신규 문서 5: API 계약 및 서버 액션 보안 기준

작성 파일:

```txt
docs/docs_dev/6_api_contracts.md
```

문서 제목:

```md
# [6] API 계약 및 서버 액션 보안 기준서
```

### 9.1 문서 목적

API 응답 형식, 에러 코드, 권한 체크, audit log, 다운로드/export 기준을 통일한다.

### 9.2 공통 원칙

반드시 포함:

```txt
API는 UI 권한을 신뢰하지 않는다.
모든 민감 API는 서버에서 세션과 권한을 확인한다.
최종 보안은 RLS가 보장한다.
응답 형식과 에러 코드는 통일한다.
민감 액션은 audit log를 남긴다.
```

### 9.3 공통 응답 형식

성공:

```json
{
  "ok": true,
  "data": {}
}
```

실패:

```json
{
  "ok": false,
  "error": {
    "code": "permission_denied",
    "message": "이 작업을 수행할 권한이 없습니다."
  }
}
```

### 9.4 에러 코드

반드시 포함:

```md
| code | 의미 |
| :--- | :--- |
| unauthenticated | 로그인 필요 |
| permission_denied | 권한 없음 |
| validation_error | 입력값 오류 |
| not_found | 대상 없음 |
| conflict | 상태 충돌 |
| expired | 만료된 권한/링크 |
| rate_limited | 요청 제한 |
| internal_error | 서버 오류 |
```

### 9.5 API 권한 체크 기준

각 API 문서에는 아래를 명시하게 한다.

```txt
필요 워크스페이스 권한
필요 scope
외부 사용자 허용 여부
audit log 필요 여부
다운로드/export 여부
RLS 적용 테이블
```

### 9.6 Audit Log 대상 API

반드시 audit log가 필요한 작업:

```txt
권한 변경
사용자 초대/비활성화
민감 개인정보 원본 조회
파일 다운로드
대량 export
FUND/M&A/HR 데이터 수정
마스터 데이터 병합
삭제/복구
임시 게스트 링크 발급/회수
service role 기반 운영 작업
```

### 9.7 파일 다운로드 API 계약

포함할 내용:

```txt
직접 파일 URL 노출 금지
권한 체크 후 signed URL 발급
URL 만료 시간 필수
restricted/confidential 파일 다운로드는 audit log 필수
외부 사용자는 허용된 파일만 접근
```

### 9.8 Export API 계약

포함할 내용:

```txt
export 전용 권한 필요
필드 단위 마스킹 정책 필요
대량 export audit log 필수
export 사유 입력 검토
export 파일 보존 기간 설정
```

### 9.9 입력 검증

포함할 내용:

```txt
서버에서 Zod 또는 동등한 schema validation 사용
클라이언트 검증만 믿지 않음
IDOR 방지: URL 파라미터의 id만 믿지 않고 scope 확인
SQL injection 방지
파일 업로드 확장자/크기/MIME 검증
```

---

## 10. 기존 문서 보강 지시

신규 문서 작성 외에 기존 문서를 아래처럼 보강한다.

### 10.1 docs/docs_dev/readme_dev.md

새 문서 목록을 추가한다.

추가할 항목:

```txt
인증 및 권한 아키텍처
데이터베이스 RLS 정책 매트릭스
보안 및 개인정보 보호 정책
백업, 보존 및 개인정보 파기 운영 기준
API 계약 및 서버 액션 보안 기준
```

각 문서의 상태는 작성 전에는 "작성 필요", 작성 후에는 "작성 완료"로 표시한다.

### 10.2 docs/docs_master/0_service_spec_draft.md

마스터 인덱스에 `docs_dev` 보안/운영 문서 묶음을 추가한다.

의미 설명:

```txt
이 문서들은 개발 구현뿐 아니라 개인정보, 기밀정보, 권한 오남용, 데이터 유출, 운영 장애 리스크를 줄이기 위한 기준 문서다.
```

### 10.3 docs/docs_planning/1_roles_permissions.md

기획 관점의 권한 설명은 유지하되, 아래 문장을 추가한다.

```md
실제 구현 단계의 인증, 권한, 데이터 scope, RLS, 감사 로그 기준은 `../docs_dev/2_auth_permissions_architecture.md`와 `../docs_dev/3_database_rls_policy_matrix.md`를 따른다.
```

### 10.4 docs/docs_planning/2_business_scenarios.md

각 비즈니스 시나리오에 가능하면 아래 항목을 추가한다.

```txt
관련 사용자 권한
민감 데이터 여부
필요 감사 로그
외부 사용자 접근 여부
다운로드/export 가능 여부
```

---

## 11. Gemini 작업 분해 권장 순서

Gemini는 아래 순서로 작업을 나누어 진행한다.

```txt
1. 현재 문서 구조와 명칭 확인
2. docs_dev/readme_dev.md에 신규 문서 항목 추가
3. 2_auth_permissions_architecture.md 초안 작성
4. 3_database_rls_policy_matrix.md 초안 작성
5. 4_security_privacy_policy.md 초안 작성
6. 5_backup_retention_privacy.md 초안 작성
7. 6_api_contracts.md 초안 작성
8. docs_master/0_service_spec_draft.md 인덱스 보강
9. docs_planning/1_roles_permissions.md 참조 문장 추가
10. docs_planning/2_business_scenarios.md에 보안/권한 관점 항목 추가
11. 전체 문서 간 링크와 용어 통일
12. 누락된 체크리스트와 상태값 확인
```

---

## 12. 최종 산출물 검수 기준

Gemini의 최종 산출물은 아래 기준을 만족해야 한다.

```txt
문서마다 목적, 적용 범위, 원칙, 구현 기준, 체크리스트가 있는가?
보안 문서가 추상적이지 않고 실제 개발자가 구현할 수 있게 쓰였는가?
외부 사용자와 내부 사용자의 데이터 접근 경계가 명확한가?
UI에서 버튼을 숨기는 것은 보안이 아니며, API와 RLS에서 막아야 한다고 명시했는가?
개인정보 원본 조회, 파일 다운로드, export, 권한 변경이 감사 로그 대상으로 정의되었는가?
service role key는 클라이언트에서 절대 사용 금지라고 명시했는가?
staging/preview 환경에 운영 개인정보를 그대로 넣지 않는다고 명시했는가?
법적 보존 기간은 최종 법무/회계 검토 필요하다고 적되, 운영상 권장 기준은 제안했는가?
docs_dev/readme_dev.md와 docs_master/0_service_spec_draft.md에 신규 문서가 연결되었는가?
docs_planning/1_roles_permissions.md와 2_business_scenarios.md가 개발 보안 문서로 자연스럽게 이어지는가?
```

---

## 13. Codex 감수 의견

이번 작업의 핵심은 문서를 많이 만드는 것이 아니다.

핵심은 개발자가 실수할 수 있는 위험한 선택지를 문서로 먼저 막아두는 것이다. 특히 아래 항목은 반드시 빠지면 안 된다.

```txt
RLS 정책 매트릭스
개인정보 파기 기준
파일/download/export 보안
service role 제한
외부 사용자 데이터 경계
권한 변경 감사 로그
민감 데이터 마스킹
staging 개인정보 반입 금지
```

이 기준이 잡히면 이후 구현자는 기능을 만들 때마다 "이 화면은 어떤 권한이 필요한가?", "이 데이터는 누구에게 노출 가능한가?", "이 작업은 audit log 대상인가?"를 자연스럽게 확인할 수 있다.
