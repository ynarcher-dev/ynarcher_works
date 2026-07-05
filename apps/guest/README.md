# @ynarcher/guest

외부 참가자용 **GUEST 앱**입니다. 스타트업/전문가 대상이며 모바일 우선(Mobile First)으로 설계합니다.

* **실행 모델**: React/TS Vite SPA + 게스트 OTP/매직링크 커스텀 JWT 인증
* **배포**: GUEST 서브도메인 분리
* **의존성 방향**: `apps/guest → packages/ui`, `packages/master-data` (역방향 금지)

## 로컬 실행

```bash
pnpm --filter @ynarcher/guest dev       # 개발 서버 (http://localhost:5174)
pnpm --filter @ynarcher/guest build     # 프로덕션 빌드 (dist/)
```

> [!NOTE]
> Vite + React + TypeScript 초기화와 `@/*` 경로 별칭이 구성되었습니다. Tailwind CSS 토큰 이관과 ESLint 의존성 경계 규칙은 `PROGRESS.md` Phase 1의 후속 항목에서 진행합니다.
