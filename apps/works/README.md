# @ynarcher/works

내부 임직원용 **WORKS 앱**입니다. HUB / NETWORKS / AC / FUND / M&A / ADMIN / PROJECT / MANAGEMENT 8대 메뉴를 제공합니다.

* **실행 모델**: React/TS Vite SPA (S3 + CloudFront 정적 호스팅) + Supabase Edge Functions/RPC
* **의존성 방향**: `apps/works → packages/ui`, `packages/master-data` (역방향 금지)

> [!NOTE]
> 본 디렉터리는 모노레포 골격의 자리표시자입니다. Vite + React + TypeScript 앱 초기화는 `PROGRESS.md` Phase 1의 후속 항목에서 진행합니다.
