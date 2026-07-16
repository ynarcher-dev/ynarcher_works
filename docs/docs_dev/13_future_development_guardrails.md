# [13] 추가 개발 시 보안·리팩토링 고려 가이드

작성일: 2026-07-16  
목적: 앞으로 기능을 추가할 때 매번 확인해야 할 보안, 권한, 데이터, 테스트, 운영 기준을 정리한다. 이 문서는 개발 속도를 멈추기 위한 문서가 아니라, 나중에 큰 리팩토링으로 되돌아오지 않도록 기능 단위로 안전장치를 같이 쌓기 위한 기준이다.

---

## 1. 기본 방향

이 서비스는 다음 원칙으로 개발한다.

- 기능을 모두 만든 뒤 마지막에 보안을 붙이지 않는다.
- 새 기능이 데이터 경계를 만들면 RLS, 권한, 감사 로그를 같은 작업 범위에 포함한다.
- UI에서 버튼을 숨기는 것은 UX일 뿐 보안이 아니다.
- 민감 데이터, 파일, export, 권한 변경, 게스트 접근은 항상 서버 강제 경로가 필요하다.
- 리팩토링은 큰 덩어리로 미루지 말고 기능 개발 중 작게 수행한다.

---

## 2. 기능 추가 전 체크

새 기능을 시작하기 전에 아래 질문에 답한다.

1. 이 기능은 어느 workspace에 속하는가?
   - `office`, `startup`, `networks`, `ac`, `fund`, `mna`, `project`, `management`, `admin`, `guest`
2. 읽기 권한과 쓰기 권한이 분리되어 있는가?
3. 데이터 scope가 있는가?
   - `global`, `department`, `program`, `project`, `fund`, `company`, `self`, `temporary`
4. 외부 guest가 접근하는 경로가 있는가?
5. 개인정보, 투자정보, M&A 정보, HR 정보, 평가 점수, 파일, export를 다루는가?
6. 감사 로그가 필요한 행위인가?
7. 신규 DB 테이블, RPC, Edge Function, Storage 정책, SECURITY DEFINER가 필요한가?
8. 기존 RLS helper로 충분한가, 새 helper가 필요한가?

이 중 하나라도 보안 경계와 관련되면 [11_migration_security_gate.md](./11_migration_security_gate.md)를 먼저 적용한다.

---

## 3. DB와 RLS 기준

### 3.1 신규 테이블

신규 테이블을 만들면 같은 마이그레이션 안에서 다음을 처리한다.

- `alter table ... enable row level security`
- `SELECT`, `INSERT`, `UPDATE` 정책 분리
- `DELETE` 정책은 기본적으로 만들지 않음
- soft delete가 필요하면 `deleted_at` 또는 상태 컬럼 사용
- `WITH CHECK` 누락 여부 확인
- 필요한 인덱스 추가
- 데이터 등급과 workspace 소유권 주석 또는 문서화

### 3.2 정책 작성

RLS 정책은 직접 JWT를 파싱하지 말고 `app.*` helper를 우선 사용한다.

권장 패턴:

- 읽기: `app.can_read_workspace(...)`
- 쓰기: `app.can_write_workspace(...)`
- 관리자: `app.is_admin()`
- 프로그램 범위: `app.can_access_program(...)`
- 회사 범위: `app.can_access_company(...)`
- 펀드 범위: `app.can_access_fund(...)`

새로운 scope 판정이 필요하면 helper를 만들되, 다음을 지킨다.

- `security definer` 여부를 신중히 판단한다.
- `set search_path`를 고정한다.
- 함수 내부에서 호출자 권한을 먼저 확인한다.
- `grant execute` 대상을 최소화한다.

### 3.3 마이그레이션 작성 후 확인

마이그레이션이 아래를 포함하면 반드시 보안 게이트 검토 결과를 남긴다.

- `CREATE TABLE`
- `ALTER TABLE`
- `CREATE POLICY`
- `CREATE FUNCTION`
- `CREATE TRIGGER`
- `SECURITY DEFINER`
- `GRANT EXECUTE`
- `storage.objects` 정책
- 개인정보 원본 조회
- 파일 다운로드
- export
- 권한 변경
- guest 초대/링크 발급

---

## 4. Edge Function 기준

Edge Function은 다음 상황에서 사용한다.

- `service_role`이 필요한 작업
- Supabase Auth admin API 호출
- 서버에서만 알아야 하는 secret 사용
- 파일 Signed URL 발급
- 외부 API 호출
- 민감 로그 강제 기록
- OTP, magic link, guest token 발급

Edge Function 작성 기준:

- 모든 요청 method를 제한한다.
- 인증 토큰을 검증한다.
- 입력을 Zod 또는 동등한 방식으로 검증한다.
- `service_role` 사용 전 호출자 권한을 먼저 확인한다.
- 일반 조회를 위해 `service_role`을 사용하지 않는다.
- 오류 응답은 정보 노출을 최소화한다.
- 운영 CORS origin을 제한한다.
- 외부 URL fetch는 SSRF를 방어한다.
- 민감 값, OTP, JWT, service key를 로그에 남기지 않는다.

---

## 5. 파일·첨부·다운로드 기준

파일은 기본적으로 비공개로 본다.

파일 기능을 추가할 때 필요한 요소:

- 메타데이터 테이블
- 실제 storage path
- 업로드 권한
- 조회 권한
- 다운로드 권한
- 보안 등급
- 다운로드 로그
- 사유 입력 필요 여부
- Signed URL TTL

주의:

- 클라이언트에서 직접 장기 URL을 만들지 않는다.
- restricted/confidential 파일은 서버 경유로 Signed URL을 발급한다.
- 다운로드 로그 기록 실패 시 다운로드를 허용하지 않는다.
- export와 단일 파일 다운로드를 같은 수준으로 보지 않는다. export는 더 강한 통제가 필요하다.

---

## 6. 개인정보와 민감정보 기준

개인정보 또는 민감정보를 화면에 표시할 때는 다음 순서로 판단한다.

1. 목록 화면에 원본이 꼭 필요한가?
2. 마스킹 표시로 충분한가?
3. 원본 열람 시 사유가 필요한가?
4. access log가 서버에서 강제되는가?
5. guest 또는 read-only 계정에서 접근 가능한가?

기본 정책:

- 목록은 마스킹 우선
- 원본 열람은 별도 액션
- 원본 열람은 사유 필수
- 원본 열람 기록은 서버 강제
- 로그 실패 시 원본 미노출

민감정보 예시:

- 이름, 이메일, 전화번호
- HR 프로필, 평가, 급여성 정보
- 투자금액, 지분율, LP 정보
- M&A 조건, NDA, 실사 자료
- 평가 점수, 심사위원 의견
- 사업자등록번호, 주소

---

## 7. Guest 기능 기준

Guest 기능은 내부 WORKS보다 좁은 권한으로 설계한다.

필수 확인:

- guest JWT 만료 시간
- 초대 만료 시간
- OTP 시도 횟수 제한
- 본인 회사 또는 본인 배정 데이터만 접근하는지
- 내부 master data 직접 조회 차단
- 프로그램, 세션, 평가, 자료의 scope 검증
- 만료 후 UI뿐 아니라 RLS/API에서도 차단

Guest가 접근할 수 있는 데이터는 항상 다음 중 하나로 설명되어야 한다.

- 자기 회사
- 자기 배정
- 자기 제출
- 임시 링크 범위
- 특정 프로그램 범위

설명할 수 없는 데이터 접근은 허용하지 않는다.

---

## 8. Export와 대량 반출 기준

Export 기능은 일반 조회 기능보다 더 강하게 통제한다.

필수 요소:

- 별도 export 권한 또는 관리자 승인
- 데이터 건수 기록
- 요청 사유
- 생성자/다운로더 기록
- 민감 컬럼 기본 마스킹
- 파일 만료 시간
- 재다운로드 제한 또는 로그
- 실패/만료 상태 관리

대량 다운로드가 필요한 기능을 만들 때는 먼저 [4_security_privacy_policy.md](./4_security_privacy_policy.md)의 Export 기준을 확인한다.

---

## 9. 프론트엔드 개발 기준

프론트엔드는 보안 최종 판단을 하지 않는다. 하지만 사용자가 실수하지 않도록 권한별 경험을 제공해야 한다.

기준:

- read 권한만 있으면 생성/수정/삭제 버튼을 숨기거나 비활성화한다.
- write 권한이 있어도 서버 실패 가능성을 고려해 오류 메시지를 준비한다.
- 권한 없는 메뉴는 사이드바와 라우트에서 모두 막는다.
- 민감 원본은 기본 표시하지 않는다.
- 폼 검증은 클라이언트와 서버 양쪽에 둔다.
- 화면에서 쓰는 workspace key는 DB 권한 key와 일치해야 한다.

상태 관리 기준:

- 인증 상태 초기값은 `loading` 또는 `unauthenticated`여야 한다.
- 개발용 mock 사용자는 운영 경로에서 제거한다.
- localStorage에 저장하는 값은 탈취 가능성을 전제로 설계한다.
- guest token은 만료 검사와 서버 차단을 함께 둔다.

---

## 10. 테스트 기준

기능 추가 시 테스트 범위는 위험도에 맞춘다.

최소 테스트 대상:

- 권한 유틸
- 데이터 변환 순수 함수
- 마스킹 유틸
- 필터/정렬/집계 함수
- RLS helper
- SECURITY DEFINER RPC
- guest 접근 경계
- 파일 다운로드/민감정보 열람 로그

권장 검증 명령:

```bash
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
```

DB/RLS 변경이 있으면 추가로 확인한다.

```bash
pnpm.cmd db:reset
supabase test db
```

테스트가 아직 없는 패키지는 "성공"으로 착각하지 않도록, 실제 실행된 테스트가 무엇인지 보고한다.

---

## 11. 리팩토링 판단 기준

기능 개발 중 아래 상황이 생기면 작은 리팩토링을 함께 한다.

- 같은 권한 판단이 3곳 이상 반복된다.
- DB workspace key와 프론트 key가 불일치한다.
- client-only 보안 로직이 서버 강제로 바뀌어야 한다.
- `service_role` 사용 범위가 넓어진다.
- 특정 화면 구현을 위해 기존 RLS를 느슨하게 만들고 싶어진다.
- 새 데이터 모델이 기존 테이블을 우회해 중복 master data를 만든다.
- lint/typecheck를 깨고 임시로 넘어가려 한다.

반대로 아래는 후순위로 미뤄도 된다.

- 단순 컴포넌트 이름 정리
- 미세한 스타일 중복
- 성능 문제가 확인되지 않은 일반 memoization
- 사용자가 보지 않는 내부 변수명 통일

---

## 12. Definition of Done

보안 경계가 있는 기능은 완료 기준에 아래를 포함한다.

- 요구 기능이 동작한다.
- 읽기/쓰기 권한이 분리되어 있다.
- RLS 또는 서버 guard가 최종 차단을 수행한다.
- guest 접근 범위가 설명 가능하다.
- 개인정보/파일/export는 감사 로그 경로가 있다.
- migration security gate를 통과했다.
- lint/typecheck/build 결과를 확인했다.
- 테스트가 없으면 왜 없는지와 후속 계획을 남겼다.
- 관련 문서 또는 PROGRESS 항목을 갱신했다.

---

## 13. 새 기능 설계 템플릿

새 기능을 시작할 때 아래 템플릿을 채운다.

```md
## 기능명

### 목적
- 

### 데이터 소유 workspace
- 

### 사용자/권한
- read:
- write:
- guest:

### 데이터 scope
- global / department / program / project / fund / company / self / temporary

### 민감정보 여부
- 없음 / 개인정보 / Restricted / Secret / 파일 / Export

### DB 변경
- 신규 테이블:
- 신규 컬럼:
- RLS 정책:
- RPC/SECURITY DEFINER:

### 서버 경로
- Edge Function:
- service_role 사용 여부:
- 감사 로그:

### 프론트 경로
- 라우트:
- 권한 가드:
- 읽기전용 상태:

### 검증
- typecheck:
- lint:
- build:
- test:
- RLS:
```

---

## 14. 최종 원칙

앞으로의 개발은 "빠르게 만들고 나중에 보안"이 아니라 "작게 만들고, 그 기능의 보안 경계까지 같이 닫기"로 진행한다. 이 방식이 장기적으로 가장 빠르다.
