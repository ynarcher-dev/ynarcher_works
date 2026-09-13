# 와이앤아처 통합 Works 플랫폼

와이앤아처의 AC/VC 업무와 전사 운영을 하나로 연결하는 통합 플랫폼입니다. 내부 임직원용 `WORKS`와 외부 참여자용 `GUEST`를 별도 SPA로 운영하며, 공통 백엔드는 Supabase(PostgreSQL, RLS, Storage, Edge Functions/RPC)를 사용합니다.

> [!IMPORTANT]
> 이 문서는 첫 진입점입니다. 작업 전 [현재 상태](./docs/CURRENT_STATUS.md)와 [운영 가이드](./docs/OPERATIONS.md)를 확인합니다. 기준 커밋은 `main` / `846dfb83`(2026-09-12)입니다.

---

## 1. 서비스 구성

| 영역 | 역할 | 경로 |
| :--- | :--- | :--- |
| `WORKS` | 내부 임직원용 앱. OFFICE, STARTUP, NETWORKS, PROJECT(구 AC), FUND, M&A/PE, MANAGEMENT, 전자결재, ADMIN | `apps/works` |
| `GUEST` | 외부 참여자용 모바일 우선 채널. 사업 개요·공지·일정·Q&A·지원·모듈 참여 | `apps/guest` |
| 공통 UI | 디자인 토큰과 순수 UI 컴포넌트 | `packages/ui` |
| 마스터 데이터 | 데이터 연동형 공통 UI와 마스터 데이터 계층 | `packages/master-data` |
| 백엔드 | DB 마이그레이션, RLS 테스트, Edge Functions | `supabase` |
| 배포·복구 | AWS 정적 배포 자산과 복구 런북 | `infra` |

실행 모델은 React 19 + TypeScript + Vite 기반 SPA, S3 + CloudFront 정적 호스팅, Supabase 백엔드입니다. 모노레포 작업은 pnpm과 Turborepo가 담당합니다.

---

## 2. 빠른 시작

### 2.1 사전 요구사항

* **Node.js**: 22 이상 (`engines.node`)
* **pnpm**: 10.33.0 (`packageManager`)
* **Docker**: 로컬 Supabase를 실행할 때 필요

### 2.2 설치 및 환경 변수

```bash
pnpm install --frozen-lockfile
```

`apps/works/.env.example`과 `apps/guest/.env.example`을 각각 `.env.local`로 복사합니다. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`에는 공개 접속 정보만 사용하며, 서비스 역할 키나 외부 발송 API 키를 `VITE_` 변수에 넣지 않습니다.

### 2.3 로컬 백엔드 및 앱 실행

```bash
pnpm db:start
pnpm db:status
pnpm dev
```

개별 앱만 실행할 수도 있습니다.

```bash
pnpm --filter @ynarcher/works dev
pnpm --filter @ynarcher/guest dev
```

기본 개발 주소는 WORKS `http://localhost:5173`, GUEST `http://localhost:5174`입니다.

Windows PowerShell 실행 정책 때문에 `pnpm.ps1`이 차단되면 동일 명령을 `pnpm.cmd`로 실행합니다.

---

## 3. 검증 명령

```bash
pnpm lint       # 루트 ESLint (앱 개별 lint 스크립트는 아직 자리표시자)
pnpm typecheck  # 앱별 tsc --noEmit
pnpm test       # 현재 실제 테스트는 apps/works의 vitest run 하나
pnpm build      # tsc --noEmit 후 vite build
```

DB 관련 보조 명령은 `pnpm db:start|stop|status|reset|diff|migration`, 베이스라인은 `pnpm db:baseline:refresh|check|verify`, Edge Functions는 `pnpm functions:serve`와 `pnpm typecheck:functions`입니다.

> [!NOTE]
> 이 문서는 명령의 **존재**만 기술하고 통과 여부는 주장하지 않습니다. 최신 실행 결과와 알려진 실패는 [CURRENT_STATUS.md](./docs/CURRENT_STATUS.md)에서 확인합니다. `apps/guest`에는 `test` 스크립트가 없고, Supabase RLS 회귀 테스트는 별도 범위이므로 하나의 통과 결과로 묶지 않습니다.

---

## 4. 문서 지도

| 문서 | 용도 |
| :--- | :--- |
| [문서 지도](./docs/DOCUMENTATION_MAP.md) | 모든 문서의 목록·분류·신뢰 상태 |
| [현재 상태](./docs/CURRENT_STATUS.md) | 구현 범위, 운영 차단 요소, 최신 검증 결과 |
| [운영 가이드](./docs/OPERATIONS.md) | 로컬 실행, 배포, DB 변경, 장애·복구 |
| [마스터 플랜](./docs/MASTER_PLAN.md) | 향후 계획과 우선순위 후보 |
| [보안 점검](./docs/SECURITY_REVIEW.md) | 보안 점검 결과와 남은 과제 |
| [작업 규칙](./docs/docs_master/CLAUDE.md) | 확정 아키텍처와 개발 수칙 |
| [서비스 비전](./docs/docs_master/readme_master.md) | 비즈니스 배경과 워크스페이스 정의 |
| [진행 이력](./docs/docs_master/PROGRESS.md) | 과거 추적 기록 — 작업 선정용 아님 |

문서가 서로 다르면 실제 코드와 검증 결과를 먼저 확인하고, 확인한 날짜와 근거를 `CURRENT_STATUS.md`에 반영합니다.

---

## 5. 작업 진행 규칙

1. `README.md` → `docs/CURRENT_STATUS.md` → `docs/OPERATIONS.md` 순으로 읽습니다.
2. 작업 범위는 사용자가 정합니다. `PROGRESS.md`의 미체크 항목을 다음 작업으로 자동 선정하지 않습니다.
3. 사용자가 이미 범위를 승인했다면 다시 묻지 않고 수행합니다. 승인은 그 범위에만 유효하며 다음 작업으로 연장되지 않습니다.
4. 승인 범위가 불명확할 때만, 판단이 갈리는 지점을 특정해 확인합니다.
5. 구현 후 관련 검증을 수행하고 실패와 미검증 항목을 구분해 보고합니다.
6. 커밋·푸시·배포·운영 DB 변경은 해당 행위에 대한 요청이나 승인이 있을 때만 합니다.
