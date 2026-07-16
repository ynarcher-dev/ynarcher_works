# [12] 즉시 보완 작업 지시서

작성일: 2026-07-16  
목적: 현재 서비스에서 기능 추가를 계속하기 전에 반드시 바로잡아야 할 인증, 권한, 보안, 검증 공백을 정리한다. 이 문서는 다른 작업자나 에이전트에게 "먼저 판단하고, 필요한 보완을 구현하라"고 전달하기 위한 실행 안내서이다.

---

## 1. 작업자에게 주는 핵심 지시

이 작업은 전체 리팩토링이 아니다. 목표는 이미 구현된 서비스의 큰 방향을 유지하면서, 운영 전 또는 다음 민감 기능 개발 전에 위험한 부분을 먼저 안정화하는 것이다.

작업자는 아래 순서로 진행한다.

1. 이 문서와 관련 기준 문서를 먼저 읽는다.
2. 현재 코드와 마이그레이션을 직접 확인한다.
3. 각 항목을 `수정 필요`, `문서/설계 보완 필요`, `현 상태 유지 가능`으로 판단한다.
4. 수정이 필요한 항목은 작게 나누어 구현한다.
5. 변경 후 최소 검증 명령을 실행하고 결과를 남긴다.

관련 기준 문서:

- [2_auth_permissions_architecture.md](./2_auth_permissions_architecture.md)
- [3_database_rls_policy_matrix.md](./3_database_rls_policy_matrix.md)
- [4_security_privacy_policy.md](./4_security_privacy_policy.md)
- [6_api_contracts.md](./6_api_contracts.md)
- [11_migration_security_gate.md](./11_migration_security_gate.md)
- [9_database_physical_schema.md](./9_database_physical_schema.md)

---

## 2. 작업 원칙

- 큰 구조 변경보다 위험 제거를 우선한다.
- UI 가드는 보안으로 보지 않는다. 최종 권한 차단은 Supabase RLS, RPC, Edge Function에서 강제한다.
- `service_role`은 일반 조회나 일반 다운로드 경로에 사용하지 않는다.
- 신규 마이그레이션은 [11_migration_security_gate.md](./11_migration_security_gate.md)를 통과해야 한다.
- 사용자가 만들었을 수 있는 기존 변경은 되돌리지 않는다.
- 한 번에 모든 기능을 정리하려 하지 말고, 아래 P0/P1 순서대로 진행한다.

---

## 3. P0: 즉시 보완해야 하는 항목

### 3.1 개발용 super admin 기본 인증 제거

현재 확인 지점:

- `apps/works/src/auth/authStore.ts`
- 현재 초기 상태가 `authenticated`이고, `test-user-id` / `super_admin` 사용자를 기본값으로 둔다.

위험:

- 앱 부팅 직후 실제 세션 확인 전에 보호 라우트가 잠깐 열릴 수 있다.
- 배포 환경에서 실수로 남으면 권한 UI와 업무 화면 접근 판단이 왜곡된다.
- RLS가 최종 방어선이어도, UI/상태 계층의 보안 판단과 감사 흐름이 신뢰하기 어려워진다.

권장 보완:

- `authStore` 초기값은 `status: 'loading'`, `user: null`로 시작한다.
- `AuthProvider`의 `employeeAuth.init()`이 완료되면 실제 세션에 따라 `authenticated` 또는 `unauthenticated`로 전환한다.
- 로컬 데모용 사용자가 필요하면 명시적인 mock/dev provider로 분리하고, 운영 빌드 경로에 섞이지 않게 한다.

수용 기준:

- 로그인하지 않은 상태에서 `/office`, `/startup`, `/admin` 등 보호 라우트가 열리지 않는다.
- `rg "test-user-id|테스트 관리자|status: 'authenticated'" apps/works/src/auth` 결과에 운영 경로 기본 인증이 남지 않는다.
- `pnpm.cmd typecheck`가 통과한다.

---

### 3.2 프론트 WorkspaceKey와 DB workspace_key 정합화

현재 확인 지점:

- `apps/works/src/auth/types.ts`는 `office`, `startup`을 포함한다.
- `supabase/migrations/20260705120000_init_schema_enums.sql`의 `public.workspace_key`는 `hub`, `networks`, `ac`, `fund`, `mna`, `project`, `management`, `admin`, `guest` 중심이다.
- `supabase/migrations/20260705120700_seed_permission_templates.sql`도 `hub`를 seed한다.
- `apps/works/src/features/admin/config.ts`의 ADMIN 권한 콘솔 노출 항목에는 `office`, `startup`이 빠져 있다.
- `docs/docs_master/PROGRESS.md` 백로그에도 권한 원장 정합화가 남아 있다.

위험:

- super admin이 아닌 계정에서 `office` 또는 `startup` 메뉴 접근이 기대대로 동작하지 않을 수 있다.
- 권한 콘솔에서 실제 프론트 메뉴 권한을 관리하지 못할 수 있다.
- RLS helper와 프론트 권한 판단이 서로 다른 키를 기준으로 움직일 수 있다.

권장 보완:

1. 현재 정책 의도를 먼저 결정한다.
   - `hub`를 완전히 `office`로 대체할지
   - `hub`를 유지하되 `office`를 별도 workspace로 추가할지
   - `startup`을 별도 workspace로 추가할지, 아니면 `networks`의 업무 뷰로 볼지
2. 결정에 따라 신규 마이그레이션을 작성한다.
   - enum 값 추가 또는 데이터 이관
   - `permission_templates` seed 갱신
   - 기존 `workspace_permissions` 데이터 이관
   - ADMIN 권한 콘솔 항목 갱신
3. RLS helper와 주요 정책에서 새 키를 참조할 수 있는지 확인한다.

판단 가이드:

- 프론트 라우트가 독립 메뉴이고 권한을 별도로 제어해야 하면 DB에도 독립 workspace key가 있어야 한다.
- 단순 이름 변경이라면 기존 데이터 이관과 문서 갱신을 함께 해야 한다.
- `hub`가 더 이상 사용자에게 노출되지 않는다면 남겨둘 이유와 호환 전략을 문서화한다.

수용 기준:

- 일반 내부 계정으로 `office`, `startup` 접근 권한이 의도대로 부여/차단된다.
- ADMIN 권한 콘솔에서 현재 프론트 워크스페이스 목록을 관리할 수 있다.
- `permission_templates`와 프론트 `WorkspaceKey` 사이에 설명 없는 불일치가 없다.
- RLS 회귀 테스트 또는 동등한 SQL 검증에 새 키 케이스가 추가된다.

---

### 3.3 lint 실패 해소

현재 확인 지점:

- `pnpm.cmd lint` 실패
- 주요 오류:
  - `apps/works/src/features/management/panels/OrgTreeEditor.tsx`
  - `apps/works/src/features/networks/materialHooks.ts`

위험:

- CI에서 lint 단계가 실패한다.
- 이미 문서상 CI/CD가 구축되어 있으므로, 실제 배포 신뢰도가 떨어진다.

권장 보완:

- `OrgTreeEditor.tsx`의 `false && editable` 블록은 임시 비활성 코드로 보인다. 유지할 필요가 없으면 제거하고, 향후 복구 예정이면 명시적인 feature flag 또는 주석 문서화된 조건으로 전환한다.
- `materialHooks.ts`의 정규식 불필요 escape는 lint 규칙에 맞게 정리한다.
- warning은 당장 모두 해결하지 않아도 되지만, P0 오류는 먼저 제거한다.

수용 기준:

- `pnpm.cmd lint`가 error 없이 종료한다.
- 남은 warning은 의도적으로 허용 가능한지 별도 메모를 남긴다.

---

### 3.4 민감정보 원본 열람 로그 강제화

현재 확인 지점:

- `apps/works/src/features/master/SensitiveValue.tsx`
- 현재 `access_logs` insert를 시도하지만, 실패해도 원본 열람을 진행하는 베스트 에포트 방식이다.

위험:

- 개인정보 원본 열람 기록이 누락될 수 있다.
- 클라이언트에서 직접 로그를 남기므로 실패, 우회, 조작 가능성이 있다.
- [4_security_privacy_policy.md](./4_security_privacy_policy.md)의 원본 조회 감사 기준과 어긋날 수 있다.

권장 보완:

- 원본 열람은 RPC 또는 Edge Function으로 이동한다.
- 서버/RPC 내부에서 다음을 한 번에 처리한다.
  - 호출자 인증 확인
  - 열람 권한 확인
  - 사유 필수 검증
  - `access_logs` 기록
  - 허용 시에만 원본 값 반환
- 클라이언트는 마스킹 값만 기본 보유하고, 원본은 서버 응답으로만 받도록 설계를 검토한다.

수용 기준:

- 로그 기록 실패 시 원본 값이 반환되지 않는다.
- 열람 사유가 비어 있으면 서버에서 거부한다.
- ADMIN 다운로드/접근 로그 화면에서 열람 기록이 확인된다.

---

### 3.5 자료 다운로드 감사 로그 강제화

현재 확인 지점:

- `apps/works/src/features/networks/materialHooks.ts`
- `downloadMaterial()`이 클라이언트에서 Supabase Storage `createSignedUrl`을 바로 호출한다.

위험:

- 다운로드 사유와 감사 로그가 누락될 수 있다.
- 자료 보안 등급별 정책을 강제하기 어렵다.
- 파일 다운로드는 대량 반출과 연결되므로 단순 read 권한보다 강한 추적이 필요하다.

권장 보완:

- 다운로드는 Edge Function 또는 RPC 경유로 전환한다.
- 서버 경로에서 다음을 강제한다.
  - 사용자 인증
  - 대상 `attachments` 레코드 조회 및 RLS/업무 권한 확인
  - 민감 등급이면 사유 필수
  - `access_logs` 또는 별도 다운로드 로그 기록
  - 짧은 TTL Signed URL 발급
- 일반 파일과 restricted/confidential 파일을 구분할 수 있는 컬럼 또는 정책이 없다면 먼저 설계한다.

수용 기준:

- 클라이언트가 직접 Signed URL을 발급하지 않는다.
- 다운로드 로그가 실패하면 다운로드 URL도 발급되지 않는다.
- 다운로드 사유 로그 화면에서 파일 다운로드 기록이 확인된다.

---

### 3.6 Edge Function CORS 운영 설정 분리

현재 확인 지점:

- `supabase/functions/_shared/cors.ts`
- 현재 `Access-Control-Allow-Origin: *`

위험:

- 브라우저에서 어떤 origin에서도 Edge Function 호출을 시도할 수 있다.
- 인증 토큰이 필요한 경로라도 운영 보안 정책상 허용 origin을 제한하는 편이 안전하다.

권장 보완:

- `ALLOWED_ORIGINS` 환경 변수를 도입한다.
- local/development에서는 로컬 주소를 허용하고, production에서는 실제 WORKS/GUEST 도메인만 허용한다.
- 허용되지 않은 origin은 CORS 헤더를 반환하지 않거나 403으로 거부한다.
- Supabase 함수 호출 방식과 배포 도메인을 확인해 guest/works 양쪽이 정상 동작하도록 한다.

수용 기준:

- 로컬 개발 origin과 운영 origin 목록이 분리된다.
- 알 수 없는 origin에서 함수 호출 시 브라우저 CORS가 차단된다.
- `guest-auth-request`, `guest-auth-verify`, `employee-create`, `link-metadata` 모두 영향 검토가 끝난다.

---

## 4. P1: 바로 이어서 보완하면 좋은 항목

### 4.1 테스트 스크립트 실효성 확보

현재 확인 지점:

- root `package.json`에는 `test: turbo run test`가 있다.
- 현재 `pnpm.cmd test`는 성공하지만 앱 단위 테스트가 거의 실행되지 않는다.
- RLS 테스트 SQL은 `supabase/tests/rls_regression_test.sql`에 존재한다.

권장 보완:

- 최소한 핵심 순수 함수와 권한 유틸에 Vitest 등 테스트 러너를 붙인다.
- CI에서 "테스트 없음인데 성공" 상태가 되지 않도록 한다.
- RLS 테스트 실행 방법을 로컬/CI 기준으로 분리해 문서화한다.

우선 테스트 후보:

- `hasWorkspaceRead`
- masking utility
- workspace 권한 매핑
- startup classification
- dashboard compute 함수
- RLS helper 주요 케이스

---

### 4.2 SSRF 보호 수준 점검

현재 확인 지점:

- `supabase/functions/link-metadata/index.ts`
- private IPv4/IPv6 host 차단과 URL scheme 제한은 일부 구현되어 있다.

권장 보완:

- redirect 후 최종 URL host도 다시 검사한다.
- DNS resolution 결과가 private IP인지 확인할 수 있는지 검토한다.
- 허용 콘텐츠 타입과 응답 크기 제한을 명확히 한다.
- 요청 rate limit 또는 사용자별 제한을 검토한다.

---

### 4.3 알림 provider 로그 모드 운영 전 점검

현재 확인 지점:

- `supabase/functions/_shared/notifications.ts`
- provider key가 없으면 로그 fallback으로 처리한다.

권장 보완:

- production에서 provider key 미설정 시 성공 처리하지 않도록 한다.
- OTP 같은 인증성 메시지는 발송 실패와 성공을 명확히 분리한다.
- OTP 원문이 운영 로그에 남지 않게 한다.

---

## 5. 검증 명령

작업자는 변경 후 가능한 범위에서 아래를 실행한다.

```bash
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
```

Supabase 로컬 환경이 가능하면 추가로 실행한다.

```bash
pnpm.cmd db:reset
supabase test db
```

Windows PowerShell에서 `pnpm`이 실행 정책으로 막히면 `pnpm.cmd`를 사용한다.

---

## 6. 작업 보고 형식

다른 에이전트는 작업 완료 후 아래 형식으로 보고한다.

```md
## 변경 요약
- ...

## 판단 결과
- P0-1 개발용 super admin 기본 인증: 수정 완료 / 보류 / 현상 유지
- P0-2 WorkspaceKey 정합성: 수정 완료 / 설계 필요 / 보류
- ...

## 검증 결과
- pnpm.cmd typecheck: 통과/실패
- pnpm.cmd lint: 통과/실패
- pnpm.cmd build: 통과/실패
- pnpm.cmd test: 통과/실패
- RLS 테스트: 통과/미실행, 이유

## 남은 위험
- ...
```

---

## 7. 이 문서의 비목표

- 모든 화면의 UX 개선
- 전체 폴더 구조 재편
- 대규모 상태 관리 교체
- 모든 warning 일괄 제거
- 기능 명세 재작성

이 문서의 목표는 다음 개발을 안전하게 이어갈 수 있도록, 현재 위험한 기반 문제를 먼저 안정화하는 것이다.
