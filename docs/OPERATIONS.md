# 개발·배포·운영 가이드 (Operations)

로컬 개발부터 검토, 배포, 장애 대응, 복구까지의 공통 절차입니다. 현재 상태와 알려진 차단 요소는 [CURRENT_STATUS.md](./CURRENT_STATUS.md), 세부 보안·배포·DB 지침은 `docs/docs_dev`와 `infra/runbooks`가 소유합니다.

* **기준일**: 2026-09-12 (Asia/Seoul) · **기준**: `main` / `846dfb83` **+ 현재 작업 트리(미커밋)**
* **범위**: 저장소의 워크플로·스크립트·설정을 읽어 정리한 절차입니다. **실제 GitHub 실행 이력과 운영 환경의 구성 상태는 여기서 확인하지 않았습니다.**

> [!IMPORTANT]
> 운영 URL, 운영 담당자, AWS 자원 식별자, Supabase 프로젝트 식별자는 **저장소에 확정값으로 기록되어 있지 않습니다.** 아래 절차의 대상 환경은 전부 미확인 상태로 간주하고, 배포·운영 DB 작업 전에 담당자와 실제 대상을 직접 확인합니다.

---

## 1. 환경 구분

| 환경 | 목적 | 저장소로 확인되는 것 |
| :--- | :--- | :--- |
| 로컬 | 기능 개발, 로컬 Supabase, 단위 테스트 | `supabase/config.toml`, `.env.example` 2종 — 구성됨 |
| 스테이징 | 마이그레이션·RLS·복구·E2E 검증 | 없음 — 자원·URL 미확인 |
| 운영 | WORKS/GUEST S3 + CloudFront, 운영 Supabase | 워크플로 파일만 존재. 자원 실재 여부 미확인 |

환경별 URL, 담당자, Supabase project ref, AWS 계정·리전, S3 버킷, CloudFront 배포 ID는 비밀값이 아니라 **식별 정보**이므로, 저장소가 아니라 접근 통제된 운영대장에 기록합니다.

---

## 2. 로컬 실행

```bash
pnpm install --frozen-lockfile
pnpm db:start     # Docker 필요
pnpm db:status    # API URL / anon key / DB URL
pnpm dev
pnpm db:stop
```

`apps/works/.env.example`, `apps/guest/.env.example`을 기준으로 각 앱의 `.env.local`을 만듭니다. Edge Function 시크릿은 `supabase/functions/.env.example`이 기준이며 `pnpm functions:serve --env-file supabase/functions/.env.local`로 주입합니다.

### 2.1 환경 변수 원칙

* **클라이언트 공개 변수**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV`가 두 앱 공통입니다. WORKS는 밖에 뿌리는 주소용으로 `VITE_PUBLIC_MODULE_BASE_URL`, `VITE_APPLY_BASE_URL`을 더 씁니다.
* **서버 시크릿**: `SUPABASE_SERVICE_ROLE_KEY`, `GUEST_JWT_SECRET`, S3 자격증명, 알림 공급자 키는 Supabase Secrets 또는 배포 환경의 비밀 저장소에 둡니다. `GUEST_JWT_SECRET`은 **현재 구현상** 프로젝트의 레거시 JWT 시크릿과 같은 값이어야 우리가 발급한 게스트 토큰을 PostgREST가 신뢰합니다(권장 설계가 아니라 지금 동작하는 방식의 제약입니다).
* **금지**: 서버 시크릿에 `VITE_` 접두사를 붙이거나 `.env.local`을 커밋하지 않습니다.

### 2.2 공개 도메인은 세 가지를 한 건으로

공개 전용 도메인(예: `open.<회사>.com`)을 붙이는 날, 아래 셋을 나눠서 하면 조용히 깨집니다.

| 할 일 | 어디서 |
| :--- | :--- |
| 같은 GUEST 배포에 도메인 별칭 붙이기 | CloudFront |
| `VITE_PUBLIC_MODULE_BASE_URL`·`VITE_APPLY_BASE_URL` 채우기 | WORKS 빌드 환경 |
| 그 도메인을 `ALLOWED_ORIGINS`에 등록 | `supabase secrets set` |

* `_shared/cors.ts`는 **`ALLOWED_ORIGINS`가 설정되지 않은 경우** 모든 origin을 허용합니다(유예 모드). 운영 환경에 이 값이 실제로 설정되어 있는지는 저장소에서 확인할 수 없으므로, 배포 전에 대상 프로젝트의 시크릿을 직접 확인합니다. 목록을 켜는 날 새 도메인이 빠져 있으면 **공개 화면만** 죽고 내부 화면은 멀쩡하므로 원인을 찾는 데 시간이 걸립니다.
* **두 `VITE_` 변수의 값에는 경로 접두사까지 넣습니다.** 코드가 `` `${base}/${token}` ``로 조립하므로 `https://open.example.com/p`, `https://open.example.com/apply` 형태여야 합니다. 근거: `apps/works/src/features/program/publicLinkHooks.ts` 34~41행, `apps/works/src/features/program/recruitment/recruitmentHooks.ts` 240~247행.
* 폴백은 `??`(nullish)이므로 **변수가 아예 없을 때만** 현재 오리진 + `/p`·`/apply`로 떨어집니다. 빈 문자열을 넣으면 폴백이 아니라 접두사 없는 상대 주소가 만들어집니다 — 비워 둘 것이면 값을 아예 정의하지 않습니다.
* 값을 바꿔도 이미 배포된 주소는 토큰이 같으므로, **DNS·배포 별칭·`ALLOWED_ORIGINS`가 계속 그 도메인을 받도록 유지되는 동안에만** 두 도메인이 함께 살아 있습니다. 설정 중 하나라도 걷히면 옛 주소는 끊깁니다. 근거: [3_4_15 §5.3.1](./docs_planning/3_4_15_ac_public_links.md).

---

## 3. 작업 전 점검

```bash
git status --short
git branch --show-current
git log -5 --oneline
```

* 기존 수정과 미추적 파일은 사용자 작업으로 간주하고 임의로 되돌리지 않습니다.
* 덤프·내보내기·백업 자료는 민감정보와 라이선스를 확인하기 전 커밋하지 않습니다(`hiworks_backup/`은 `.gitignore`와 ESLint ignores 양쪽에서 제외되어 있습니다).
* DB 변경은 `supabase/migrations/`에 **새 순차 파일**로만 수행합니다. 기존 파일은 고치지 않습니다.
* 검토 요청에서는 파일을 수정하지 않습니다. 구현 요청과 검토 요청을 분리합니다.
* 커밋·푸시·배포는 사용자가 요청할 때만 수행합니다.

---

## 4. 변경 검증

### 4.1 기본 게이트

```bash
pnpm lint              # eslint . (docs/**, hiworks_backup/** 제외 / supabase/functions는 전용 규칙)
pnpm typecheck         # turbo: 각 앱 tsc --noEmit
pnpm typecheck:functions # Edge Function 트리(tsconfig.functions.json)
pnpm test              # turbo: WORKS + GUEST
pnpm test:db           # 격리 스택에서 마이그레이션 재생 + pgTAP (§4.3, Docker 필요)
pnpm build             # tsc --noEmit && vite build
```

Windows PowerShell 실행 정책으로 `pnpm.ps1`이 막히면 `pnpm.cmd`를 씁니다. CI(`.github/workflows/ci.yml`)는 위 중 `test:db`를 제외한 전부와 **재사용 DB 회귀 잡**을 돌립니다.

**게이트의 사각지대를 알고 쓰십시오.**

* WORKS의 Vitest는 `supabase/functions/**/*.test.ts`와 `scripts/**/*.test.mjs`도 함께 돕니다(`apps/works/vitest.config.ts`). 여기서 도는 것은 **순수 판정과 핸들러 경계**(DB 클라이언트만 대역)이며, **Deno 런타임·PostgREST/RLS·브라우저 경로는 검증되지 않습니다.**
* GUEST의 Vitest는 `src/**/*.test.ts`만 담습니다(`apps/guest/vitest.config.ts`). 현재 담긴 것은 인증 서비스·세션 저장·비밀번호 규칙과 `richText` 정화기 회귀입니다 — 정화기 테스트([apps/guest/src/lib/richText.test.ts](../apps/guest/src/lib/richText.test.ts))는 **그 파일만** `jsdom` 환경 지시로 실제 DOM에 올려 돌리며(러너 기본값은 `node`), 결과는 [CURRENT_STATUS.md](./CURRENT_STATUS.md) §3이 가집니다. **jsdom은 브라우저가 아니므로 실제 브라우저 동작은 여전히 미검증입니다**(`E2E-1`).
* ESLint는 `supabase/functions/**`에 **전용 규칙 블록**을 걸어 검사합니다(SPA 규칙을 그대로 적용하지 않습니다). 타입은 `pnpm typecheck:functions`가 봅니다.
* `supabase/tests/*.sql`은 루트 `pnpm test`에는 없습니다 — `pnpm test:db`로 돌리며, CI에서는 `DB 회귀` 잡이 같은 러너를 부릅니다. 베이스라인 명령(`pnpm db:baseline:*`)은 이 파일들을 돌리지 않습니다 — 역할이 다릅니다([12_database_baseline_operations.md](./docs_dev/12_database_baseline_operations.md)).

### 4.2 변경 유형별 추가 검증

| 변경 | 필수 추가 검증 |
| :--- | :--- |
| 인증·권한 | 역할별 허용·차단, 토큰 만료·갱신, 다른 워크스페이스 접근 차단 |
| DB·RLS | 마이그레이션 보안 게이트, 로컬 `db reset`, `pnpm test:db`(§4.3), 운영 반영 전 diff |
| Edge Function | 정상·인증 실패·권한 실패·공급자 실패·CORS 사례 |
| 첨부파일 | 업로드, 다운로드, 삭제, 만료 링크, 권한 없는 사용자 차단 |
| 공통 UI | WORKS/GUEST 영향 범위, 키보드 접근, 작은 화면, 빌드 |
| 배포 | 기본 진입, 딥링크, 로그인, 정적 자산 캐시, 롤백 확인 |

테스트 통과와 운영 가능은 같은 뜻이 아닙니다. 외부 공급자, 운영 DB, IAM, DNS, 백업 복구는 별도로 확인합니다.

### 4.3 DB 회귀 실행 — `pnpm test:db`

```bash
pnpm test:db                                # supabase/tests/*.sql 전부
pnpm test:db rls_regression_test.sql        # 파일 이름으로 일부만
```

* **전제**: Docker 데스크톱이 **실행 중**이어야 하고, Supabase CLI는 저장소에 설치된 것(`node_modules/supabase`, `pnpm-lock.yaml`이 고정한 버전)을 씁니다. 로컬에 별도 설치는 필요하지 않습니다.
* **격리**: 매 실행마다 OS 임시 디렉터리에 새 작업 디렉터리를 만들어 `supabase start`가 **빈 볼륨에 마이그레이션 전체를 재생**합니다. 저장소의 `supabase/config.toml`을 복사해 쓰고, 사본에서 바꾸는 것은 **① `project_id`(실행마다 고유) ② 포트 대역(543xx → 547xx) ③ 시드 비활성** 셋뿐입니다 — 권한·노출 설정은 그대로 두므로 **설정을 고쳐 통과시키는 일이 없습니다.**
* **안전**: 러너는 `--workdir/--local`만 쓰고 `--linked`·원격 `--db-url`·`db push`·`migration repair`를 **거부**하므로 운영·원격 프로젝트에 닿지 않습니다. 포트 대역이 달라 `pnpm db:start`로 띄운 개발 스택도 건드리지 않습니다(같은 러너를 동시에 두 번 돌리는 것은 전제하지 않습니다). 출력에서 키·토큰류는 가려집니다.
* **끝난 뒤**: 정상 종료든 오류 종료든 **자기 `project_id`의 스택만** 내립니다(다른 스택은 건드리지 않습니다). **작업 디렉터리는 조사용으로 남겨 두고 경로를 출력합니다** — 지우지 않으므로 필요 없으면 직접 삭제합니다. 강제 종료(Ctrl+C·프로세스 강제 중단)에는 정리 보장이 없으므로, 그 경우 남은 스택을 `supabase stop --workdir <경로> --project-id <id>`로 직접 내립니다.
* **실패 처리**: 건너뛰기나 `continue-on-error` 경로가 없습니다 — 재생이 깨지거나 pgTAP 단언이 실패하면 그대로 실패로 끝납니다. **테스트 쪽 기대를 낮춰 통과시키지 않습니다**(거부 단언을 약화시키는 수정은 금지).
* **최근 결과(2026-09-12)**: 마이그레이션 전수 재생과 `supabase/tests/` **전 파일·전 단언 통과**(exit 0). 건수는 [CURRENT_STATUS.md](./CURRENT_STATUS.md) §3이 소유합니다. 이 통과는 **격리된 신규 DB 기준**이며 운영 DB 반영의 증거가 아닙니다.
* 실행 결과는 실행일·대상·통과/실패 건수와 함께 남깁니다(`TEST-1`의 완료 기준).

---

## 5. 데이터베이스 변경

1. [마이그레이션 보안 게이트](./docs_dev/11_migration_security_gate.md)를 먼저 읽고, 그 답변을 마이그레이션 머리 주석에 남깁니다.
2. 기존 파일을 수정하지 않고 `pnpm db:migration <name>`으로 새 파일을 만듭니다.
3. 테이블·뷰·함수·Storage 정책의 권한과 RLS 기본 거부를 검토합니다.
4. `pnpm db:reset`으로 로컬 전체 재구성 후 `pnpm test:db`로 마이그레이션 재생과 회귀 SQL을 함께 확인합니다(§4.3).
5. 스테이징에서 실제 역할별 접근을 확인합니다.
6. 운영 project ref와 백업 시점을 확인하고 **사용자 승인 후** 반영합니다.
7. 적용 결과와 롤백·보정 방법을 기록합니다.

```bash
pnpm db:migration <name>
pnpm db:reset
pnpm test:db              # 격리 스택 재생 + pgTAP (§4.3)
pnpm db:baseline:check    # cutoff 이하 이력 불변성
pnpm db:baseline:verify   # 새 스택에서 cutoff까지 재생해 스냅샷과 바이트 비교
```

> [!NOTE]
> `db:baseline:check`·`verify`는 `supabase/baseline/`의 `current_schema.sql`·`manifest.json` 한 쌍을 비교 대상으로 삼습니다. **산출물은 현재 존재하며 두 명령이 실제 판정을 냅니다.** 절차와 한계는 [12_database_baseline_operations.md](./docs_dev/12_database_baseline_operations.md)가, cutoff·해시 같은 값은 `supabase/baseline/manifest.json`이 답합니다 — 여기에 값을 옮겨 적지 않습니다. 생성·검증은 **격리된 로컬 스택에서만** 하며 원격 DB에 닿지 않습니다.

---

## 6. 배포

`.github/workflows/deploy.yml`이 WORKS/GUEST를 빌드해 각각 S3에 동기화하고 CloudFront 캐시를 무효화합니다. 해시가 붙은 자산은 1년 immutable, `index.html`은 `no-cache`로 올립니다.

**트리거는 CI 완료(`workflow_run`)와 수동 실행 둘뿐입니다** — `main` 푸시에 직접 붙은 트리거는 없습니다.

| 종류 | 이름 |
| :--- | :--- |
| Repository Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Secrets | `AWS_ROLE_ARN`, `AWS_REGION`, `S3_BUCKET_WORKS`, `S3_BUCKET_GUEST`, `CF_DISTRIBUTION_WORKS`, `CF_DISTRIBUTION_GUEST` |

### 6.1 배포 게이트 (2026-09-12 반영, 실행 이력 미확인)

흐름은 한 방향입니다 — **`main` 푸시 → CI 전체 → (성공이면) Deploy**.

1. `main` 푸시로 CI가 돕니다: lint → typecheck → `typecheck:functions` → build → test, 그리고 `DB 회귀` 잡(마이그레이션 재생 + pgTAP).
2. CI가 끝나면 Deploy가 `workflow_run`으로 깨어나 **`gate` 잡**이 먼저 돕니다. 게이트는 배포 대상 SHA를 확정하고 **그 SHA의 CI 결과**를 Actions API로 직접 확인합니다.
3. `success`가 아닌 모든 상태(기록 없음·진행 중·실패·취소·건너뜀)와 **조회 자체의 실패**는 배포를 막습니다(fail-closed). 따라서 위 어느 단계가 실패해도 — DB 회귀 잡 하나만 실패해도 — 배포는 시작되지 않습니다.
4. PR의 CI는 승인 근거가 아니고(`push`만 인정), 포크 저장소의 실행도 거절합니다. 게이트가 승인한 SHA가 이미 `main` 최신이 아니면 거절합니다.
5. `environment: production` 보호는 그대로이며, OIDC 권한은 배포 잡에만 있습니다. 수동 실행(`workflow_dispatch`)도 같은 게이트를 지납니다.

> [!IMPORTANT]
> 위 거동은 **워크플로 파일을 읽어 정리한 것이고, GitHub에서 실제로 실행해 확인하지 않았습니다.** 배포 대상 Environment에 리뷰어 승인이 걸려 있는지도 저장소에서는 확인할 수 없습니다. 첫 실제 실행 때 ① 실패 커밋에서 배포 잡이 시작되지 않는지, ② 성공 커밋에서 정상 배포되는지를 실행 이력으로 확인하고 그 결과를 여기 남깁니다(`OPS-1` 잔여).

### 6.2 배포 전후에 사람이 하는 것

1. DB 변경 시 스테이징 마이그레이션과 회귀 SQL 통과 확인(§4.3)
2. 사용자 또는 지정 리뷰어 승인
3. WORKS/GUEST smoke test
4. 배포 커밋·수행자·시간·결과 기록

### 6.3 롤백

* **프런트엔드**: 직전 정상 커밋을 다시 빌드·배포하고 CloudFront를 무효화합니다.
* **DB**: 적용된 마이그레이션 파일을 삭제하거나 되돌리지 않습니다. 데이터 보존형 보정 마이그레이션 또는 검증된 백업 복구를 씁니다.
* **외부 발송**: 공급자 장애 시 발송을 격리하고 실패 로그를 보존합니다. 인증 우회 경로를 임의로 열지 않습니다.

---

## 7. 장애 대응

1. **기록**: 발생 시각, 사용자 역할, URL, 요청 ID, 배포 커밋, 증상.
2. **영향 범위**: WORKS/GUEST, 특정 워크스페이스, DB, Storage, Edge Function, 외부 공급자 중 어디인가.
3. **확산 차단**: 배포 중단, 기능 비활성, 발송 중단 등 되돌릴 수 있는 조치를 먼저.
4. **복구**: 최근 변경과 로그를 근거로 프런트 롤백, 보정 마이그레이션, 백업 복구 중 선택.
5. **검증**: 정상 사용자와 **권한 없는 사용자**를 함께 점검합니다.
6. **회고**: 원인, 탐지 지연, 재발 방지 작업, 담당자와 기한.

개인정보·민감 금융정보 노출이 의심되면 일반 장애보다 우선해 접근을 차단하고 원본 로그와 감사 기록을 보존합니다.

---

## 8. 백업과 복구

목표는 RPO 24시간, RTO 4시간이며 절차는 [복구 리허설 런북](../infra/runbooks/restore-drill.md)을 따릅니다.

* 분기 1회 스테이징에서 DB 복원, 스키마 diff, S3 객체 복원, SPA 재배포, RLS 검증을 수행합니다.
* 런북의 예시 행은 수행 증거가 아닙니다. 실제 수행일, 측정 RPO/RTO, 담당자, 개선 액션을 남깁니다.
* 복구 테스트에서 운영 원본을 덮어쓰지 않습니다.
* **현재 실제 리허설 수행 기록은 확인되지 않습니다.**

---

## 9. 에이전트에게 작업을 넘길 때

작업 지시의 기본 규약(문서 소유, 파일 크기, 워크스페이스 구조)은 [docs_master/CLAUDE.md](./docs_master/CLAUDE.md)가, 무엇을 할지는 [MASTER_PLAN.md](./MASTER_PLAN.md)의 과제 ID가 소유합니다. 여기서는 위임할 때 빠지기 쉬운 세 가지만 둡니다.

* **범위**: 검토만인지 구현까지인지, 수정 가능한 파일이 무엇인지 지시에 명시합니다. 커밋·푸시·배포는 사용자가 명시적으로 요청했을 때만 수행합니다(§3).
* **근거**: 보고에는 확인한 사실과 근거 파일을 붙이고, 추측과 확인된 사실을 구분하게 합니다.
* **검증**: 실행할 명령과 기대 결과를 함께 정하고, 실행하지 않은 항목(DB·RLS·E2E·운영)은 `미실행`으로 남기게 합니다.

---

## 10. 채워야 할 운영 정보

아래는 확인되는 즉시 접근 통제된 운영대장에 기록합니다(저장소에 비밀값을 적지 않습니다).

* WORKS·GUEST 운영·스테이징 URL
* 서비스·DB·AWS·보안 담당자와 비상 연락 경로
* Supabase organization/project ref와 리전
* AWS 계정, S3 버킷, CloudFront 배포의 소유 관계
* 마지막 운영 배포와 마지막 정상 커밋
* 마지막 백업 성공, 복구 리허설 결과, 베이스라인 생성 시점
* 모니터링 대시보드와 경보 수신 채널
