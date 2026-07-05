# @ynarcher/guest

외부 참가자용 **GUEST 앱**입니다. 스타트업/전문가 대상이며 모바일 우선(Mobile First)으로 설계합니다.

* **실행 모델**: React/TS Vite SPA + 게스트 OTP/매직링크 커스텀 JWT 인증
* **배포**: GUEST 서브도메인 분리
* **의존성 방향**: `apps/guest → packages/ui`, `packages/master-data` (역방향 금지)

> [!NOTE]
> 본 디렉터리는 모노레포 골격의 자리표시자입니다. Vite + React + TypeScript 앱 초기화는 `PROGRESS.md` Phase 1의 후속 항목에서 진행합니다.
