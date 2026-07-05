# @ynarcher/works

내부 임직원용 **WORKS 앱**입니다. HUB / NETWORKS / AC / FUND / M&A / ADMIN / PROJECT / MANAGEMENT 8대 메뉴를 제공합니다.

* **실행 모델**: React/TS Vite SPA (S3 + CloudFront 정적 호스팅) + Supabase Edge Functions/RPC
* **의존성 방향**: `apps/works → packages/ui`, `packages/master-data` (역방향 금지)

## 로컬 실행

```bash
pnpm --filter @ynarcher/works dev       # 개발 서버 (http://localhost:5173)
pnpm --filter @ynarcher/works build     # 프로덕션 빌드 (dist/)
```

> [!NOTE]
> Vite + React + TypeScript 초기화와 `@/*` 경로 별칭이 구성되었습니다. Tailwind CSS 토큰 이관과 ESLint 의존성 경계 규칙은 `PROGRESS.md` Phase 1의 후속 항목에서 진행합니다.
