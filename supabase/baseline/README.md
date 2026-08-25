# Database baseline artifacts

이 디렉터리는 전체 마이그레이션을 재생해 검증한 현재 스키마 스냅샷을 보관합니다.

- `current_schema.sql`: 전체 이력으로 재구축한 `public`, `app` 스키마
- `manifest.json`: 기준 버전, 파일 수, 과거 이력 SHA-256

산출물은 직접 편집하지 않습니다. 운영과 분리된 일회용 Supabase 프로젝트에서 생성·갱신합니다.

```powershell
$env:BASELINE_DB_URL = "postgresql://postgres.<ref>:<password>@..."
$env:BASELINE_PROJECT_REF = "<ref>"
$env:BASELINE_DB_CONFIRM = "RESET_DISPOSABLE_BASELINE_DB"
pnpm db:baseline:refresh
pnpm db:baseline:check
pnpm db:baseline:verify
```

상세 절차는 [`12_database_baseline_operations.md`](../../docs/docs_dev/12_database_baseline_operations.md)를 따릅니다.

> 산출물이 없다면 아직 베이스라인 생성 검증이 끝나지 않은 상태입니다. 수동으로 합친 SQL을 베이스라인으로 커밋하지 않습니다.
