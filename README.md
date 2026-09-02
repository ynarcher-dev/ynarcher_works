# 와이앤아처 통합 Works 플랫폼

와이앤아처의 AC/VC 업무와 전사 운영을 하나로 연결하는 통합 플랫폼입니다. 내부 임직원용 `WORKS`와 외부 참여자용 `GUEST`를 별도 SPA로 운영하며, 공통 백엔드는 Supabase(PostgreSQL, RLS, Storage, Edge Functions/RPC)를 사용합니다.

> [!IMPORTANT]
> 이 문서는 프로젝트의 첫 진입점입니다. 작업을 시작하기 전에 [현재 상태](./docs/CURRENT_STATUS.md)와 [운영 가이드](./docs/OPERATIONS.md)를 먼저 확인합니다. 상세 이력만 보고 다음 작업을 자동 선정하지 않습니다.

---

## 1. 서비스 구성

| 영역 | 역할 | 경로 |
| :--- | :--- | :--- |
| `WORKS` | 내부 임직원용 앱. OFFICE, STARTUP, NETWORKS, AC, FUND, M&A, PROJECT, MANAGEMENT, ADMIN 워크스페이스 | `apps/works` |
| `GUEST` | 외부 참여자용 모바일 우선 채널. 사업 접근, 지원 및 모듈 참여 | `apps/guest` |
| 공통 UI | 디자인 토큰과 순수 UI 컴포넌트 | `packages/ui` |
| 마스터 데이터 | 데이터 연동형 공통 UI와 마스터 데이터 계층 | `packages/master-data` |
| 백엔드 | DB 마이그레이션, RLS 테스트, Edge Functions | `supabase` |
| 배포·복구 | AWS 정적 배포 자산과 복구 런북 | `infra` |

실행 모델은 React 19 + TypeScript + Vite 기반 SPA, S3 + CloudFront 정적 호스팅, Supabase 백엔드입니다. 모노레포 작업은 pnpm과 Turborepo가 담당합니다.

---

## 2. 빠른 시작

### 2.1 사전 요구사항

* **Node.js**: 22 이상
* **pnpm**: 10.33.0
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
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

현재 명령의 실제 통과 여부와 알려진 실패 원인은 [CURRENT_STATUS.md](./docs/CURRENT_STATUS.md)를 기준으로 판단합니다. 로컬 단위 테스트와 Supabase RLS 회귀 테스트는 별도 범위이므로 하나의 통과 결과로 간주하지 않습니다.

---

## 4. 문서 지도

| 문서 | 용도 |
| :--- | :--- |
| [현재 상태](./docs/CURRENT_STATUS.md) | 구현 범위, 운영 차단 요소, 최신 검증 결과, 다음 우선순위 |
| [운영 가이드](./docs/OPERATIONS.md) | 로컬 실행, 배포, DB 변경, 장애·복구, 에이전트 인수인계 |
| [작업 규칙](./docs/docs_master/CLAUDE.md) | 확정 아키텍처와 개발 수칙 |
| [개발 진행 이력](./docs/docs_master/PROGRESS.md) | 완료·미완료 항목의 상세 추적 기록 |
| [서비스 비전](./docs/docs_master/readme_master.md) | 비즈니스 배경과 워크스페이스 정의 |
| [전체 문서 인덱스](./docs/docs_master/0_service_spec_draft.md) | 기획·디자인·개발 상세 문서 탐색 |

문서가 서로 다르면 실제 코드와 검증 결과를 먼저 확인하고, 확인한 날짜와 근거를 `CURRENT_STATUS.md`에 반영합니다.

---

## 5. 다음 작업의 기본 절차

1. `README.md` → `docs/CURRENT_STATUS.md` → `docs/OPERATIONS.md` 순서로 읽습니다.
2. `git status --short`로 기존 사용자 작업을 확인하고 보존합니다.
3. 관련 코드와 상세 문서를 읽은 뒤, 변경 없이 검토 결과를 먼저 제출합니다.
4. 검토 결과에는 근거 파일, 위험도, 제안 범위, 검증 방법, 롤백 방법을 포함합니다.
5. 사용자가 범위를 승인한 뒤에만 구현합니다.
6. 구현 후 관련 검증을 수행하고, 실패와 미검증 항목을 구분해 보고합니다.
7. 사용자 요청 없이 커밋, 푸시 또는 운영 배포하지 않습니다.

