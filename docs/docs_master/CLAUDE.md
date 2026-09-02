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
- **마스터 데이터 SSOT**: 스타트업 물리 원장(`public.startups`)은 NETWORKS 계열 스키마에 유지하되 업무 화면은 **STARTUP**이 담당합니다. 스키마 위치와 별개로 **권한 판정 키는 `startup`**입니다(2026-07-31 이전 완료 — `startups`·`startup_managers`·스타트업 대상 다형 레코드 모두 `can_read/write_workspace('startup')`). `networks` 키는 전문가·투자사 등 네트워크 원장 9종과 글로벌 네트워크만 판정합니다. 외부 전문가/투자사/기관/기업/대학/외주/글로벌 네트워크 원장은 **NETWORKS**, 임직원 원장은 **MANAGEMENT**, OFFICE는 조회·업무 허브로서 마스터를 소유하지 않음.
- **백엔드 실행 모델**: React/TS **Vite SPA** (S3+CloudFront 정적 호스팅) + **Supabase Edge Functions/RPC**. Next.js 서버 런타임 없음. "서버 액션" = Edge Function/RPC를 지칭.
- **스타일링**: **Tailwind CSS** 공식 채택. 컬러는 [4_color_system_rules.md](../docs_design/4_color_system_rules.md)의 쿨 슬레이트 무채색/브랜드 인디고(`#2E5CB8`, 2026-08-20 딥네이비에서 전환) 팔레트가 단일 원천. 표면은 그림자가 아니라 헤어라인 테두리(`#D9DEE5`)+페이지 바탕(`#EDEFF2`, body가 직접 칠함)의 색차로 구획한다.
- **치수·글자 위계 SSOT**: 값 자체는 `tailwind-preset.mjs`, "어느 맥락에 어느 토큰을 쓰는가"의 매핑은 `packages/ui/src/densityScale.ts`가 소유한다. 크기를 가르는 축은 중요도가 아니라 **놓이는 자리**(page 40 / card 32 / table 24)이며 `DensityProvider`가 하위로 내려준다. 글자 위계는 `cardText`(카드 제목·부제·소제목·라벨/값·메타·건수)·`tableText`(표 5단)·`formText`(폼 라벨·도움말·오류)에 모으고, 카드 제목은 `Card`/`PanelCard`가, 라벨:값 행은 `InfoField`가, 폼 필드 한 칸은 `Field`가 소유한다 — **화면에서 규격 클래스를 직접 쓰지 않는다.** 표의 열 폭도 같은 원리로 화면이 아니라 컬럼 `type`(ColumnType — 담기는 데이터의 종류)이 정하며, 폭 값은 `columnWidth` 스케일이 소유한다. 관통 원칙은 *한 줄 안에서 크기를 갈라 위계를 만들지 않는다(크기는 하나, 구분은 굵기와 색으로)* 이며, 예외적으로 제목은 자기가 이끄는 본문보다 연해지지 않아야 한다.
- **안내 문구는 접는다(2026-09-01)**: 화면의 안내·규칙 설명이 사는 자리는 도움말 말풍선(`Tooltip`) 하나뿐이다. 접는 이유는 자리 절약이 아니라 읽는 순서 — 라벨·컨트롤·값이 서야 할 줄에 규칙이 같은 무게로 끼어들면 무엇을 입력하는 칸인지가 규칙에 밀린다. **접지 않는 것**은 빈 상태·오류·다음 행동을 지시하는 차단 안내(왜 못 누르는지)·되돌릴 수 없는 작업의 파급 효과 고지·입력값 되읽기이며, 이 예외는 `hintInline`으로 표시한다. 자리는 화면이 아니라 소유자가 정한다 — 폼 한 칸은 `Field`의 `hint`, 설정 한 줄은 `SettingRow`의 `hint`, 제목 줄은 `Card`·`PanelCard`·`Modal`·`PageHeader`·`CardHeading`의 `help`. 규격 값은 `tooltipScale`이 갖고, 상세 규칙은 [5_component_spec_rules.md §3.6.1](../docs_design/5_component_spec_rules.md)이 정본이다.
- **모노레포**: Turborepo — `apps/works`, `apps/guest`, `packages/ui`(순수 UI), `packages/master-data`.
- **AC 문서 체계**: [3_4_workspace_ac.md](../docs_planning/3_4_workspace_ac.md) + `3_4_1`~`3_4_15` 신규 15문서가 정본. 구버전(ac_startups 등 5종)은 삭제됨 — 복원하지 말 것.
- **모듈 템플릿 카탈로그는 ADMIN 원장이 소유한다(2026-09-02)**: 사업 운영 모듈의 **순서·분류·사용 여부·워크스페이스 노출·공유 상한 2종**은 `public.module_templates`(키=`module_type` 값, 쓰기는 ADMIN 전용)가 답한다. 종전에 네 곳(DB enum / `MODULE_TYPES` / 워크스페이스별 `allowedModuleTypes` / `MODULE_META`)으로 흩어져 운영 판단마다 배포가 필요했다. **코드에 남는 것과 원장으로 가는 것을 가르는 기준은 하나** — 화면 구현이 있어야만 성립하는 것(아이콘·진입 탭·라벨·배정 방식 정책)은 코드, 배치에 관한 것은 원장이다. **ADMIN은 있는 것을 배치할 뿐 없는 것을 만들지 않으므로 행은 마이그레이션이 심고(`on conflict do nothing` — 시드는 초기값이지 정답이 아니다) ADMIN은 값만 고친다.** 관통 규칙은 **카탈로그와 노출 상한이 기존 인스턴스에 다르게 작용한다**는 것이다 — `is_active`·`workspaces`(카탈로그)를 끄면 새로 못 만들 뿐 진행 중인 인스턴스는 그대로 동작하고(운영을 카탈로그 정리가 멈춰서는 안 된다), `allow_guest`·`allow_public_link`(상한)를 내리면 이미 열린 것도 즉시 닫힌다(그러지 않으면 그 설정에 아무 뜻이 없다). 상한은 판정 시점에 막고 저장값·토큰은 보존해 되돌리면 복구된다. 정본은 [3_2_1](../docs_planning/3_2_1_admin_module_registry.md).
- **공유 범위와 링크 공유는 다른 축이다(2026-09-02)**: 모듈 세팅의 **공유 범위(`module_visibility`)는 두 값**(`INTERNAL_ONLY`/`GUEST_ONLY`)이며 *로그인한 사람 중 누가 보는가*만 답한다. 세 번째 값 `PUBLIC`은 이름만 있고 익명 접근 경로가 없어 모든 판정에서 `GUEST_ONLY`와 동일하게 취급되었고(담당자는 외부에 열었다고 믿는데 실제로는 열리지 않는 운영 사고), enum 값은 의존 객체 재작성을 피해 남기되 CHECK로 저장을 막는다. *로그인 없는 바깥에 문을 여는가*는 **모듈 링크 공유**라는 별도 축이 답하며, 정본은 [3_4_15](../docs_planning/3_4_15_ac_public_links.md)다. 가르는 기준은 하나 — **이 화면이 보는 사람이 누구인지 알아야 성립하는가**. 알아야 하면 로그인, 몰라도 되면 링크다. 그래서 링크를 켤 수 있는 템플릿은 모집(쓰기 포함)·글쓰기·URL첨부·파일첨부 4종뿐이고 평가·멘토링·매칭·OT는 불가하며, 허용 목록은 화면이 아니라 `MODULE_META[type].publicLinkable`이 답한다. **두 축은 서로를 전제하지 않는다** — 모집을 여는 시점에는 명부가 비어 있어 `INTERNAL_ONLY` + 링크 공유 켜짐이 정상 조합이므로 한 셀렉트에 묶을 수 없다. 익명 접근에 **RLS 정책을 만들지 않는다**(전량 Edge Function이 `service_role`로 중개) — 정책 표현식이 곧 공개 범위가 되면 조인 한 줄이 늘 때마다 노출면이 조용히 넓어진다. 주소는 최초 1회 발급 후 고정이며(껐다 켜도 같은 주소 — 이미 배포한 공고문이 죽으면 수습할 방법이 없다) 교체는 명시적 '주소 재발급'만 한다.
- **사업(Program) 공용 모듈**: AC·M&A·PROJECT는 화면 구현을 `apps/works/src/features/program` 하나로 공유하고, 워크스페이스별 차이(원장 테이블명·RPC명·사업구분·허용 모듈 템플릿·베이스 경로·제안 단계 운용 여부)는 `ProgramWorkspaceConfig` 주입으로만 표현한다. **상태 수명주기도 워크스페이스가 정한다** — 제안 단계(시도·선정·미선정)는 AC 전용이고 M&A·PROJECT는 운영 4단계(준비·진행중·종료·취소)만 쓴다(`hasProposalStage`). 선택지·흐름·기본 상태는 화면이 아니라 `features/program/config.ts`의 `programStatusOptions()`/`programFlowGroups()`/`defaultProgramStatus()`가 답하고, 저장 금지는 두 원장의 CHECK 제약이 함께 강제한다(2026-08-03). 원장은 물리적으로 분리(`programs` / `ma_programs` / `project_programs` 계열)하되 스키마 형태와 운영 규칙은 동일하게 유지한다. AC 화면을 고칠 때 M&A·PROJECT에 동시 반영되므로 회귀 범위에 유의할 것. 다형 테이블(`entity_contributions.entity_table` / `entity_feedback.target_type`)의 키도 원장별로 분리한다(`program` / `ma_program` / `project_program`, `ProgramWorkspaceConfig.entityKey`) — 값을 공유하면 RLS가 소유 워크스페이스를 판정할 수 없다. 단 `attachments`는 정책이 워크스페이스 무관이라 `'program'`을 그대로 쓴다. **모듈 템플릿의 기본 3종은 저장 대상으로 가른다**(2026-08-03) — 글쓰기(`POST`)·URL첨부(`LINK`)·파일첨부(`FILE`)가 구 '커스텀 활동'을 대체하며, 셋 모두 전체 화면 탭으로 진입한다(2026-09-01 URL첨부·파일첨부의 모달 진입 폐지 — WORKS와 GUEST가 같은 화면 구성을 공유하고 편집 가능 여부만 다르다). 이동할 탭 키는 화면이 아니라 `MODULE_META[type].tab`이 답한다. 파일첨부는 신규 원장을 만들지 않고 사업 자료와 **같은 `attachments` 행**을 쓰되 `program_module_id`로 귀속만 표시한다 — 복제하면 두 목록이 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가 없다.
- **RLS 헬퍼**: `current_app_user_id()`/`current_app_role()`이 기저 헬퍼, `is_admin()` 등 업무 헬퍼는 이를 경유. 워크스페이스 키로 파라미터화된 단건 사업 접근 판정은 `app.can_access_ws_program(ws_key, id)`를 사용한다(AC 전용 `app.can_access_program()`의 제네릭 버전). 다형 키에서 소유 워크스페이스를 얻을 때는 `app.entity_key_workspace(key)`를 경유한다.
- **생성자·담당자·기여자 3축**: **생성자**(레코드를 만든 사람, 원장 `created_by` — 구 '작성자·등록자', 2026-07-31 용어 통일)와 **담당자**(수정·비활성화 권한자)와 **기여자**(지금까지 관여한 사람, 기여 로그에서 파생되는 서술)는 별개 축이다. 생성자는 어떤 권한도 주지 않으므로 **목록에는 노출하지 않고 상세 페이지에만 둔다**(관리 주체는 담당자 열이 답한다). 오등록·퇴사 정리는 ADMIN '생성자 교체'가 담당한다. 게시판·공지·자료실의 글쓴이는 도메인 용어 그대로 '작성자'를 쓴다. 판정 규칙은 하나 — **담당자 원장에 행이 있으면 그 사람들, 비어 있으면 공동관리**(그 워크스페이스 쓰기 권한자 전원). NETWORKS 8종·글로벌은 담당자 원장이 없는 영구 공동관리, STARTUP은 투자기업만 `startup_managers` 지정(발굴·보육은 공동관리), PROGRAM 계열은 `program_managers`. **기여 로그(`entity_contributions`)로 권한을 판정하지 않는다** — 로그 INSERT는 워크스페이스 단위라 아무 레코드에나 자기 기여를 넣어 우회할 수 있고, 로그가 유실되면 폴백으로 오히려 열린다. 이 이유로 2026-07-21에 `app.is_entity_contributor()` 기반 파괴적 작업 가드를 제거했다(복원 금지).
- **기여 로그의 소유자는 DB 트리거**: 변동 이력(`entity_contributions`)은 화면이 아니라 원장 트리거 `app.log_entity_contribution()`이 남긴다. **클라이언트에서 `entity_contributions`에 직접 INSERT하지 않는다** — 손으로 남기던 시절에 누락(수정·일괄 이관·임포터)·중복(구분 변경 2줄)·비원자성이 모두 발생했다. 사유·배치처럼 트리거가 알 수 없는 정보는 트랜잭션 GUC `app.contribution_ctx`(jsonb: action/source/batch_id/note)에 실어 보내며, 이를 세팅하는 RPC(`deactivate_entity`/`reassign_entity`/`merge_entity`/`upload_*`)는 **모두 `SECURITY INVOKER`**다. DEFINER로 만들면 각 원장의 RLS를 우회하게 되어 정책을 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다. RPC 허용 목록은 나열하지 않고 `app.has_contribution_trigger()`가 카탈로그에서 판정한다.
- **마이그레이션 보안 게이트**: Supabase 마이그레이션 작성/수정 전 [11_migration_security_gate.md](../docs_dev/11_migration_security_gate.md)를 확인하고, 완료 보고에 체크리스트 통과 여부를 포함한다.

## 커밋 컨벤션

- 형식: `<type>(<scope>): <제목>` — type: `feat`/`fix`/`docs`/`refactor`/`chore`/`test`, scope: 워크스페이스 또는 영역(예: `office`, `startup`, `ac`, `ui`, `db`, `auth`)
- 제목과 본문은 한국어로 작성한다.
- 문서 수정은 `docs(<폴더>)` 스코프를 사용한다.

## 문서 작업 톤앤매너

- 격식체("~합니다") 서술, 불릿은 `* **볼드 리드**: 설명` 패턴, 섹션 구분은 `---`, 강조는 `> [!NOTE]` 콜아웃.
- 이모지는 인덱스 성격 문서(readme_*, 0_service_spec_draft)의 헤더에만 사용하고 상세 명세서 본문에는 사용하지 않는다.
- 한글 용어 + 괄호 영문 병기(예: 캐피탈 콜(Capital Call)), 상태값은 `UPPER_SNAKE_CASE` 백틱 표기, 워크스페이스명은 대문자(`AC`, `FUND`).
- AC 신규 문서(3_4_1~3_4_15)는 15절 정형 템플릿(목적→범위→…→테스트 기준)을 유지한다.

## 개발 수칙 (docs_dev 요약)

- 파일당 500줄 상한 (컴포넌트 250 / 훅 150 / 함수 50).
- DB 변경은 마이그레이션으로만. 모든 테이블 RLS 필수, Default Deny.
- 새 테이블/RPC/Storage 정책/`SECURITY DEFINER` 함수는 [11_migration_security_gate.md](../docs_dev/11_migration_security_gate.md)의 보안 게이트를 통과해야 완료로 본다.
- 물리 삭제 금지(soft delete), 개인정보 목록 마스킹 의무, Secret은 `VITE_` 접두사 금지.
- UI에서 숨기는 것은 보안이 아니다 — 서버(Edge Function/RPC/RLS)에서 강제한다.
- 상세 원칙은 [1_development_stack.md](../docs_dev/1_development_stack.md) 및 docs_dev 2~7번 문서를 따른다.
