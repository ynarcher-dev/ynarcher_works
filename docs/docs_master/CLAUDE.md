# CLAUDE.md — 와이앤아처 통합 Works 플랫폼 작업 규칙

> [!IMPORTANT]
> **본 문서가 모든 작업의 단일 진입점(Entry Point)입니다.** 어떤 환경(데스크톱, 모바일, 신규 세션)에서든 작업을 시작할 때 이 문서 하나만 읽으면, 아래의 "작업 시작 절차"에 따라 다음 작업을 스스로 찾아 실행하고 마무리할 수 있습니다.

## 마스터 폴더 문서 구성 (상호 참조)

| 문서 | 역할 |
| :--- | :--- |
| **[CLAUDE.md](./CLAUDE.md)** (본 문서) | 작업 규칙, 확정 아키텍처 결정, 작업 시작 절차 — **작업 시 최초 1회 필독** |
| **[PROGRESS.md](./PROGRESS.md)** | 개발 진행현황 체크리스트 — 다음 작업 선정 및 완료 체크의 단일 트래커 |
| **[readme_master.md](./readme_master.md)** | 서비스 비전 명세서 — 비즈니스 배경과 9개 내부 워크스페이스 + GUEST 구조 |
| **[0_service_spec_draft.md](./0_service_spec_draft.md)** | 전체 기획 문서(5대 폴더) 종합 인덱스 — 세부 기획서를 찾아갈 때 사용 |

## 작업 시작 절차 (필수 루틴)

1. **[PROGRESS.md](./PROGRESS.md)를 열어** 가장 앞선 Phase의 첫 번째 미체크(`- [ ]`) 항목을 다음 작업으로 선정한다. (사용자가 특정 작업을 지정하면 그것을 우선한다)
2. 해당 작업과 관련된 상세 기획 문서를 [0_service_spec_draft.md](./0_service_spec_draft.md) 인덱스에서 찾아 확인한 후 작업을 실행한다.
3. 작업 완료 및 검증 후, `PROGRESS.md`의 해당 항목을 `- [x]`로 갱신한다.
4. 작업 산출물과 체크리스트 갱신을 **하나의 커밋**으로 묶어 즉시 커밋하고 `git push`한다.
   * 원격: https://github.com/ynarcher-dev/ynarcher_works.git / 브랜치: `main`
5. 체크리스트에 없는 새로운 작업이 발생하면 적절한 Phase에 항목을 추가한 뒤 진행한다.

## 프로젝트 개요

AC/VC 업무 통합 플랫폼(내부 WORKS 앱 9개 워크스페이스 + 외부 GUEST 앱). 기존의 프로젝트 진척 관리(PMS) 성격에 인사, 재무, 자산, 전자결재 등 전사 자원 관리(ERP) 개념을 결합한 통합 기업 운영 플랫폼입니다. 현재는 기획 문서와 구현 산출물을 함께 갱신하는 단계이며 전체 기획은 [readme_master.md](./readme_master.md), 문서 지도는 [0_service_spec_draft.md](./0_service_spec_draft.md) 참조.

## 확정된 아키텍처 결정 (변경 시 반드시 사용자 확인)

- **워크스페이스 구조**: 기존 `HUB`의 전사 포털 역할은 실제 앱에서 **OFFICE**가 승계하며, 스타트업 운영 뷰는 **STARTUP** 워크스페이스로 분리됨. 문서명 `3_1_workspace_hub.md`는 링크 연속성을 위해 유지하되 내용 기준은 OFFICE로 해석함.
- **마스터 데이터 SSOT**: 스타트업 물리 원장(`public.startups`)은 NETWORKS 계열 스키마에 유지하되 업무 화면은 **STARTUP**이 담당합니다. 외부 전문가/투자사/기관/기업/대학/외주/글로벌 네트워크 원장은 **NETWORKS**, 임직원 원장은 **MANAGEMENT**, OFFICE는 조회·업무 허브로서 마스터를 소유하지 않음.
- **백엔드 실행 모델**: React/TS **Vite SPA** (S3+CloudFront 정적 호스팅) + **Supabase Edge Functions/RPC**. Next.js 서버 런타임 없음. "서버 액션" = Edge Function/RPC를 지칭.
- **스타일링**: **Tailwind CSS** 공식 채택. 컬러는 [4_color_system_rules.md](../docs_design/4_color_system_rules.md)의 웜그레이/브랜드 팔레트가 단일 원천.
- **치수·글자 위계 SSOT**: 값 자체는 `tailwind-preset.mjs`, "어느 맥락에 어느 토큰을 쓰는가"의 매핑은 `packages/ui/src/densityScale.ts`가 소유한다. 크기를 가르는 축은 중요도가 아니라 **놓이는 자리**(page 40 / card 32 / table 24)이며 `DensityProvider`가 하위로 내려준다. 글자 위계는 `cardText`(카드 제목·부제·소제목·라벨/값·건수)와 `tableText`(표 5단)에 모으고, 카드 제목은 `Card`/`PanelCard`가, 라벨:값 행은 `InfoField`가 소유한다 — **화면에서 규격 클래스를 직접 쓰지 않는다.** 관통 원칙은 *한 줄 안에서 크기를 갈라 위계를 만들지 않는다(크기는 하나, 구분은 굵기와 색으로)* 이며, 예외적으로 제목은 자기가 이끄는 본문보다 연해지지 않아야 한다.
- **모노레포**: Turborepo — `apps/works`, `apps/guest`, `packages/ui`(순수 UI), `packages/master-data`.
- **AC 문서 체계**: [3_4_workspace_ac.md](../docs_planning/3_4_workspace_ac.md) + `3_4_1`~`3_4_14` 신규 14문서가 정본. 구버전(ac_startups 등 5종)은 삭제됨 — 복원하지 말 것.
- **사업(Program) 공용 모듈**: AC·M&A·PROJECT는 화면 구현을 `apps/works/src/features/program` 하나로 공유하고, 워크스페이스별 차이(원장 테이블명·RPC명·사업구분·허용 모듈 템플릿·베이스 경로)는 `ProgramWorkspaceConfig` 주입으로만 표현한다. 원장은 물리적으로 분리(`programs` / `ma_programs` / `project_programs` 계열)하되 스키마 형태와 운영 규칙은 동일하게 유지한다. AC 화면을 고칠 때 M&A·PROJECT에 동시 반영되므로 회귀 범위에 유의할 것. 다형 테이블(`entity_contributions.entity_table` / `entity_feedback.target_type`)의 키도 원장별로 분리한다(`program` / `ma_program` / `project_program`, `ProgramWorkspaceConfig.entityKey`) — 값을 공유하면 RLS가 소유 워크스페이스를 판정할 수 없다. 단 `attachments`는 정책이 워크스페이스 무관이라 `'program'`을 그대로 쓴다.
- **RLS 헬퍼**: `current_app_user_id()`/`current_app_role()`이 기저 헬퍼, `is_admin()` 등 업무 헬퍼는 이를 경유. 워크스페이스 키로 파라미터화된 단건 사업 접근 판정은 `app.can_access_ws_program(ws_key, id)`를 사용한다(AC 전용 `app.can_access_program()`의 제네릭 버전). 다형 키에서 소유 워크스페이스를 얻을 때는 `app.entity_key_workspace(key)`를 경유한다.
- **작성자·담당자·기여자 3축**: **작성자**(등록자, 원장 `created_by`)와 **담당자**(수정·비활성화 권한자)와 **기여자**(지금까지 관여한 사람, 기여 로그에서 파생되는 서술)는 별개 축이다. 판정 규칙은 하나 — **담당자 원장에 행이 있으면 그 사람들, 비어 있으면 공동관리**(그 워크스페이스 쓰기 권한자 전원). NETWORKS 8종·글로벌은 담당자 원장이 없는 영구 공동관리, STARTUP은 투자기업만 `startup_managers` 지정(발굴·보육은 공동관리), PROGRAM 계열은 `program_managers`. **기여 로그(`entity_contributions`)로 권한을 판정하지 않는다** — 로그 INSERT는 워크스페이스 단위라 아무 레코드에나 자기 기여를 넣어 우회할 수 있고, 로그가 유실되면 폴백으로 오히려 열린다. 이 이유로 2026-07-21에 `app.is_entity_contributor()` 기반 파괴적 작업 가드를 제거했다(복원 금지).
- **마이그레이션 보안 게이트**: Supabase 마이그레이션 작성/수정 전 [11_migration_security_gate.md](../docs_dev/11_migration_security_gate.md)를 확인하고, 완료 보고에 체크리스트 통과 여부를 포함한다.

## 커밋 컨벤션

- 형식: `<type>(<scope>): <제목>` — type: `feat`/`fix`/`docs`/`refactor`/`chore`/`test`, scope: 워크스페이스 또는 영역(예: `office`, `startup`, `ac`, `ui`, `db`, `auth`)
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
- 새 테이블/RPC/Storage 정책/`SECURITY DEFINER` 함수는 [11_migration_security_gate.md](../docs_dev/11_migration_security_gate.md)의 보안 게이트를 통과해야 완료로 본다.
- 물리 삭제 금지(soft delete), 개인정보 목록 마스킹 의무, Secret은 `VITE_` 접두사 금지.
- UI에서 숨기는 것은 보안이 아니다 — 서버(Edge Function/RPC/RLS)에서 강제한다.
- 상세 원칙은 [1_development_stack.md](../docs_dev/1_development_stack.md) 및 docs_dev 2~7번 문서를 따른다.
