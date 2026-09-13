# [15] 권한 인벤토리 (AUTHZ-1/2)

본 문서는 **누가 무엇에 닿는가**의 진입점입니다. 수치와 표 단위 결정은 여기에 옮겨 적지 않고, 기계가 만든 산출물을 가리킵니다 — 한 가지 사실은 한 곳에만 둡니다.

> [!IMPORTANT]
> 이 인벤토리는 **격리된 신규 DB에 저장소 마이그레이션을 전수 재생한 결과**입니다. 운영 DB는 조회하지 않았으므로 운영 상태에 대한 판단이 아닙니다. 또한 **보안 감사가 아니라 권한 인벤토리**입니다 — RLS 정책의 술어가 옳은지는 여기서 판정하지 않습니다.

---

## 1. 산출물 지도

| 파일 | 소유하는 사실 | 생성 |
| :--- | :--- | :--- |
| [acl-inventory.json](../../supabase/security/acl-inventory.json) | 재생된 카탈로그 전체 — 표·뷰·시퀀스, RLS와 정책 전문, 역할별 유효 권한, 뷰 `security_invoker`, 함수 시그니처·`SECURITY DEFINER`·`search_path`·EXECUTE, Storage 버킷 설정과 정책 | `acl-inventory.mjs export` |
| [data-access-scan.json](../../supabase/security/data-access-scan.json) | 앱·Edge 소스의 호출 자리(직접·동적·문자열 보조) | `scan-data-access.mjs` |
| [rpc-reachability.json](../../supabase/security/rpc-reachability.json) | RPC가 **호출자 권한으로** 닿는 표(INVOKER 전이 폐포) | `rpc-reachability.mjs` |
| [edge-source-findings.json](../../supabase/security/edge-source-findings.json) | Edge Function·RPC 소스 전수 감사 결과 중 ACL에 쓰는 부분 | 외부 입력(이 저장소의 스크립트로 재생성되지 않음) |
| [acl-evidence.json](../../supabase/security/acl-evidence.json) | 위 넷을 표 단위로 합친 근거 | `acl-evidence.mjs` |
| [acl-decisions.json](../../supabase/security/acl-decisions.json) | **표마다의 결정과 기대 권한** — 이 인벤토리의 정본 | `build-acl-decisions.mjs` |

* **생성 순서**: `up` → `export` → `scan-data-access` → `rpc-reachability` → `acl-evidence` → `build-acl-decisions`. 스크립트는 모두 `scripts/security/`에 있고 읽기 전용입니다.
* **재현성**: `export`는 **스택이 실제로 재생한 사본**의 해시가 저장소의 현재 SQL과 같을 때만 씁니다. 다르면 거부합니다 — 옛 DB에 현재 파일의 지문을 붙이지 않습니다. 같은 DB에서 두 번 돌리면 바이트가 같습니다.
* **담지 않는 것**: 업무 데이터 행, 자격증명, 키, 토큰, 사용자 식별자. Storage는 버킷 **설정**과 정책 메타데이터만 담고 객체 행은 담지 않습니다.

---

## 2. 결정의 근거 — 다섯을 모두 봅니다

권한을 주는 판단은 다음 다섯 가지가 **함께** 맞을 때만 성립합니다. 하나라도 빼면 인벤토리가 닫히지 않습니다.

* **정책(policy)**: 그 명령에 정책이 있는가. 없으면 권한을 줘도 0행이므로 주지 않습니다. `INSERT` 정책이 있다는 사실만으로 `INSERT`를 주지 않습니다.
* **직접 호출**: 화면이 `.from('표')`로 그 연산을 거는가. 설정 객체를 거치는 간접 호출(`config.tables.*`, `SHARED_TABLES`, `LEDGERS`, `TAG_CONFIGS`)은 사람이 해소해 근거 파일·줄을 답니다.
* **RPC 전이**: `SECURITY INVOKER` 함수는 **호출자 권한으로** 돌므로, 화면이 표를 직접 만지지 않아도 그 함수가 닿는 표에 호출자의 권한이 필요합니다. `SECURITY DEFINER`는 소유자 권한으로 도므로 그 안쪽은 대상이 아니며, 폐포는 DEFINER 경계에서 끊습니다. **정책과 직접 호출만 보면 이 축이 통째로 빠집니다.** 실제로 `guest_invitations`가 그 자리였습니다 — 화면 호출은 `SELECT` 하나뿐이지만 게스트 로그인 개방 경로가 **호출자 토큰 그대로** `open_program_guest_access`(INVOKER)를 부르고 그 함수 본문이 이 표를 `UPDATE`하고 없으면 `INSERT`합니다(§6 C16–C23).
* **Edge 자격**: 같은 `.from()`이라도 `supabaseAdmin()`(service_role)과 `supabaseAsCaller()`(호출자 JWT = `authenticated`)는 요구하는 권한이 다릅니다. 호출 자리마다 가릅니다.
* **쓰기가 함께 요구하는 `SELECT`**: PostgreSQL은 `insert ... returning`(supabase-js의 `.insert(...).select()`)과 `update`/`delete`의 `WHERE`에 쓰인 칸에 대해 `SELECT`를 따로 요구합니다. **RLS를 우회하는 `service_role`도 테이블 ACL은 그대로 받으므로** "쓰기만 주면 된다"가 실행 시점에 42501로 무너집니다. 스캐너는 체인 꼬리를, RPC 분석기는 함수 본문의 문 단위를 봐서 이 요구를 근거에 함께 적습니다. 이 축은 권한 행렬 단언만으로는 드러나지 않으므로 회귀가 문장을 **실제로 돌려** 확인합니다(§6 C11–C16).

> [!NOTE]
> `scan-data-access.mjs`는 정규식 기반이라 **근거이지 결정이 아닙니다.** 동적 SQL(`execute format(...)`)의 대상은 잡히지 않으므로 `rpc-reachability.json`의 `dynamic_sql_in`이 표시하고, 그 자리는 호출부가 실제로 넘기는 값으로 사람이 해소합니다(`build-acl-decisions.mjs`의 `DYNAMIC_RPC_TARGETS`).

---

## 3. 표 단위 분류

모든 표가 여섯 갈래 중 하나를 갖습니다. 갈래별 명단과 표마다의 근거는 `acl-decisions.json`의 `by_class`·`decisions[]`가 소유합니다.

* **`policy-backed-client-dml`**: 정책이 뒷받침하고 화면이 실제로 쓰는 표. 관찰된 연산만 부여합니다.
* **`read-only`**: 화면이 읽기만 하는 표.
* **`lookup`**: 기준정보(태그) 원장. ADMIN 관리 화면이 `SELECT`·`INSERT`·`UPDATE`로 다루며 삭제는 `deleted_at` UPDATE입니다.
* **`server-only-protected`**: 서버(`service_role`·`SECURITY DEFINER`)만 쓰는 표. 클라이언트 쓰기를 주지 않습니다.
* **`legacy-unused`**: 이관이 끝난 구 원장(`_retired_*`). 권한을 주지 않습니다.
* **`unresolved`**: 호출 증거가 없거나 간접 증거만 있어 소유자 확인이 필요한 표. **권한을 주지 않으므로 닫힌 채로 남습니다.**

### `guest_invitations` — 갈래를 바꾼 표

`server-only-protected`(화면은 조회만, 소진은 Edge의 `service_role`)로 두었던 전제가 코드와 달랐습니다. `guest-access-invite/index.ts`는 **관리자 키를 쓰지 않고** 호출자의 토큰을 그대로 달아 `open_program_guest_access`(`SECURITY INVOKER`)를 부르며, 그 함수가 초대 행을 `UPDATE`하고 없으면 `INSERT`합니다. 요구되는 권한은 `service_role`이 아니라 **`authenticated`**의 것입니다. 갈래를 `policy-backed-client-dml`로 옮기고 `SELECT`·`INSERT`·`UPDATE`를 줬습니다.

경계는 이제 RLS가 집니다. `UPDATE`는 두 겹으로 막힙니다 — `guest_inv_update`가 `app.is_admin()` 또는 `project`·`guest` 워크스페이스 쓰기를 요구하고, 읽는 자리가 있어 `guest_inv_select`(게스트 세 역할 제외)가 함께 걸립니다.

`INSERT`는 한 번 열렸다가 닫혔습니다. `guest_inv_insert`의 `with_check`가 `app.can_write_workspace('guest')`를 허용하는데 `issue_guest_account`는 **모든 게스트 계정에 정확히 `('guest','write','self')`를 심습니다**(`20260911221000`). 표 권한이 닫혀 있는 동안에는 42501이 먼저 나서 드러나지 않았고, 권한을 연 직후의 회귀에서 게스트 `INSERT`가 실제로 통과하는 것이 드러났습니다. [`20260912161500`](../../supabase/migrations/20260912161500_guest_invitations_internal_write_guard.sql)이 두 쓰기 정책에 `app.is_internal_user()`를 **AND로** 더해 닫았습니다 — 기존 조건은 그대로 두고 좁히기만 했으며 `guest_inv_select`와 게스트 로그인 정책은 건드리지 않았습니다. `service_role`은 `BYPASSRLS`라 서버 경로는 영향을 받지 않습니다.

> [!NOTE]
> **관측된 축 불일치(미검증, 이번 범위 밖).** 두 쓰기 정책은 `project`·`guest` 워크스페이스만 봅니다. 그런데 `open_program_guest_access`는 FUND·M&A 맥락의 참가자도 다룹니다(`app.program_ws`가 `fund`를 가르는 분기가 있습니다). 그 맥락의 담당자가 이 경로를 실제로 쓸 수 있는지는 **확인하지 않았습니다** — 정책 축을 넓히는 것은 별도 도메인 판단이라 이번에 손대지 않았습니다. 이 문서는 **모든 워크스페이스에서 이 RPC가 동작한다고 주장하지 않습니다.** §7에 다시 꺼낼 조건과 함께 남깁니다.

### 물리 삭제(DELETE)의 예외

`DELETE` 정책이 있고 **승인된 경로가 실제로 물리 삭제를 쓰는** 자리에만 줍니다. 현재 `authenticated` 네 표이며 모두 배정성 원장입니다.

* **`capital_call_payments`**: 캐피탈콜을 접을 때 배정 행을 지웁니다(`features/fund/hooks.ts`의 `useDeleteCapitalCall`, `CapitalCallPanel.tsx`가 호출). 남기면 화면에서 사라진 돈이 집계에 남습니다.
* **`fund_managers` · `fund_purposes` · `investment_purposes`**: `set_fund_staffing` · `set_fund_purposes` · `set_investment_purposes`가 행을 **지우고 다시 넣는** 원자 교체를 합니다. 셋 다 `SECURITY INVOKER`라 권한이 없으면 그 자리에서 42501로 멈춥니다.

`service_role`의 `DELETE`는 `users` 하나이며, 임직원 생성 실패 시 방금 만든 계정을 되돌리는 경로입니다(`employee-create/index.ts`). 그 밖의 업무 표는 종전대로 soft delete이며 `DELETE`를 주지 않습니다.

---

## 4. 역할 × 워크스페이스 — 확인·차이·미검증

소스 대조 결과이며 전문은 `edge-source-findings.json`의 `role_map.docComparison`에 있습니다. 여기서는 상태만 적습니다.

| 대조 대상 | 상태 | 요지 |
| :--- | :--- | :--- |
| 게스트 로그인 정책(`docs_master/CLAUDE.md` §3) | `CONFIRMED` | 이메일 아이디 + 개인 비밀번호, 설정 전 세션 불발급. 코드가 그대로입니다. **이 감사는 이 정책을 바꾸지 않았습니다.** |
| `entity_contributions` 행위자 축(`docs_master/CLAUDE.md` §3) | `CONFIRMED` | 트리거가 행위자 칸을 덮어쓰고 클라이언트 INSERT는 정책이 허용합니다. |
| 역할 목록(`docs_planning/1_roles_permissions.md` §1.1) | `DIFFERENCE` | 문서 7종 대 구현 11종(`read_only` 누락, executive 분리). |
| 워크스페이스 목록(같은 문서 §2.1) | `DIFFERENCE` | 문서는 AC와 PROJECT를 둘로 세지만 `20260909150000` 이후 구 AC가 `project`이고 구 project는 `project_retired`입니다. |
| 게스트 로그인(같은 문서 §3) | `SUPERSEDED` | 이름+연락처+사업코드+OTP 기술은 `docs_planning/3_9_1` §6이 대체했습니다. **이 문서 쪽으로 되돌리지 않습니다.** |
| RLS 정책 매트릭스(`3_database_rls_policy_matrix.md` §4) | `DIFFERENCE` | 2026-09-03/04 원장 통합 이전 표 이름이라 현재 표와 대응하지 않습니다. **ACL 정본으로 쓸 수 없습니다.** |
| 물리 삭제 금지(같은 문서 §2.5) | `EXCEPTION` | 위 §3의 배정성 원장 예외가 승인되어 이 인벤토리에 기록되었습니다. |

* **게스트와 임직원은 같은 `authenticated` 롤을 씁니다.** 표 권한은 둘을 가르지 못하며 경계는 전적으로 RLS입니다. 그래서 권한을 연 자리마다 게스트 부정 경로를 회귀로 함께 고정합니다(§6 D9–D12, C21–C22).

> [!IMPORTANT]
> **이 표는 역할 × 워크스페이스 전수 검증이 아닙니다.** 회귀가 실제로 돌려 본 조합은 몇 개의 픽스처 계정뿐입니다 — FUND 쓰기·읽기전용·M&A 쓰기·경영지원 쓰기·PROJECT 쓰기·게스트(self scope). 구현 역할 11종과 워크스페이스 전 조합을 확인했다는 뜻이 아니며, 확인하지 않은 조합은 **미검증**입니다.

---

## 5. RPC · 뷰 · Storage의 현재 사실

* **RPC 실행 권한**: 브라우저가 부르는 RPC는 전부 `authenticated` EXECUTE를 갖습니다. `PUBLIC`에 열려 있던 네 함수(`set_program_staffing`, `set_ma_program_staffing`, `set_application_form`, `network_entity_metrics`)는 `20260912161000`이 `PUBLIC`에서만 회수해 `authenticated`로 좁혔습니다. **본문의 자체 인가 검사는 그대로 둡니다.**
* **`SECURITY DEFINER`**: 재생 DB의 `SECURITY DEFINER` 함수는 전부 `search_path`가 고정되어 있습니다(미고정 0건). `app.*` RLS 헬퍼의 EXECUTE는 건드리지 않습니다 — 회수하면 정책이 닿지 못합니다.
* **뷰 둘은 의도된 정의자 투영(definer projection)입니다.** `portable_assets`와 `trade_partners_directory`는 `security_invoker=false`로 소유자 권한으로 돌며 기반 표의 RLS를 거치지 않습니다. **뒤집지 않습니다.** 경계는 뷰 본문의 술어입니다.
  * `portable_assets`: `deleted_at is null and is_portable and status <> 'RETIRED' and app.is_internal_user()`.
  * `trade_partners_directory`: `deleted_at is null and app.is_internal_user()`이며 컬럼을 가립니다 — 사업자번호는 개인 상대일 때 앞 4자리만, 계좌번호는 숫자만 남긴 뒤 뒤 4자리만 냅니다.
  * **남은 공백**: 두 뷰의 경계는 `app.is_internal_user()` 한 겹이며, 워크스페이스 열람 권한까지 보는지는 **미검증**입니다. RLS가 전부 검증되었다고 읽지 않습니다.
* **Storage**: 버킷 8개 중 공개 3개(`approval-form-assets`, `meeting-room-photos`, `program-posters`). `storage.objects`의 정책은 `SELECT`·`INSERT`·`UPDATE`뿐이고 `DELETE` 정책은 한 건도 없습니다. `storage.buckets`에는 정책이 없어 기본 거부입니다. **storage 스키마는 storage 서비스가 소유하며 이 저장소의 마이그레이션이 만든 ACL이 아니므로 이번 범위 밖입니다** — 사실만 기록합니다.
* **시퀀스**: `public`에 시퀀스가 **0개**입니다(모든 PK가 uuid). 다만 **기본 권한**은 비어 있지 않았습니다 — `anon`·`authenticated`·`service_role`이 앞으로 만들 시퀀스에 `UPDATE`를 받게 되어 있었고, `UPDATE` 하나로 `nextval`·`setval`이 함께 열립니다. 지금 객체가 없어 현재 위험은 없지만 `serial` 칼럼이 하나 생기는 순간 되살아나므로 `20260912160500`이 두 앱 롤의 기본값을 회수했습니다. 채번이 필요한 표는 그 표의 마이그레이션이 이름을 적어 `usage`를 주고, `generated as identity`는 칼럼에 매인 시퀀스라 권한 자체가 필요 없습니다.

---

## 6. 들어간 마이그레이션과 회귀

* **`20260912160000_acl_table_privileges`**: 전수 인벤토리를 근거로 `authenticated`·`service_role`에 이름을 적어 권한을 주고, `anon`·`authenticated`의 행 접근 외 권한(`TRUNCATE`·`REFERENCES`·`TRIGGER`, 17에서는 `MAINTAIN`)을 회수합니다. `anon`에는 어떤 행 권한도 주지 않습니다.
* **`20260912160500_acl_default_privileges`**: `alter default privileges for role postgres in schema public`으로 **앞으로 만들 표**의 행 접근 외 권한과 **앞으로 만들 시퀀스**의 `UPDATE`를 두 앱 롤에서 뺍니다. 표 단위 회수만으로는 다음 표에서 같은 빚이 다시 생기기 때문입니다. **DML 기본 부여는 만들지 않으며** 새 표는 계속 "권한 없음"으로 태어납니다 — 필요한 권한은 그 표의 마이그레이션이 이름을 적습니다([11_migration_security_gate.md](./11_migration_security_gate.md)). `service_role`의 기본 권한은 건드리지 않습니다.
* **`20260912161000_acl_rpc_execute_narrowing`**: 위 네 함수의 EXECUTE를 `PUBLIC`에서만 회수합니다.
* **`20260912161500_guest_invitations_internal_write_guard`**: `guest_inv_insert`·`guest_inv_update`에 `app.is_internal_user()`를 AND로 더합니다. 앞 파일이 `authenticated`에 이 표의 쓰기를 열면서 **닿게 된** 정책 빈틈을 닫는 것이며(§3), 기존 조건과 `guest_inv_select`·게스트 로그인 정책은 그대로입니다. 사후 확인이 `pg_policy` 표현식을 직접 읽어 조건이 실제로 들어갔는지 봅니다.
* **회귀**: [authorization_inventory_test.sql](../../supabase/tests/authorization_inventory_test.sql)이 (A) 전수 기대 권한 행렬, (B) 새로 만든 표와 **시퀀스**가 비행 권한·채번 권한을 물려받지 않음, (C) `service_role`의 실제 자격증명·인사 쓰기와 **쓰기가 `SELECT`를 함께 요구하는 두 자리**(`insert ... returning`으로 지원 행 id를 돌려받기, `where participant_id`로 좁혀 초대 소진), 같은 자리의 `anon`·`authenticated` 거절, **초대 표의 경계가 권한이 아니라 RLS라는 것**(담당 권한 없음 → 저장된 행 불변, 있음 → 실제로 갱신·생성, 워크스페이스 없음 → `42501`, 게스트는 `INSERT`·`UPDATE` 모두 거절되고 저장된 값도 그대로), 그리고 `open_program_guest_access`를 **호출자 권한으로 실제로 불러** 본문의 인가에서 멈추는 것(오류 코드만으로는 EXECUTE 거절과 구분되지 않으므로 **본문이 내는 메시지까지 대조**합니다), (D) FUND 쓰기 긍정·읽기전용/타 워크스페이스/게스트 부정과 삭제의 상위 집계 반영, (E) 좁힌 RPC의 `anon` 거절·`authenticated` 허용을 고정합니다. 회귀는 **56건**을 계획합니다. **실행 결과는 이 문서가 소유하지 않습니다** — 격리 재생에서 실제로 돌린 수치는 그 실행 기록이 갖습니다.
* **기대 행렬의 정본은 `acl-decisions.json`의 `decisions[].expected`입니다.** `proposed`와 다를 수 있는 이유는 하나뿐입니다 — 근거를 찾지 못한 기존 권한을 이번에 **회수하지 않기로** 했기 때문입니다(`delta.authenticated_unjustified_review`). 회귀는 제안이 아니라 이 값을 봅니다.

---

## 7. 남은 공백 — 다시 꺼낼 조건

* **근거 없는 기존 권한**: 지금 권한이 있는데 호출 경로를 찾지 못한 자리가 남아 있습니다(결재 레거시 조회 표들, 일부 KPI 원장, `module_templates`의 INSERT 등). **회수하지 않았습니다** — 이 인벤토리가 보지 못한 경로일 수 있기 때문입니다. 명단은 `acl-decisions.json`의 `delta.authenticated_unjustified_review`가 갖습니다. **다시 꺼낼 조건**: 그 화면의 소유자가 경로 없음을 확인하면 회수 마이그레이션을 따로 냅니다.
* **`guest_invitations` 쓰기 정책의 워크스페이스 축(미검증)**: 두 쓰기 정책은 `project`·`guest`만 보는데 `open_program_guest_access`는 FUND·M&A 맥락도 다룹니다. 그 맥락의 담당자가 이 경로를 실제로 쓸 수 있는지 **확인하지 않았습니다.** 이번에 정책 축을 넓히지 않았습니다 — 넓히는 것은 별도 도메인 판단입니다. **다시 꺼낼 조건**: FUND·M&A의 게스트 로그인 개방을 실제로 다루는 작업에서, 그 워크스페이스 담당자 계정으로 경로를 돌려 보고 정합니다.
* **`guest_invitations`의 게스트 INSERT 회귀**: **닫혔습니다**(`20260912161500`). 회귀 `C21`·`C22b`가 거절을 고정합니다. 빚으로 남기지 않았습니다.
* **`unresolved` 갈래의 표**: 권한이 닫혀 있어 지금 위험은 없지만, 미사용인지 RPC 전용인지 갈리지 않았습니다. **다시 꺼낼 조건**: 그 도메인을 손대는 다음 작업에서 그 자리에 확정합니다.
* **`merge_entity`가 회의록 상호참조를 옮기지 못합니다**: 병합은 `meeting_minute_links`를 정본으로 옮기고 겹치면 지우도록 되어 있는데, 그 표에는 `SELECT` 정책 하나뿐이라 `authenticated` 호출자에게는 RLS가 먼저 막습니다. **권한으로 덮지 않았습니다** — 정책 쪽 결함이며 ACL 공백이 아닙니다. **다시 꺼낼 조건**: 병합 동작을 손볼 때 정책과 함께 봅니다.
* **`service_role` 비행 권한**: 159개 표 전부에 `TRUNCATE`·`REFERENCES`·`TRIGGER`·`MAINTAIN`이 남아 있습니다. 이번 회수 대상은 두 앱 롤로 한정했습니다. **다시 꺼낼 조건**: 서버 롤의 비행 권한 정리를 별도 과제로 세울 때.
* **`proacl`이 빈 함수 넷**: `assign_entity_code`·`enforce_module_assignee_in_pool`·`enforce_ma_module_assignee_in_pool`·`gen_entity_code`는 기본값으로 `PUBLIC`이 EXECUTE를 갖습니다. 앞의 셋은 트리거 함수이고 넷째는 값만 돌려줍니다. 이번 범위에 넣지 않았습니다.
* **`supabase_admin`이 만드는 객체의 기본 권한**: `pg_default_acl`에는 `grantor = postgres` 말고 `grantor = supabase_admin` 항목이 따로 있고, 그쪽은 `public` 스키마의 표에 `anon`·`authenticated`·`service_role`의 **행 권한 전부**(`SELECT`·`INSERT`·`UPDATE`·`DELETE`)를, 시퀀스에 `USAGE`·`SELECT`·`UPDATE`를 줍니다. 저장소의 마이그레이션은 `postgres`로 돌아 `public` 표 159/159가 `postgres` 소유이므로 **현재 이 경로로 생긴 권한은 없습니다.** 그러나 `supabase_admin`으로 만들어지는 객체가 `public`에 생기면 그 표는 태어나자마자 `anon`에 전부 열립니다. 이 기본값을 바꾸려면 `supabase_admin` 권한이 필요해 저장소 마이그레이션의 범위를 벗어납니다. **다시 꺼낼 조건**: Supabase 플랫폼 쪽 설정으로 이 기본값을 좁힐 수 있는지 확인할 때, 또는 `public`에 `supabase_admin` 소유 객체가 처음 생길 때.
* **`edge-source-findings.json`의 미해결 항목**: `findings`(E-1 ~ E-8)와 `unknowns`(U-1 ~ U-7)는 **이 문서가 소유하지 않습니다.** 이 인벤토리는 그중 ACL에 닿는 부분만 가져왔고, 나머지는 그 파일에 남아 있습니다. **다시 꺼낼 조건**: Edge Function 경로를 손대는 다음 작업에서 그 파일을 함께 봅니다.

---

## 8. 관련 문서

* [11_migration_security_gate.md](./11_migration_security_gate.md): 새 표·RPC·Storage 정책의 보안 게이트. **새 표는 권한 없이 태어나므로 필요한 GRANT를 그 마이그레이션이 이름으로 적습니다.**
* [3_database_rls_policy_matrix.md](./3_database_rls_policy_matrix.md): RLS 정책 매트릭스(§4는 원장 통합 이전 표 이름 — 위 §4의 `DIFFERENCE` 참조).
* [2_auth_permissions_architecture.md](./2_auth_permissions_architecture.md): 역할·워크스페이스·Scope 설계.
* [9_database_physical_schema.md](./9_database_physical_schema.md): 물리 스키마와 RLS 헬퍼 구조.
