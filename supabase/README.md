# Supabase — 로컬 개발 환경

와이앤아처 통합 Works 플랫폼의 백엔드(PostgreSQL + RLS + Edge Functions)를 위한 Supabase 로컬 개발 구성입니다.

## 디렉터리 구조

| 경로 | 역할 |
| :--- | :--- |
| `config.toml` | 로컬 스택(API/DB/Studio/Auth/Storage) 구성. `project_id = "ynarcher_works"` |
| `migrations/` | 순차 번호(`YYYYMMDDHHMMSS_*.sql`) 마이그레이션. **모든 스키마 변경은 이 폴더로만** |
| `functions/` | Edge Functions(Deno). 게스트 OTP/매직링크 서명, S3 Presigned URL 발급 등 |

## 로컬 실행 (루트에서)

```bash
pnpm db:start        # 로컬 Supabase 스택 기동 (Docker 필요)
pnpm db:status       # 접속 정보(API URL / anon key / DB URL) 확인
pnpm db:migration <name>   # 새 마이그레이션 파일 생성
pnpm db:reset        # 마이그레이션 전체 재적용 + 시드 반영
pnpm db:stop         # 스택 종료
pnpm functions:serve # Edge Functions 로컬 서빙
```

> [!IMPORTANT]
> `pnpm db:start`는 로컬에 **Docker**가 필요합니다. CI/무인 환경에서는 마이그레이션 SQL 작성까지만 수행하고, 실제 기동/검증은 Docker가 있는 환경에서 진행합니다.

## 클라우드 프로젝트 연결 — TODO (계정 필요)

아래는 회원님의 Supabase 계정 자격증명이 필요하여 **미완료(TODO)** 상태입니다.

- [ ] Supabase 클라우드 프로젝트 생성 (Organization / Region 선택)
- [ ] `supabase login` 후 `supabase link --project-ref <ref>`로 로컬↔클라우드 연결
- [ ] `supabase db push`로 마이그레이션 원격 반영
- [ ] `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 등 시크릿을 배포 환경 변수로 주입
      (Secret은 `VITE_` 접두사 금지 — docs_dev/4_security_privacy_policy.md)

연결이 완료되면 본 문서의 TODO 체크박스를 갱신합니다.
