# CLAUDE.md — 와이앤아처 통합 Works 플랫폼 작업 규칙

## 프로젝트 개요

AC/VC 업무 통합 플랫폼(내부 WORKS 앱 8대 메뉴 + 외부 GUEST 앱). 현재 기획 문서 단계이며 전체 기획은 [docs/docs_master/readme_master.md](docs/docs_master/readme_master.md), 문서 지도는 [docs/docs_master/0_service_spec_draft.md](docs/docs_master/0_service_spec_draft.md) 참조.

## 확정된 아키텍처 결정 (변경 시 반드시 사용자 확인)

- **마스터 데이터 SSOT**: 스타트업/전문가/협력사 마스터는 **NETWORKS** 워크스페이스가 원장, 임직원 마스터는 **MANAGEMENT**, HUB는 조회 센터(랭킹/캘린더/통합검색)일 뿐 마스터를 소유하지 않음.
- **백엔드 실행 모델**: React/TS **Vite SPA** (S3+CloudFront 정적 호스팅) + **Supabase Edge Functions/RPC**. Next.js 서버 런타임 없음. "서버 액션" = Edge Function/RPC를 지칭.
- **스타일링**: **Tailwind CSS** 공식 채택. 컬러는 `4_color_system_rules.md`의 웜그레이/브랜드 팔레트가 단일 원천.
- **모노레포**: Turborepo — `apps/works`, `apps/guest`, `packages/ui`(순수 UI), `packages/master-data`.
- **AC 문서 체계**: `3_4_workspace_ac.md` + `3_4_1`~`3_4_14` 신규 14문서가 정본. 구버전(ac_startups 등 5종)은 삭제됨 — 복원하지 말 것.
- **RLS 헬퍼**: `current_app_user_id()`/`current_app_role()`이 기저 헬퍼, `is_admin()` 등 업무 헬퍼는 이를 경유.

## 진행현황 체크리스트 운영 규칙 (필수)

[PROGRESS.md](./PROGRESS.md)가 개발 진행의 단일 트래커다. **모든 작업 단위 완료 시 아래 절차를 빠짐없이 수행한다:**

1. 작업 단위 완료 및 검증 후, `PROGRESS.md`의 해당 항목을 `- [ ]` → `- [x]`로 갱신한다.
2. 작업 산출물과 체크리스트 갱신을 **하나의 커밋**으로 묶어 즉시 커밋한다.
3. 커밋 직후 `git push`를 실행한다. (원격: https://github.com/ynarcher-dev/ynarcher_works.git, 브랜치: main)
4. 체크리스트에 없는 새로운 작업이 발생하면 적절한 Phase에 항목을 추가한 뒤 진행한다.

## 커밋 컨벤션

- 형식: `<type>(<scope>): <제목>` — type: `feat`/`fix`/`docs`/`refactor`/`chore`/`test`, scope: 워크스페이스 또는 영역(예: `ac`, `hub`, `ui`, `db`, `auth`)
- 제목과 본문은 한국어로 작성한다.
- 문서 수정은 `docs(<폴더>)` 스코프를 사용한다.

## 문서 작업 톤앤매너

- 격식체("~합니다") 서술, 불릿은 `* **볼드 리드**: 설명` 패턴, 섹션 구분은 `---`, 강조는 `> [!NOTE]` 콜아웃.
- 이모지는 인덱스 성격 문서(readme_*, 0_service_spec_draft)의 헤더에만 사용하고 상세 명세서 본문에는 사용하지 않는다.
- 한글 용어 + 괄호 영문 병기(예: 캐피탈 콜(Capital Call)), 상태값은 `UPPER_SNAKE_CASE` 백틱 표기, 워크스페이스명은 대문자(`AC`, `FUND`).
- AC 신규 문서(3_4_1~3_4_14)는 15절 정형 템플릿(목적→범위→…→테스트 기준)을 유지한다.

## 개발 수칙 (docs_dev 요약)

- 파일당 500줄 상한 (컴포넌트 250 / 훅 150 / 함수 50).
- DB 변경은 마이그레이션으로만. 모든 테이블 RLS 필수, Default Deny.
- 물리 삭제 금지(soft delete), 개인정보 목록 마스킹 의무, Secret은 `VITE_` 접두사 금지.
- UI에서 숨기는 것은 보안이 아니다 — 서버(Edge Function/RPC/RLS)에서 강제한다.
