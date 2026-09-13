# Supabase — 백엔드 구성과 로컬 개발

와이앤아처 통합 Works 플랫폼의 백엔드(PostgreSQL + RLS + Edge Functions) 구성입니다. 스키마의 **물리적 정본은 `migrations/`의 순차 SQL**이며, 구조 해설은 [9_database_physical_schema.md](../docs/docs_dev/9_database_physical_schema.md)가 소유합니다.

> 기준일 2026-09-12 · 기준 `main` / `846dfb83` **+ 현재 작업 트리(미커밋)** · 저장소 소스를 읽고 격리 로컬 스택에서 재생해 정리했습니다(**운영 DB를 조회한 내용이 아닙니다**).

## 디렉터리

| 경로 | 역할 | 현황(작업 트리) |
| :--- | :--- | :--- |
| `config.toml` | 로컬 스택(API/DB/Studio/Auth/Storage) 구성 | `project_id = "ynarcher_works"` |
| `migrations/` | `YYYYMMDDHHMMSS_*.sql` 순차 마이그레이션. **모든 스키마 변경은 여기로만** | 건수는 [CURRENT_STATUS.md](../docs/CURRENT_STATUS.md) §3 |
| `functions/` | Edge Functions(Deno) | 배포 단위 **22종** = `index.ts`를 가진 디렉터리. `_shared/`는 배포 단위가 아닌 공용 모듈이라 디렉터리 수로는 23입니다 |
| `tests/` | 역할별 접근을 확인하는 회귀 SQL | `pnpm test:db`로 실행 — 파일·단언 수와 결과는 [CURRENT_STATUS.md](../docs/CURRENT_STATUS.md) §3 |
| `baseline/` | cutoff 시점 스키마 스냅샷과 manifest | 산출물 한 쌍 존재 — 값·절차·한계는 [12_database_baseline_operations.md](../docs/docs_dev/12_database_baseline_operations.md) |

> [!WARNING]
> 마이그레이션 파일이 저장소에 있다는 것은 **운영 DB에 적용되었다는 증거가 아닙니다.** 어떤 환경에 어디까지 적용되었는지는 저장소로 확인할 수 없으므로, 운영 작업 전에 대상 project ref와 적용 상태를 직접 확인합니다.

## 로컬 실행 (저장소 루트에서)

```bash
pnpm db:start        # 로컬 Supabase 스택 기동 (Docker 필요)
pnpm db:status       # 접속 정보(API URL / anon key / DB URL)
pnpm db:migration <name>   # 새 마이그레이션 파일 생성
pnpm db:reset        # 마이그레이션 전체 재적용 + 시드
pnpm db:stop
pnpm functions:serve --env-file supabase/functions/.env.local
```

시크릿은 `functions/.env.example`을 기준으로 `.env.local`에 작성하며 커밋하지 않습니다. `GUEST_JWT_SECRET`은 **현재 구현이 그 위에 서 있기 때문에** 프로젝트의 레거시 JWT 시크릿과 같은 값이어야 하며, 그래야 우리가 발급한 게스트 토큰을 PostgREST/RLS가 신뢰합니다. 이는 일반적으로 권장되는 설계가 아니라 지금 동작하는 방식의 제약이므로, 인증 구조를 바꿀 때 함께 재검토할 대상입니다. `VITE_` 접두사는 서버 시크릿에 절대 붙이지 않습니다([4_security_privacy_policy.md](../docs/docs_dev/4_security_privacy_policy.md)).

## 마이그레이션 작성 규칙

1. 기존 파일을 수정하지 않고 새 파일을 만듭니다.
2. 머리 주석에 [마이그레이션 보안 게이트](../docs/docs_dev/11_migration_security_gate.md) 답변(소유 워크스페이스, 데이터 등급, 접근 주체, scope, 감사 로그, SECURITY DEFINER 신설 여부, 운영 영향)을 남깁니다.
3. 새 표에는 RLS를 켜고 기본 거부를 전제로 화이트리스트 정책만 답니다.
4. **표를 지우는 마이그레이션은 함수 본문 전수 조사까지가 한 벌입니다.** `drop table`은 뷰·제약·정책만 따라가고 함수 본문(문자열)은 의존성으로 추적하지 않아, 남겨 두면 호출 순간에만 42P01로 죽고 PostgREST가 404로 내보냅니다.
5. 권한 키·원장 키를 바꿀 때는 정책 표현식의 **텍스트 상수**까지 함께 봅니다. 권한 헬퍼는 없는 키를 물으면 오류가 아니라 `false`를 돌려주므로, 빠뜨리면 화면이 에러 없이 통째로 비고 원인이 어디에도 드러나지 않습니다.
6. **새 표에는 테이블 권한(GRANT)을 직접 적습니다.** `config.toml`에 `auto_expose_new_tables`가 없어 새 DB에는 행 단위 권한이 자동으로 붙지 않습니다 — 정책만 쓰면 깨끗한 재생에서 RLS 이전에 42501로 막힙니다. 권한은 "그 연산을 시도할 수 있는가", RLS는 "어떤 행에 손댈 수 있는가"이며 **정책이 뒷받침하는 연산만** 부여합니다(선례: `20260912025406_authenticated_data_api_grants.sql`).
7. 기본값은 물리 삭제가 아니라 `deleted_at` 소프트 삭제입니다. 다만 **운영 모듈 인스턴스 정리·원장 대량 정리처럼 문서화된 예외**가 있고, 그 경로는 자체 인가를 수행하는 `SECURITY DEFINER` RPC로 제공됩니다(정책으로 열지 않습니다). 새 물리 삭제 경로가 필요하면 예외로 설계하고 인가 검사를 함께 검토합니다. 감사·업무 기록 행은 사후에 고치지 않습니다(그때의 사실이므로).

## 회귀 테스트 (`tests/`)

`rls_regression_test.sql` 외에 `kpi_snapshot_test`, `approval_decision_recall_test`, `startup_guest_startup_identity_test`, `admin_inactive_ledger_restore_test`, `ledger_bulk_hard_delete_test`, `workspace_creator_deactivation_test`, `employee_birth_date_privacy_test`, `meeting_recording_security_test`, `meeting_recording_behavior_test`, `data_api_grants_test`가 있습니다.

```bash
pnpm test:db                                # 전부
pnpm test:db rls_regression_test.sql        # 일부
```

러너([scripts/db-test/run-db-tests.mjs](../scripts/db-test/run-db-tests.mjs))는 매 실행마다 임시 디렉터리·고유 project id·격리 포트로 스택을 세워 **이 저장소의 `config.toml` 그대로** 마이그레이션을 전수 재생한 뒤 pgTAP을 돌립니다. 끝나면 **자기 스택만 내리고 작업 디렉터리는 남겨 둡니다**(경로를 출력합니다 — 조사 뒤 직접 지웁니다). 원격 인자(`--linked`·원격 `--db-url`·`db push`)는 거부하므로 운영에 닿지 않습니다. Docker가 실행 중이어야 합니다. CI에서는 `DB 회귀` 잡(`.github/workflows/db-tests.yml`)이 같은 러너를 부르며, **그 잡이 실패하면 배포 게이트도 막힙니다.**

> [!NOTE]
> **최근 실행에서 전 파일·전 단언이 통과했습니다**(건수는 [CURRENT_STATUS.md](../docs/CURRENT_STATUS.md) §3). 다만 그 통과는 **격리된 신규 DB 기준**이며 운영 DB에 적용되었다는 증거가 아닙니다. 절차와 전제는 [OPERATIONS.md](../docs/OPERATIONS.md) §4.3.

## Edge Functions (`functions/`)

| 묶음 | 함수 |
| :--- | :--- |
| 게스트 인증 | `guest-auth-login`, `guest-auth-password`, `guest-auth-context`, `guest-auth-refresh`, `guest-password-reset`, `guest-access-invite` |
| 공개 링크 | `public-module-get`, `public-module-file`, `application-form-get`, `application-submit` |
| 파일·추출 | `material-download`, `startup-material-extract`, `ma-seller-material-extract`, `link-metadata` |
| AI | `startup-ai-fill`, `ai-minute-draft`, `stt-transcribe`, `ma-seller-quick-review` |
| 회의 녹취 | `meeting-recording-process`, `meeting-recording-playback` |
| 기타 | `employee-create`, `notifications-dispatch` |

* CORS는 `_shared/cors.ts`가 공통 처리합니다. `ALLOWED_ORIGINS`가 **설정되지 않은 경우** 모든 origin을 허용합니다(유예 모드). 운영 프로젝트에 이 값이 실제로 설정되어 있는지는 저장소로 확인할 수 없으므로 대상 프로젝트의 시크릿을 직접 확인합니다.
* `_shared/notifications.ts`의 채널 어댑터(알림톡·SMS·이메일)는 아직 없어 **어떤 경로로도 실제 발송이 일어나지 않습니다.** 2026-09-12부터 그 사실을 정직하게 보고합니다.
  * 프로바이더 키가 **없으면**: 로컬 스택(`http://` SUPABASE_URL)에서만 콘솔 폴백을 성공(`provider: 'log'`)으로 처리하고, 그 외 환경에서는 `{ ok: false, provider: 'none' }`입니다.
  * 프로바이더 키가 **있으면**: 어댑터가 없으므로 `{ ok: false, provider: '<채널>:unimplemented' }`이고, 실패 로그에 수신처·본문을 남기지 않습니다. **키가 설정되어 있다는 사실은 실발송의 근거가 아닙니다**([SECURITY_REVIEW.md](../docs/SECURITY_REVIEW.md) `F-2`, 잔여 과제 `SEC-2`).
* ESLint는 `functions/**`에 전용 규칙 블록을 걸어 검사하고, 타입은 `pnpm typecheck:functions`가 봅니다(둘 다 CI에 있습니다).
* **순수 판정과 핸들러 경계**의 단위 테스트는 WORKS의 Vitest가 함께 돕니다(`apps/works/vitest.config.ts`). 게스트 로그인·비밀번호 함수는 판정 본체를 `handler.ts`로 분리해 DB 클라이언트만 대역으로 두고 검증합니다 — **Deno 런타임과 PostgREST/RLS 경로는 검증 대상이 아닙니다.**

## 베이스라인 (`baseline/`)

cutoff까지의 스키마 스냅샷(`current_schema.sql`)과 manifest(`manifest.json`)를 **한 쌍으로** 보관합니다. 현재 산출물이 있으며, **cutoff·해시·생성 환경 같은 값은 `manifest.json`**이, **생성·검증 절차와 한계는 [12_database_baseline_operations.md](../docs/docs_dev/12_database_baseline_operations.md)**가, **실행 결과는 [CURRENT_STATUS.md](../docs/CURRENT_STATUS.md) §3**이 가집니다 — 여기에 값을 복사해 두지 않습니다.

생성·검증은 **격리된 로컬 스택에서만** 이뤄지며 원격 DB에 닿지 않습니다. 원격 환경변수(`BASELINE_DB_URL`·`BASELINE_PROJECT_REF`·`BASELINE_DB_CONFIRM`)는 **대체 입력이 아니라 차단 조건**입니다 — 하나라도 설정되어 있으면 도구가 시작하지 않습니다.

```powershell
pnpm db:baseline:refresh   # 격리 스택에서 재생하고 산출물 한 쌍을 기록
pnpm db:baseline:check     # 해시 대조(Docker 불필요)
pnpm db:baseline:verify    # 새 스택에서 cutoff까지 재생해 바이트 비교
```

산출물은 손으로 고치지 않고, 수동으로 합친 SQL을 베이스라인으로 커밋하지 않습니다. 베이스라인은 기존 운영 DB에 다시 적용하지 않으며, **스냅샷이 보증하는 것은 cutoff 시점 스키마의 재현성 하나입니다** — 신규 환경 부트스트랩·복구가 된다는 증명이 아닙니다(같은 문서 §5·§6).

## 클라우드 프로젝트 연결 — 미확인

아래는 저장소에서 상태를 확인할 수 없습니다. 실제 수행 여부는 운영대장으로 확인합니다(완료로 추정하지 않습니다).

* Supabase 클라우드 프로젝트 생성(Organization / Region)
* `supabase login` → `supabase link --project-ref <ref>`
* `supabase db push`로 마이그레이션 원격 반영, 그리고 **어느 시점까지 적용되었는지**
* `ALLOWED_ORIGINS`, `GUEST_JWT_SECRET`, S3 자격증명 등 Secrets 주입
