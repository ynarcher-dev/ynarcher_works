# 현재 서비스 상태 (Current Status)

구현·검증·운영 준비도의 요약입니다. 문서별 소유 범위는 다음과 같습니다.

| 질문 | 문서 |
| :--- | :--- |
| 지금 어디까지 되어 있고 무엇이 막혀 있나 | **이 문서** |
| 앞으로 무엇을 어떤 순서로 하나 | [MASTER_PLAN.md](./MASTER_PLAN.md) |
| 보안 관점의 진단과 조치 | [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) |
| 어떻게 개발·검증·배포·복구하나 | [OPERATIONS.md](./OPERATIONS.md) |
| 지금 화면·라우트가 실제로 무엇인가 | [0_as_built_reverse_spec.md](./docs_planning/0_as_built_reverse_spec.md) |
| 어떤 작업을 언제 했나 | [PROGRESS.md](./docs_master/PROGRESS.md) |

* **기준일**: 2026-09-13 (Asia/Seoul)
* **기준 브랜치·커밋**: `main` / `846dfb83` **+ 현재 작업 트리(미커밋 포함)**
* **기준 범위**: 소스·설정을 읽고 로컬 명령을 실행해 얻은 결과입니다. **커밋되지 않은 상태이므로 기준선이 아닙니다** — 같은 트리에 다른 작업자의 진행 중인 변경(녹취 구현 등)도 함께 있습니다.

> [!IMPORTANT]
> §3의 최신 수치는 **2026-09-13 현재 작업 세션**에서 측정한 값입니다. 작업 트리는 계속 바뀌므로 **그 시점의 값**이며, 앞선 측정은 §3의 역사 표에 요약으로 남습니다. 확인하지 않은 것: GitHub 워크플로 실행 이력, 실제 배포, 운영 Supabase·운영 DB, 브라우저 E2E.

> [!WARNING]
> 본 문서는 배포 완료를 선언하지 않습니다. 운영 URL, 운영 담당자, 운영 Supabase 프로젝트와 로컬 마이그레이션의 정합성은 저장소만으로 확정할 수 없습니다. **마이그레이션 파일이 있다는 사실은 운영 DB에 적용되었다는 증거가 아닙니다.**

---

## 0. 2026-09-13 출시 점검 (Codex 직접 실행)

아래는 Codex가 **직접 실행·조회해 얻은 결과**입니다. 이 절이 현재 수치를 가지며, **§3 이하의 종전 수치는 이력으로 남깁니다.**

* **정적 게이트 전부 PASS**: `lint`(오류 0건, 경고 44건) · `typecheck` · `typecheck:functions` · `test` · `build`. 테스트는 WORKS **1,140개**, GUEST **165개**, `test:baseline` **94개 파일**입니다.
* **베이스라인 갱신 PASS**: 산출물을 새로 만들고 **별도의 새 스택**에서 `verify`까지 통과했습니다. cutoff는 `20260913200000`, 마이그레이션 **380건**입니다.
* **GitHub 실행 이력 조회됨**(로그인 상태): 종전 CI `34664246997`은 **환경 변수 누락으로 실패**했고 그 원인을 수정했습니다. 종전 Deploy `34664246998`은 **`aws-region` 누락**으로 실패했습니다.
* **Actions 설정 비어 있음**: Repository와 `production` 환경 모두 **Secrets·Variables가 하나도 없습니다**. 값을 채우기 전에는 빌드·배포가 같은 원인으로 다시 실패합니다.
* **AWS 로컬 자격 권한 부족**: CloudFront `ListDistributions`와 IAM `ListRoles` 권한이 없어 배포 대상·역할을 로컬에서 확인하지 못했습니다.
* **운영 DB는 읽기만 수행**: `20260913180000`까지 적용된 것을 확인했고, **예산 관련 2건은 미적용**입니다. **운영 DB 쓰기와 배포는 실행하지 않았습니다.**
* **커밋·푸시는 사용자가 전체 승인**했습니다. 다만 **새 CI·배포가 성공했다는 주장은 아직 하지 않습니다** — 실행 결과를 확인한 뒤에 적습니다.

---

## 1. 전체 판단

주요 화면, 도메인 스키마, RLS 구조, 단위 테스트 기반이 폭넓게 구현되어 있습니다. 2026-09-13에는 **전사 GUEST 계정 생성·조회 화면, ADMIN 계정 수명주기·연락처·비밀번호 초기화, 부분 성공 대용량 생성, PROJECT·M&A·FUND 명부 추가·제외 분리**가 저장소에 반영되었습니다. 사업부가 운영하는 `programs` 원장의 사용자 표기는 메뉴부터 상세까지 **프로젝트**로 통일했습니다. M&A 계정 존재 숨김과 직접 명부 쓰기 우회도 DB 경계에서 차단합니다.

**정적 게이트와 DB 회귀는 2026-09-13 실행에서 전부 통과합니다**(수치·범위는 §3). 그 통과는 **로컬·격리 환경의 것**이며 운영 환경이나 GitHub 실행 이력을 말하지 않습니다.

남은 것은 성격이 둘입니다. ① **저장소 밖 증거가 필요한 것** — GitHub 워크플로 실행, 실제 배포, 운영 DB 반영, 운영 CORS, 관측성, 브라우저 E2E. ② **작업 트리 안에서 아직 닫히지 않은 것** — 실발송(어댑터 없음, `SEC-2`), 역할×워크스페이스 **전역 권한 감사**와 연결된 후속(쓰이지 않는 레거시 ACL, `open_program_guest_access` 범위 불일치, 저장소에 없는 `guest-temp-resolve`), 신규 환경 부트스트랩 경로. 현 단계는 여전히 **통합 검증 전 단계**입니다 — 승인된 안정화 범위의 구현과 테스트는 검토를 마쳤고(§3), 위 후속은 그 범위 밖입니다.

---

## 2. 영역별 상태

| 영역 | 현재 구현 | 남은 것 |
| :--- | :--- | :--- |
| WORKS | 스위처 8항목의 화면과 원장·업무 흐름. `/guest-accounts` 한 화면을 사업부·M&A팀·투자실 하단에서 열며 일반 사용자는 생성·조회, ADMIN은 정지·해제·삭제·연락처·비밀번호를 관리 | 브라우저 경로 검증 |
| GUEST | 이메일+비밀번호 커스텀 JWT 로그인, 맥락(프로젝트/FUND) 선택, 고정 메뉴 4종 + 모듈 화면, 공개 링크 3종. Vitest 러너 편입(인증·세션·비밀번호 규칙 + `richText` 정화기 회귀) | 안내 메일·재설정 링크의 실발송, 브라우저 경로 검증 |
| Supabase | 순차 마이그레이션 **374건**·Edge Functions·회귀 SQL. 격리 스택에서 전수 재생과 pgTAP이 통과하고(§3), GUEST 계정 중복·수명주기·비밀번호·명부·M&A 가시성 경계가 회귀로 고정됨 | 역할×워크스페이스 **전역 권한 감사**, 운영 반영 여부 확인, 신규 환경 부트스트랩 경로 검증 |
| 공통 UI | 디자인 토큰·밀도 체계와 ESLint 회귀 방어 규칙(`eslint.config.mjs`의 `designSystemRules`) | GUEST 잔여 수제 UI 편입 |
| CI | `main`·PR에서 lint → typecheck → `typecheck:functions` → build → test + 재사용 `DB 회귀` 잡. 근거: `.github/workflows/ci.yml`, `db-tests.yml` | **GitHub 워크플로 실행 이력 미확인** — 같은 명령·같은 러너의 로컬 결과는 §3에 있습니다 |
| 배포 | CI 완료(`workflow_run`)·수동 실행만 트리거이고, `gate` 잡이 **같은 SHA의 CI 성공**을 확인해 아니면 차단(fail-closed). 근거: `.github/workflows/deploy.yml` | **실제 실행·배포로 확인하지 않음** — 오프라인 시나리오 26건과 YAML 파싱만 확인(`OPS-1`) |
| 운영·복구 | RPO 24시간/RTO 4시간 목표의 복구 런북(`infra/runbooks/restore-drill.md`) | 실제 리허설 수행 기록 미확인 |

---

## 3. 현재 검증 결과

**최신 실행**: 2026-09-13 · **대상**: `main` / `846dfb83` + 현재 작업 트리(미커밋) · **환경**: 로컬·격리 스택. **운영 DB·GitHub 실행 이력은 대상이 아닙니다.**

| 명령 | 결과 |
| :--- | :--- |
| `lint` | exit 0 — 오류 0건, 경고 44건(기존 경고) |
| `typecheck` · `typecheck:functions` | exit 0 |
| `build` | exit 0 — 4/4 |
| WORKS·GUEST Vitest | exit 0 — **94개 파일 / 1,233개 테스트**(WORKS 1,071 + GUEST 162) |
| `test:baseline`(2026-09-12 기록) | exit 0 — **94개 통과, 건너뜀 0** |
| `test:db`(격리 스택, 신규 DB) | exit 0 — 마이그레이션 **375건** 재생, pgTAP **20개 파일 / 단언 528개 전부 통과**(저장소 19개 + 러너 생성 1개) |
| GUEST 계정 표적 회귀 | exit 0 — WORKS **9개 파일 / 166개**, DB 연락처·대량생성·명부 **3개 파일 / 145개** |
| 인가 인벤토리 회귀 표적 재실행 | exit 0 — `authorization_inventory_test.sql` **계획 56 / 실행 56**(거절 단언 `C23`의 메시지를 실제 인가 응답과 맞춘 뒤) |
| `db:baseline:verify` | exit 0 — **산출물을 만든 스택이 아닌 새 스택**에서 재생한 덤프가 스냅샷과 **바이트까지 동일** |

* GUEST의 162개에는 `richText` 정화기 회귀 124개가, WORKS에는 닫힌 알림 발송 창구 회귀가 들어 있습니다.
* 통과한 단언은 **그 단언이 통과했다는 뜻**이며 해당 기능 전체가 검증되었다는 뜻이 아닙니다. DB 결과는 **격리된 신규 DB 기준**이라 운영 DB의 적용 상태·거동을 말하지 않습니다.
* **실행하지 않은 것**: GitHub 워크플로 실행·배포, 운영 Supabase·운영 DB 조회, 브라우저 E2E.
* 위는 **승인된 안정화 범위**에 대한 결과이며, 그 범위의 구현과 테스트는 검토를 마쳤습니다. 범위 밖 후속은 §4와 [MASTER_PLAN.md](./MASTER_PLAN.md)가 가집니다.

### 베이스라인 산출물 — 2026-09-13 03:23 KST

`supabase/baseline/`에 `current_schema.sql`·`manifest.json` **한 쌍이 있습니다**(종전 "미생성" 서술은 더 이상 사실이 아닙니다). manifest가 답하는 값은 cutoff `20260913160000`, 마이그레이션 375건(cutoff 이후 0건), `migrationHistorySha256` `d97577d3…`, `schemaSha256` `0cb2de01…`, 생성 환경 PostgreSQL 17 / Supabase CLI 2.109.0, `source`는 격리 로컬 스택입니다.

* **소유 경계**: cutoff·마이그레이션 수·해시·생성 환경 같은 **값은 `manifest.json`**이, **생성·검증 절차와 한계는 [12_database_baseline_operations.md](./docs_dev/12_database_baseline_operations.md)**가, **실제로 돌린 검사의 결과는 이 문서 §3**이 가집니다. 위 값은 manifest를 읽어 옮긴 것이며 해시 표를 따로 두지 않습니다.
* 스냅샷이 보증하는 것은 **cutoff 시점 스키마의 재현성 하나**입니다 — **신규 환경 부트스트랩·복구가 된다는 증명이 아니고**, 담기는 범위도 `public`·`app` 두 스키마뿐입니다.
* **독립 재검증이 통과했습니다** — 산출물을 만든 스택이 아닌 **새 스택**에서 재생한 덤프가 스냅샷과 바이트까지 같습니다(§3).
* 산출물은 **작업 트리에만** 있습니다. 커밋·배포·운영 DB 반영은 하지 않았습니다.

### 1차 게이트 기록 (역사 — 그때의 트리)

아래는 지우지 않고 요약으로 남기는 **과거 시점의 값**이며, 현재 상태는 위 최신 실행이 답합니다.

| 시각 | 결과 |
| :--- | :--- |
| 11:45~11:47 | 전체 JS 게이트 exit 0 — 82개 파일 / 905개 테스트, `build` 4/4 |
| 14:59 | DB 회귀 exit 0 — 마이그레이션 363건 재생, pgTAP 12개 파일 / 단언 224개 통과 |
| 15:49 | GUEST 부분 집합 exit 0 — 3개 파일 / 162개 테스트(정화기 회귀 124개 포함) |

### 3.1 권한 인벤토리의 요지

표 단위 결정·근거·수치의 정본은 [15_authorization_inventory.md](./docs_dev/15_authorization_inventory.md)와 `supabase/security/`의 산출물, 그리고 각 마이그레이션의 머리 주석입니다. **여기에 같은 표를 다시 두지 않습니다.** 판단에 필요한 요지만 남깁니다.

* **`authenticated`는 임직원과 게스트가 함께 쓰는 한 롤입니다** — 게스트 세션 JWT가 `role: "authenticated"`로 서명되므로 `grant … to authenticated` 한 줄은 외부 참여자에게도 열리고, 둘을 가르는 것은 **오직 RLS 술어**입니다. 최소 권한 판단은 임직원 위협모형만으로 정당화되지 않습니다.
* 격리 재생 기준으로 표 **159개**, `SECURITY DEFINER` 루틴에 **`search_path` 누락 0건**, 브라우저 접촉면은 표 103개·RPC 80종·Edge Function 22개입니다.
* `service_role`에 **모든 표에서 DML이 없다**는 관측은 **보정 전(2026-09-12 초기 재생) 시점의 값**이며 현재 상태가 아닙니다 — 보정 이후의 역할별 권한은 [15_authorization_inventory.md](./docs_dev/15_authorization_inventory.md)와 `supabase/security/acl-decisions.json`이 답합니다.
* ACL 보정은 마이그레이션 **4건**입니다 — 테이블 권한·기본 권한·RPC `EXECUTE` 좁히기에 이어, `20260912161500`이 `guest_invitations`의 `INSERT`·`UPDATE` 정책에 **내부 사용자 조건을 AND로** 더합니다. 표 권한이 열린 회차에 **현실적인 게스트 조합(`guest`·`write`·`self`)이 실제로 통과하는 것**이 회귀에서 드러났고, 지금은 **거절됨이 회귀로 고정**되어 있습니다.
* **이 보정이 전자결재 목록을 한 차례 끊었습니다(2026-09-13 확인·복구)**: `20260912160000`이 `approval_recipients`·`approval_reads`에 쓰기만 남기고 `SELECT`를 걷었는데, 두 표는 `approval_documents` 조회에 임베드되어 함께 읽힙니다. **표 권한은 RLS보다 먼저 검사되므로** 요청 전체가 `42501`(HTTP 403)로 끝났습니다 — RLS 거부였다면 빈 200이었을 것입니다. 두 표의 `SELECT` 정책은 멀쩡했고 빠진 것은 `GRANT` 하나였습니다. `20260913170000`으로 복구해 운영 DB에 적용했고, 같은 형태(쓰기 권한은 있으나 읽기 권한이 없는 표)는 운영 DB 전체에서 이 둘뿐임을 확인했습니다.
* 이 보정은 **게스트 로그인 정책을 건드리지 않습니다** — 이메일 아이디 + 비밀번호, 설정 전에만 유효한 초기 연락처, 자격증명의 오프라인 취급은 그대로입니다(§4).
* **이 정리는 서비스 전체의 권한 감사가 아닙니다.** 전역 역할×워크스페이스 감사, 오래되어 쓰이지 않는 ACL 정리, `open_program_guest_access`의 지원 범위(FUND·M&A)와 `guest_invitations` 정책 범위(PROJECT·GUEST)의 불일치, 저장소에 없는 `guest-temp-resolve`는 **연결된 후속 과제**로 남습니다(§4, [MASTER_PLAN.md](./MASTER_PLAN.md)).

### 테스트 범위에 대한 사실

* `pnpm test`는 turbo가 각 패키지의 `test` 스크립트를 부르며 **WORKS와 GUEST 둘 다** 돕니다.
* WORKS의 Vitest는 `src/**/*.test.ts` 외에 `../../supabase/functions/**/*.test.ts`와 `../../scripts/**/*.test.mjs`를 함께 돕니다. Edge Function의 **순수 판정과 핸들러 경계**(DB 클라이언트만 대역)가 여기서 검증되며, **Deno 런타임·PostgREST/RLS·브라우저 경로는 대상이 아닙니다.**
* GUEST의 Vitest는 `src/**/*.test.ts`만 담고, 경계로 세운 대역은 `fetch`·`localStorage`뿐입니다. **jsdom 통과는 브라우저 증거가 아닙니다**(`E2E-1`).
* 베이스라인 도구의 단위 테스트는 `node:test` 러너(`pnpm test:baseline`)가 돌리며 루트 `pnpm test`에 포함됩니다. **실제 스택 기동·덤프는 단위 테스트의 대상이 아닙니다.**
* SQL 회귀는 `supabase/tests/`에 있고 실행기는 `pnpm test:db`(격리 로컬 스택)이며, CI의 `DB 회귀` 잡이 같은 러너를 부릅니다. 절차와 전제는 [OPERATIONS.md](./OPERATIONS.md) §4.3.

---

## 4. 현재 확인된 차단 요소 — 요약

우선순위와 실행 순서는 [MASTER_PLAN.md](./MASTER_PLAN.md)가, 보안 판단 근거는 [SECURITY_REVIEW.md](./SECURITY_REVIEW.md)가 소유합니다. 여기서는 **사실과 참조 ID만** 둡니다(우선순위를 다시 매기지 않습니다).

| 사실 | 근거 | 후속 |
| :--- | :--- | :--- |
| 알림 채널 어댑터가 없어 초대 안내·비밀번호 재설정 링크·결재 알림이 **실제로 나가지 않습니다.** 다만 그 사실이 이제 `ok: false`로 보고되고(공급자 키가 있어도), 재설정 안내 집계도 `notified`만 발송으로 셉니다 — **거짓 성공 보고는 해소, 실발송은 미구현** | `supabase/functions/_shared/notifications.ts`, `apps/works/src/features/program/participantAccessHooks.ts` | `SEC-2`(잔여), 보안 `F-2`(부분 해소) |
| `ALLOWED_ORIGINS`가 **설정되지 않은 경우** 코드가 모든 origin을 허용합니다(유예 모드). 운영 환경에 이 값이 실제로 설정되어 있는지는 저장소에서 확인할 수 없습니다 | `supabase/functions/_shared/cors.ts` | `SEC-3`, 보안 `F-3` |
| 배포가 같은 SHA의 CI 성공을 전제로만 진행되도록 게이트가 들어갔으나, **그 게이트가 GitHub에서 실제로 동작한 이력은 확인하지 않았습니다** | `.github/workflows/deploy.yml` | `OPS-1`(잔여: 실행 이력), 보안 `F-5`(부분 해소) |
| Edge Function·마이그레이션의 배포 경로가 워크플로에 없습니다 | `.github/workflows/deploy.yml` | `OPS-2` |
| 신규 DB의 테이블 권한이 정책과 어긋나 있던 범위는 **마이그레이션 4건으로 정리**되었고 회귀가 고정합니다(§3.1). **남은 것은 전역 감사입니다** — 역할×워크스페이스 전수 확인, 오래되어 쓰이지 않는 ACL 정리, `open_program_guest_access`의 지원 범위(FUND·M&A)와 `guest_invitations` 정책 범위(PROJECT·GUEST)의 **불일치**가 그것입니다. 불일치는 **관측 사실**이며 지금 RLS를 넓히는 근거로 쓰지 않습니다 | §3.1, [15_authorization_inventory.md](./docs_dev/15_authorization_inventory.md) | `AUTHZ-1`·`AUTHZ-2`(전역 감사 잔여), 보안 `F-7` |
| `guest-temp-resolve`가 [TempGuestPage.tsx](../apps/guest/src/pages/TempGuestPage.tsx)에서 호출되는데 **저장소에 소스가 없습니다**(`/g/:token`). 배포본이 따로 있다면 그 인가는 재생·검토가 불가능하고, 없다면 임시 게스트 화면이 조용히 깨져 있습니다 — **어느 쪽인지 저장소로는 확정할 수 없습니다** | `apps/guest/src/pages/TempGuestPage.tsx` | `AUTHZ-1` 부채(다시 꺼낼 조건은 MASTER_PLAN) |
| Edge Function 다섯 곳(`aiFill/run`·`aiFill/extractRun`·`material-download`·`employee-create`·`link-metadata`)이 `is_active`를 보지 않거나 `public.users`를 조회하지 않습니다 — **관측된 것은 검사의 불균일이며, 실제 영향은 경로마다 따로 확인해야 합니다.** 뒤이은 호출자-토큰 질의·권한 검사가 막아 주는 경로가 있으나 **다섯 곳 전부에 대해 증명되지 않았으므로 일괄로 안전하다고 적지 않습니다** | `supabase/functions/` 해당 파일 | `AUTHZ-1` 부채(다시 꺼낼 조건은 MASTER_PLAN) |
| SQL 회귀는 현재 트리에서 전수 통과하지만(§3) 그것은 **격리된 신규 DB 기준**입니다 — 최신 마이그레이션의 **운영 반영 여부는 저장소에서 확인할 수 없습니다** | §3 | `DB-1`(운영 반영 확인) |
| 베이스라인 산출물은 **작업 트리에 확보**되었으나(§3), 그것이 보증하는 것은 **cutoff 시점 스키마의 재현성 하나**입니다 — 신규 환경 부트스트랩·복구 경로는 여전히 **실행해 본 적이 없고**, 커밋·배포도 하지 않았습니다 | `supabase/baseline/`, [12_database_baseline_operations.md](./docs_dev/12_database_baseline_operations.md) §5·§6 | `DB-1`(전환 절차는 별건) |
| GUEST 러너·게스트 인증 경계 테스트·DB 회귀 러너·함수 정적 검사가 자동 실행 경로에 들어왔고, 2026-09-12에 **`richText` 정화기 회귀**가 실제 DOM 기준으로 추가되었습니다(§3). 남은 공백은 **Deno 런타임·PostgREST/RLS·브라우저 경로**입니다 | `.github/workflows/ci.yml`, `apps/guest/src/lib/richText.test.ts` | `TEST-3`(완료), `E2E-1`, 보안 `F-6`(부분 해소) |
| 무인증·저인증 입구(익명 제출, 공개 파일, 게스트 로그인)에 출처 단위 호출 빈도 제한이 없습니다 | `supabase/functions/application-submit`, `public-module-file`, `guest-auth-login` | `SEC-4`, 보안 `F-4` |
| 브라우저 E2E 기준, 오류·실패 수집 및 경보 체계, 운영 환경 구성은 **저장소에서 확인되지 않습니다.** 저장소 밖에 존재할 가능성은 배제하지 않습니다 | — | `E2E-1`, `OBS-1` |
| 워크스페이스 예산·지출은 **저장소 구현·Codex 로컬 검증 완료**입니다. 전체 lint/typecheck/test/build와 격리 DB pgTAP **21파일/580건**(예산 52건), 공통 컴포넌트의 모의 응답 기반 360/768/1280px 브라우저 검증을 통과했습니다. **운영 DB 적용·실제 계정 결재 E2E·배포는 미실행**이며 기존 DB 베이스라인 불일치는 별도로 남아 있습니다 | [workspace_budget_execution.md](./docs_planning/workspace_budget_execution.md) 최종 검증, `supabase/migrations/20260913190000_*`·`20260913200000_*` | 운영 적용 전 베이스라인 정리·실제 계정 검증, `E2E-1` |
| 폐지된 HUB 명칭이 `apps/works/src/features/hub/` 폴더명으로 남아 있고(내용은 OFFICE 게시판·대시보드), 일부 파일이 500줄 가이드를 넘습니다 | `apps/works/src/features/hub/`, `REF-1`의 목록 | `REF-1` |

### GUEST 로그인 정책 (사용자 확정)

GUEST 로그인은 이메일 아이디 + 비밀번호이고, 비밀번호 미설정 계정은 **원장 연락처(숫자만)**로 들어와 세션 대신 설정 티켓만 받고 본인이 개인 비밀번호를 정한 뒤에야 세션이 열립니다(`guest-auth-login/handler.ts`). 설정 이후에는 연락처가 통하지 않으며 기존 계정 잠금은 그대로 걸립니다. 이 때문에 알림 미발송이 로그인 경로 자체를 막지는 않습니다.

**이는 2026-09-12 사용자가 확정한 운영 정책입니다.** 자격증명(이메일·연락처)의 취급과 배포는 저장소 밖의 **오프라인 운영 정책**이 담당하며, 사용자가 그 기밀 취급을 확정했습니다. 정본은 [3_9_1 §6](./docs_planning/3_9_1_guest_unified_account.md)이고, 그 정책 안에서의 동작 확인은 [MASTER_PLAN.md](./MASTER_PLAN.md) `AUTH-1`, 경계 단언은 `TEST-2`가 맡습니다.

**정책과 동작은 바뀌지 않았습니다.** 2026-09-12에 들어간 것은 ① 판정 본체를 배선(`Deno.serve`)에서 분리한 **동작 보존 정리**와 ② 위 규칙을 고정하는 단위 테스트입니다(덮은 경계 목록은 [MASTER_PLAN.md](./MASTER_PLAN.md) `TEST-2`). **이 테스트는 Node에서 DB 클라이언트를 대역으로 두고 돌므로, 배포된 인증이나 RLS가 동작한다는 증거가 아닙니다.** 잔여 위험도 그대로입니다: 비밀번호 설정 전에 한 계정의 이메일과 연락처가 **둘 다** 유출되면 제3자가 먼저 설정 티켓을 받는 사칭이 **조건부로** 성립합니다([SECURITY_REVIEW.md](./SECURITY_REVIEW.md) `F-0`, 시도 상한은 `F-4`). 오프라인 집행 여부는 저장소에서 확인할 수 없습니다. 재설정 링크는 현재 대체 경로가 없습니다.

> [!NOTE]
> 종전 판의 "초대 토큰 전환·초기 로그인 경로 차단" 권고는 **확정 정책으로 승계되어 효력을 잃은 제안**이며, 고쳐진 취약점이 아닙니다.

#### 통합 GUEST 계정 관리 (2026-09-13, 저장소 구현 완료)

* **사용자가 전화번호 기반 ADMIN 초기화를 확정**했고, 종전의 "담당자 초기화를 두지 않는다"는 판단을 그 결정이 대체합니다. 정본은 [3_9_1 §6.2](./docs_planning/3_9_1_guest_unified_account.md)입니다.
* `/guest-accounts` 한 화면을 사업부·M&A팀·투자실 사이드바 하단에서 엽니다. 일반 내부 사용자는 수기 계정 생성과 마스킹 조회를 하며, 목록의 `대용량 업로드` 버튼은 `/guest-accounts/bulk` 전용 페이지로 이동합니다. ADMIN은 같은 목록에서 원본 조회·체크박스 일괄 정지/해제·영구 삭제와 상세 연락처 수정·비밀번호 초기화를 합니다.
* 계정 목록은 `스타트업 / 전문가 / BUYER / SELLER / FUND / 미연결` 여섯 탭이며 `전체`는 없습니다. 복수 자격 계정은 해당 탭마다 보이고, 미연결은 원장 인격과 FUND 참여가 모두 없는 계정을 받습니다. 분류 Y/N 열은 제거했고 서버가 탭 필터 후 전체 건수와 페이지를 계산합니다.
* 수기 생성은 이름·이메일·연락처 한 줄을 늘리는 방식이고, 대용량 전용 페이지는 CSV·XLSX 10,000줄, 화면 100줄 페이지, 서버 200줄 묶음을 지원합니다. 모든 GUEST 계정은 전사 공통이고 NETWORKS 인격 연결은 선택입니다. 행별 `네트워크 원장에서 찾기` 모달은 NETWORKS 구분 탭·검색·서버 페이지네이션·공용 DataTable로 구성되며, 체크한 여러 NETWORKS 행을 한 번에 계정 입력 줄로 넣습니다. 정상 줄은 생성하고 중복·오류 줄만 사유와 함께 남기며 응답이 끊긴 줄은 `확인 필요`로 분리합니다.
* ADMIN 경계는 **RPC 셋**(`admin_update_guest_contact`·`admin_reset_guest_password`·`guest_password_commit`)과 **단명 티켓의 세션 판 묶기**(`supabase/functions/_shared/guestAccount.ts`의 `sv` 클레임, `guest-auth-password`·`guest-auth-context`가 회수 시점에 대조)가 담당합니다. 초기화·연락처 수정은 계정만 고치고 원장은 건드리지 않으며, `is_active`를 바꾸지 않고 변경 전/후를 `audit_logs`에 남깁니다. 연락처가 실제로 바뀌면 **살아 있는 재설정 링크도 함께 비웁니다**(비밀번호·잠금은 유지).
* **비밀번호 쓰기는 조건부 한 경로로 모았습니다**(`guest_password_commit`, `service_role` 전용 INVOKER). 기대 판·기대 해시가 모두 맞을 때만 저장하고, 티켓 경로는 성공 시 판을 올려 티켓을 소진하며 착지는 돌려받은 판을 씁니다. 종전에는 해시를 만드는 동안(수백 ms) 들어온 초기화를 옛 티켓이 덮어쓸 수 있었습니다(3_9_1 §6.2.2).
* 재설정 링크 발급·소진은 토큰·만료·계정 상태·세션 판을 한 트랜잭션에서 비교 후 교체하며 같은 링크의 동시 사용은 한 건만 성공합니다. 보낼 이메일·전화가 모두 없으면 토큰도 발급하지 않습니다.
* 프로젝트/FUND 상세의 `GUEST 계정 추가`는 기존 계정 추가·명부 제외만 수행하고 계정을 만들지 않습니다. 제거해도 계정·원장·참가 명부·인격·다른 프로젝트/FUND 참여는 남습니다. 직접 INSERT·UPDATE로 숨은 M&A 계정을 배정하는 우회도 트리거가 차단합니다.
* 검증: §3의 WORKS·GUEST Vitest, 함수 타입체크, 전체 pgTAP이 통과했습니다. **운영 DB 반영·Edge Function 배포·브라우저 E2E는 하지 않았습니다**(`DB-1`, `E2E-1`).

---

## 5. 해소된 과거 차단 요소

종전 판에서 차단 요소로 적혀 있었으나 현재 소스에서 성립하지 않는 항목입니다. 되돌아오지 않았는지 확인할 때의 기준으로 남깁니다.

| 과거 서술 | 현재 사실 | 근거 |
| :--- | :--- | :--- |
| 알림 발송 일반 창구가 **토큰만 확인하고 임의 수신처·문안을 받음** | 창구가 닫혔습니다 — `POST`는 403 `endpoint_disabled`, 그 밖의 메서드는 405, CORS 프리플라이트만 남습니다. 요청 본문이 수신처·문안을 정하는 경로가 없고, 거절이 요청과 무관하며 **발송기·특권 클라이언트·바깥 요청 부작용이 없다는 것**까지 회귀가 고정합니다. 게스트 초대·비밀번호 재설정 경로는 그대로입니다 | `supabase/functions/notifications-dispatch/handler.ts`·`handler.test.ts` (`SEC-1`, 보안 `F-1`) |
| 베이스라인 산출물이 **없어** `db:baseline:check`·`verify`가 비교 대상을 갖지 못함 | 산출물 한 쌍이 작업 트리에 있고 두 명령이 실제 판정을 냅니다. 값·절차·한계는 [12_database_baseline_operations.md](./docs_dev/12_database_baseline_operations.md)가 소유합니다 | `supabase/baseline/manifest.json` (`DB-1`) |
| 알림 미발송 때문에 GUEST **OTP 로그인 경로가 차단**됨 | 로그인은 이메일+비밀번호 커스텀 JWT이며 OTP 발송에 의존하지 않습니다(초기 비밀번호의 위험은 §4 참고) | `supabase/functions/guest-auth-login/handler.ts`, `apps/guest/src/auth/guestAuthService.ts` |
| 게시판 일부가 **인메모리 데모 저장소**에 의존 | `public.board_posts`를 직접 읽고 쓰며 열람 범위는 RLS가 강제 | `apps/works/src/features/hub/boardPostsApi.ts` |
| 루트 린트가 `hiworks_backup/`까지 검사해 수천 건 보고 | ESLint·git 모두 해당 경로를 무시 | `eslint.config.mjs` ignores, `.gitignore` |

---

## 6. 갱신 규칙

* 운영 배포, 품질 게이트, 인증 방식, DB 반영 상태가 바뀌면 같은 작업에서 본 문서를 함께 갱신합니다.
* 확인하지 않은 상태는 `완료`로 추정하지 않고 `미확인`·`미검증`·`미실행`으로 적습니다. 저장소에서 보이지 않는 것은 `없음`이 아니라 `확인되지 않음`으로 적습니다.
* 검증 결과에는 실행 날짜·시각, 대상 브랜치·커밋, 검증 범위 밖의 변경이 있었는지를 남깁니다.
* 상세 이력은 [PROGRESS.md](./docs_master/PROGRESS.md)에 두고, 여기에는 현재 판단에 필요한 요약만 유지합니다.
