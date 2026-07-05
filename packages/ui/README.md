# @ynarcher/ui

**순수 UI 레이어(Pure UI Layer)** 입니다. 디자인 토큰 기반 Atom 컴포넌트(Button, Input, Layout Shell 등)만 격리합니다.

> [!IMPORTANT]
> 본 패키지 내부에서는 `@supabase/supabase-js`, `@tanstack/react-query` 등 데이터 결합 라이브러리 참조를 **금지**합니다. (ESLint `no-restricted-imports`로 강제 예정) 데이터가 엮인 Picker/Selector 등 Connected UI는 `packages/master-data` 또는 각 앱의 `components`에 배치합니다.

> [!NOTE]
> 본 디렉터리는 모노레포 골격의 자리표시자입니다. 컴포넌트 구현은 `PROGRESS.md` Phase 4에서 진행합니다.
