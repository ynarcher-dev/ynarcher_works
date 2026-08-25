# Supabase — 로컬 개발 환경

와이앤아처 통합 Works 플랫폼의 백엔드(PostgreSQL + RLS + Edge Functions)를 위한 Supabase 로컬 개발 구성입니다.

## 디렉터리 구조

| 경로 | 역할 |
| :--- | :--- |
| `config.toml` | 로컬 스택(API/DB/Studio/Auth/Storage) 구성. `project_id = "ynarcher_works"` |
| `migrations/` | 순차 번호(`YYYYMMDDHHMMSS_*.sql`) 마이그레이션. **모든 스키마 변경은 이 폴더로만** |
| `baseline/` | 전체 이력으로 검증한 현재 스키마 스냅샷과 cutoff manifest |
| `functions/` | Edge Functions(Deno). 게스트 OTP/매직링크 서명, S3 Presigned URL 발급 등 |

## 로컬 실행 (루트에서)

```bash
pnpm db:start        # 로컬 Supabase 스택 기동 (Docker 필요)
pnpm db:status       # 접속 정보(API URL / anon key / DB URL) 확인
pnpm db:migration <name>   # 새 마이그레이션 파일 생성
pnpm db:reset        # 마이그레이션 전체 재적용 + 시드 반영
pnpm db:baseline:refresh       # 전용 원격 DB 재적용 후 베이스라인 갱신
pnpm db:baseline:check         # cutoff 이하 이력 불변성 확인
pnpm db:baseline:verify        # 전체 재구축 결과와 스냅샷 비교
pnpm db:stop         # 스택 종료
pnpm functions:serve # Edge Functions 로컬 서빙
```

> [!IMPORTANT]
> 일반 로컬 Supabase 실행에는 Docker가 필요합니다. 베이스라인 생성·검증은 Docker 대신 운영과 분리된 전용 Supabase 프로젝트를 사용합니다.

베이스라인은 기존 운영 DB에 다시 적용하지 않습니다. 생성 주기와 신규 환경 전환 절차는
[`12_database_baseline_operations.md`](../docs/docs_dev/12_database_baseline_operations.md)를 따릅니다.

## 클라우드 프로젝트 연결 — TODO (계정 필요)

아래는 회원님의 Supabase 계정 자격증명이 필요하여 **미완료(TODO)** 상태입니다.

- [ ] Supabase 클라우드 프로젝트 생성 (Organization / Region 선택)
- [ ] `supabase login` 후 `supabase link --project-ref <ref>`로 로컬↔클라우드 연결
- [ ] `supabase db push`로 마이그레이션 원격 반영
- [ ] `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 등 시크릿을 배포 환경 변수로 주입
      (Secret은 `VITE_` 접두사 금지 — docs_dev/4_security_privacy_policy.md)

연결이 완료되면 본 문서의 TODO 체크박스를 갱신합니다.
