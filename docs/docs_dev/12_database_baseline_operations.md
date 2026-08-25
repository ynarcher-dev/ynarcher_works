# [12] 데이터베이스 베이스라인 운영 가이드

## 1. 목적과 원칙

베이스라인은 특정 마이그레이션 버전까지의 **최종 스키마 스냅샷**입니다. 기존 운영 DB의 적용 이력을 삭제하거나 다시 실행하는 장치가 아닙니다.

- 운영·스테이징 DB는 기존 적용 이력을 유지하고 신규 마이그레이션만 적용한다.
- `supabase/migrations`는 감사와 기존 환경 호환을 위해 보존하며, 적용된 파일은 수정하지 않는다.
- 신규 환경은 검증된 베이스라인과 cutoff 이후 마이그레이션으로 구축할 수 있다.
- 현재 cutoff는 `supabase/baseline/manifest.json`을 정본으로 삼는다.

## 2. 생성과 검증

운영과 완전히 분리된 **베이스라인 전용 Supabase 프로젝트**와 Supabase CLI가 필요합니다. 아래 DB는 명령 실행 때마다 초기화되므로 운영·스테이징 프로젝트를 지정하면 안 됩니다.

```powershell
$env:BASELINE_DB_URL = "postgresql://postgres.<ref>:<password>@..."
$env:BASELINE_PROJECT_REF = "<ref>"
$env:BASELINE_DB_CONFIRM = "RESET_DISPOSABLE_BASELINE_DB"
pnpm db:baseline:refresh
pnpm db:baseline:verify
```

`refresh`는 전용 DB를 초기화한 뒤 전체 마이그레이션을 `--no-seed`로 적용하고, 성공한 DB의 `public`, `app` 스키마를 덤프해 cutoff와 이력 SHA-256을 기록합니다. SQL과 manifest의 diff를 리뷰해 함께 커밋하며 산출물을 직접 편집하지 않습니다.

안전장치로 다음 세 값이 모두 필요합니다.

- `BASELINE_DB_URL`: 비밀번호를 포함한 전용 DB 연결 문자열. Git에 저장하지 않는다.
- `BASELINE_PROJECT_REF`: 전용 Supabase project ref. DB URL 호스트에 이 값이 없으면 중단한다.
- `BASELINE_DB_CONFIRM`: 정확히 `RESET_DISPOSABLE_BASELINE_DB`여야 한다.

CI에서는 세 값을 secret으로 주입하고 로그에 URL을 출력하지 않습니다. 작업 후 현재 PowerShell 세션에서 `Remove-Item Env:BASELINE_DB_URL`로 연결 문자열을 제거합니다.

## 3. 최신화 시점

매 마이그레이션마다 갱신하지 않습니다. 다음 중 하나일 때 별도 PR로 갱신합니다.

- cutoff 이후 마이그레이션이 50개 이상 누적
- 빈 DB 전체 재구축 시간이 팀의 허용 시간을 초과
- PostgreSQL 또는 Supabase 메이저 버전 업그레이드 전후
- 대규모 스키마 개편 완료 후
- 재해복구 훈련 또는 신규 프로젝트 프로비저닝 전

후속 개발자는 평소 새 마이그레이션만 추가합니다. cutoff 이하 파일 변경은 `db:baseline:check`가 해시 불일치로 감지합니다.

## 4. 신규 환경 적용

신규 환경의 기본 경로로 채택할 때는 별도 전환 PR과 빈 DB 검증을 거칩니다.

1. `current_schema.sql`을 빈 Supabase DB에 적용한다.
2. Storage bucket/policy와 필수 기준정보 bootstrap SQL을 적용한다.
3. manifest cutoff 이후 마이그레이션을 순서대로 적용한다.
4. Supabase 마이그레이션 이력을 cutoff와 일치하도록 기록한다.
5. `supabase/tests/rls_regression_test.sql`과 스키마 diff를 실행한다.

운영 DB에는 베이스라인 SQL을 적용하지 않습니다. 이미 존재하는 객체와 충돌할 수 있습니다.

## 5. 제한과 후속 분리 작업

자동 덤프는 애플리케이션 소유 스키마 `public`, `app`만 대상으로 하며 운영 데이터나 인증 사용자를 포함하지 않습니다. 다음은 별도 관리 대상입니다.

- `storage.buckets` 행과 `storage.objects` 정책
- 권한 템플릿·태그·게시판 등 필수 기준정보
- Auth 사용자와 운영 데이터
- Edge Function 환경변수와 외부 인프라

현재 초기 이력에는 DDL, 기준정보, 데모 데이터가 섞여 있습니다. 최초 베이스라인을 신규 환경 기본 경로로 전환하기 전에 필수 기준정보와 Storage 정책을 bootstrap SQL로, 데모 데이터는 개발 전용 seed로 분리해야 합니다. 그 전까지 베이스라인은 **검증·복구용 스키마 스냅샷**이며 기존 `db reset`을 대체하지 않습니다.

## 6. PR 체크리스트

- [ ] 새 timestamp 마이그레이션으로 변경했다.
- [ ] cutoff 이하 마이그레이션을 수정하지 않았다.
- [ ] `pnpm db:baseline:check`를 통과했다.
- [ ] 새 테이블/RPC/RLS가 있으면 보안 게이트와 회귀 테스트를 갱신했다.
- [ ] 갱신 조건이면 `pnpm db:baseline:refresh`와 전체 검증을 수행했다.
- [ ] manifest와 schema snapshot을 같은 커밋에 포함했다.
