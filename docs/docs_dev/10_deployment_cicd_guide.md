# [10] 배포 및 CI/CD 가이드

본 문서는 와이앤아처 통합 Works 플랫폼의 정적 호스팅 배포(S3/CloudFront)와 지속적 통합/배포(CI/CD) 파이프라인 구성을 정의합니다. 실행 모델은 [1_development_stack.md](./1_development_stack.md)의 **Vite SPA + Supabase Edge Functions/RPC** 결정을 따르며, 서버 런타임은 존재하지 않습니다.

---

## 1. 배포 아키텍처 개요

* **정적 호스팅**: WORKS(내부 앱)와 GUEST(외부 서브도메인 앱)를 각각 별도 S3 버킷에 업로드하고, 각각 별도의 CloudFront 배포로 서빙합니다.
* **오리진 접근**: S3는 퍼블릭 접근을 차단(Block Public Access)하고 CloudFront **OAC(Origin Access Control)** 로만 읽기를 허용합니다. 정책 원본은 [`infra/s3-bucket-policy.json`](../../infra/s3-bucket-policy.json)입니다.
* **백엔드**: 데이터/인증은 Supabase(PostgreSQL/RLS/Edge Functions)가 담당하며, 프론트엔드는 `VITE_` 공개 변수로만 접속 정보를 주입받습니다.

---

## 2. SPA 라우팅 폴백 (딥링크 대응)

두 앱 모두 `BrowserRouter`를 사용하므로, `/mna/:id` 같은 딥링크 요청 시 S3에 해당 오브젝트가 없어 403/404가 발생합니다. CloudFront **커스텀 오류 응답**으로 이를 `index.html`(200)로 재작성하여 클라이언트 라우터가 경로를 처리하도록 합니다.

* 설정 원본: [`infra/cloudfront/error-responses.json`](../../infra/cloudfront/error-responses.json) (403·404 → `/index.html`, 200)
* `index.html`은 `no-cache`, 나머지 정적 자산(해시 파일명)은 `max-age=31536000, immutable`로 캐싱합니다.

---

## 3. CI 파이프라인 (`.github/workflows/ci.yml`)

`main` 푸시 및 PR에서 다음을 자동 검증합니다.

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint + 의존성 경계 규칙)
3. `pnpm typecheck` (Turborepo 전 패키지 `tsc --noEmit`)
4. `pnpm build`
5. `pnpm test`

> Node 22 / pnpm 10.33.0 고정. 동일 ref 동시 실행은 `concurrency`로 취소합니다.

---

## 4. 배포 파이프라인 (`.github/workflows/deploy.yml`)

`main` 반영(또는 수동 `workflow_dispatch`) 시 빌드 → S3 업로드 → CloudFront 무효화를 수행합니다.

* **자격 증명**: GitHub OIDC로 AWS 역할을 assume(`AWS_ROLE_ARN`). 장기 액세스 키를 저장하지 않습니다.
* **업로드**: `aws s3 sync ... --delete`로 정적 자산 동기화 후 `index.html`만 `no-cache`로 개별 업로드.
* **무효화**: WORKS/GUEST 각 배포에 `create-invalidation --paths "/*"`.

### 4.1 필요한 시크릿 / 변수

| 종류 | 키 | 설명 |
| :--- | :--- | :--- |
| Secret | `AWS_ROLE_ARN` | OIDC 배포 역할 ARN |
| Secret | `AWS_REGION` | 예: `ap-northeast-2` |
| Secret | `S3_BUCKET_WORKS` / `S3_BUCKET_GUEST` | 정적 호스팅 버킷명 |
| Secret | `CF_DISTRIBUTION_WORKS` / `CF_DISTRIBUTION_GUEST` | CloudFront 배포 ID |
| Variable | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | 빌드 주입 공개 변수 |

> [!NOTE]
> Secret은 `VITE_` 접두사를 사용하지 않습니다(공개 번들 유출 방지). 서버 Secret은 Supabase 대시보드에서 Edge Function 환경변수로만 주입합니다.

---

## 5. 데이터베이스 마이그레이션 배포

* 스키마 SSOT는 `supabase/migrations/`입니다. 운영 반영은 `supabase db push`(승인된 담당자 수동 또는 별도 승인형 워크플로)로 수행합니다.
* Edge Function 배포는 `supabase functions deploy <name>`으로 수행하며, 알림 프로바이더 키 등 Secret은 `supabase secrets set`으로 주입합니다.

---

## 6. 롤백 절차

1. **프론트엔드**: 직전 정상 커밋에서 `Deploy` 워크플로를 `workflow_dispatch`로 재실행(재빌드·재업로드)하고 CloudFront를 무효화합니다.
2. **DB**: 파괴적 변경은 지양(물리 삭제 금지 원칙). 필요한 경우 [복구 런북](../../infra/runbooks/restore-drill.md)에 따라 시점 복구합니다.

---

## 7. 알림 채널 연동

* 발송은 `notifications-dispatch` Edge Function 및 `_shared/notifications.ts` 디스패처가 담당하며, 템플릿(코드→본문)은 코드 레지스트리로 관리합니다.
* 프로바이더 키(`KAKAO_ALIMTALK_KEY`/`SMS_API_KEY`/`EMAIL_API_KEY`) 미설정 시 로그 폴백으로 동작하여, 프로바이더 계약 확정 후 키 주입만으로 실발송이 활성화됩니다.
* 발송 증적은 `notification_logs` 테이블에 적재하며 개인정보(수신자)는 목록 노출 시 마스킹합니다.

---

## 8. 관측성(후속)

모니터링/알림/APM 인프라 설계는 백로그 항목으로, 배포 성숙 후 별도 문서로 확장합니다.
