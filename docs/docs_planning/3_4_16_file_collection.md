# 3_4_16 파일받기(FILE_COLLECTION) 모듈

> [!IMPORTANT]
> 이 문서는 **DB·Edge 계약의 정본**입니다. 아래에 적힌 표·RPC·흐름·함수는 소스에 **실제로 구현된 것만** 담습니다 — `supabase/migrations/20260913210000_file_collection_module_type.sql`, `20260913210500_file_collection_schema.sql`, Edge Function `supabase/functions/file-collection-file`, 그리고 WORKS·GUEST 화면 코드입니다.
> **2026-09-13에 운영 DB 적용과 Edge 배포까지 끝났습니다** — 반영 범위·확인 내용·남은 공백은 §9가 소유하고, 소스 기준 검증 수치는 §8이 소유합니다.

---

## 1. 무엇을 하는 모듈인가

PROJECT·M&A 사업에서 **게스트마다 다른 자료를 받아 검토**하는 모듈입니다. WORKS가 자유 깊이의 폴더·문항 트리를 짜고 게스트별로 배포하면, 게스트는 자기 문항에만 파일 여러 개와 댓글을 붙여 **문항 단위로** 제출하고, WORKS는 문항마다 승인 또는 보완요청을 냅니다.

* **격리**: 같은 기업·같은 사업의 게스트라도 서로의 파일·댓글·진행률을 보지 못합니다. 격리 단위는 **게스트 계정 하나**(배정 1행)입니다.
* **분리 저장소**: 기존 `attachments`(모듈 전체 공유)와 정책 전제가 반대이므로 전용 표와 전용 비공개 버킷 `file-collection`을 씁니다.
* **범위**: 워크스페이스는 `project`·`mna` 둘뿐입니다. FUND는 이번 범위에서 제외했습니다(사용자 확정).
* **등록**: `module_templates`에 `FILE_COLLECTION`(category `OPERATION`, visibility `GUEST_ONLY`, workspaces `project,mna`, sort_order 11) 한 줄이 서고, ADMIN이 카탈로그에서 토글합니다.

---

## 2. 원장 6종

모든 하위표는 `program_module_id` 단일 컬럼 FK를 가집니다(`app.module_content_tables()`가 이 FK로 모듈 내용물을 찾습니다). 아래 컬럼이 전부입니다.

* **`file_collections`** (모듈당 1행): `id`, `program_module_id`(unique, FK `program_modules`), `title`, `guide`, `level_names`, `published_at`, `published_by`, `created_by`, `created_at`, `updated_at`, `deleted_at`.
  * `published_at`이 트리 잠금의 정본입니다. NULL이면 초안, 값이 서면 트리 구조가 불변이 되고 되돌리지 않습니다.
  * `level_names text[] not null default '{}'`는 가로 계층 구성표의 **단계 이름**입니다(2026-09-13 추가, 운영 미적용). 이름표일 뿐이며 트리의 실제 깊이는 마디가 답합니다 — 비어 있으면 화면이 기본 이름을 세웁니다.
* **`file_collection_nodes`** (트리): `id`, `program_module_id`, `collection_id`, `parent_id`(self FK), `node_type`(`FOLDER`/`QUESTION`), `title`, `guide`, `is_required`, `sort_order`, `created_by`, `created_at`, `updated_at`, `deleted_at`.
  * **깊이 상한이 없습니다.** 순환은 조상 추적(visited 집합)으로만 막습니다. 부모는 같은 collection의 살아 있는 `FOLDER`여야 합니다.
* **`file_collection_assignments`** (게스트 계정 1인): `id`, `program_module_id`, `collection_id`, `participant_id`(FK `program_participants`, **nullable / ON DELETE SET NULL**), `guest_user_id`(FK `users`), `assigned_by`, `assigned_at`, `revoked_at`, `created_at`, `updated_at`, `deleted_at`.
  * 유일성: `unique (collection_id, guest_user_id) where deleted_at is null` — 한 계정은 한 파일받기에서 제출 공간을 **하나만** 가집니다(명부 줄이 여럿이어도 같습니다).
  * 명부 하드 삭제가 제출물을 함께 지우지 않도록 `SET NULL`입니다. 연결이 끊기면 판정 헬퍼가 살아 있는 명부를 요구하므로 접근은 닫히고, 기록은 남습니다.
* **`file_collection_responses`** (배정 × 문항): `id`, `program_module_id`, `assignment_id`, `node_id`, `status`, `round`, `submitted_at`, `reviewed_at`, `reviewed_by`, `created_at`, `updated_at`, `deleted_at`, `unique (assignment_id, node_id)`.
* **`file_collection_files`**: `id`, `program_module_id`, `response_id`, `round`, `storage_bucket`(기본 `file-collection`), `storage_path`(unique, 서버 생성·불변), `original_name`, `content_type`, `byte_size`, `status`(`PENDING`/`READY`), `uploaded_by`, `created_at`, `ready_at`, `deleted_at`.
* **`file_collection_comments`**: `id`, `program_module_id`, `response_id`, `round`, `author_user_id`, `author_side`(`WORKS`/`GUEST`), `body`, `created_at`, `updated_at`, `deleted_at`.

**상태 enum** `public.file_collection_status`: `NOT_SUBMITTED` → `DRAFT`(READY 파일이 한 개라도 생기면) → `SUBMITTED`(제출) → `REWORK_REQUESTED`(보완요청, `round`+1) → 다시 `DRAFT`/`SUBMITTED` → `APPROVED`.

---

## 3. 권한과 인가

* **표 권한**: 여섯 표 모두 `authenticated`에 **SELECT만**. `anon`·`service_role`에는 아무 권한도 없고 `TRUNCATE`·`REFERENCES`·`TRIGGER`도 없습니다. 쓰기는 전부 `SECURITY DEFINER` RPC를 지납니다. DELETE 정책은 없습니다(전부 소프트 삭제, 배정은 `revoked_at`).
* **판정 헬퍼**(`app` 스키마, `authenticated`에 EXECUTE — RLS 정책은 **호출자 권한으로** 평가되므로 EXECUTE가 없으면 SELECT 자체가 막힙니다. 인가는 헬퍼 내부가 합니다):
  * `app.file_collection_internal_read(uuid)` / `app.file_collection_internal_write(uuid)` — 로그인한 **내부** 사용자, 대상이 `FILE_COLLECTION` 모듈, `entity_key in ('program','ma_program')`, 해당 워크스페이스 읽기/쓰기 권한, `app.can_access_ws_program()`(M&A 비밀딜 경계 포함). FUND는 `entity_key`에서 걸러집니다.
  * `app.file_collection_guest_assignment_ids()` — 게스트 본인(`current_app_user_id()`, session_version 검사 포함), 계정 활성(`users.is_active`·`deleted_at`·게스트 종류), 명부 줄 생존·`login_status='ACTIVE'`, 모듈 개방(`app.guest_open_module_ids()` — 세션 고정 맥락 포함), 미회수·미삭제를 모두 통과한 배정. **파일받기 자체의 공개 판정은 2026-09-13에 없앴습니다** — 밖으로 나가는 시점은 모듈 공개 여부 하나가 답합니다.
  * `app.file_collection_guest_writable_assignment_ids()` — 위 집합 ∩ 모듈 `status = 'OPEN'`.
* **날짜 마감은 없습니다.** 게스트 쓰기 가능 여부는 **모듈 상태**가 결정합니다 — `OPEN`이면 쓰기·읽기, `CLOSED`면 읽기만(다운로드 인가는 계속 납니다), `DRAFT`면 내용이 닫힙니다. 자동 마감 일정 기능은 구현하지 않았습니다.

---

## 4. RPC 계약 (인자·반환)

모두 `SECURITY DEFINER`, `search_path = app, public` 고정, `authenticated`에만 EXECUTE입니다. 오류는 권한 `42501`, 업무 규칙 `P0001`, 낙관적 잠금 `40001`입니다.

**WORKS(내부) 전용**

| RPC | 인자 | 반환 | 하는 일 |
| :--- | :--- | :--- | :--- |
| `file_collection_upsert` | `p_program_module_id uuid, p_title text default '', p_guide text default null` | `uuid`(collection id) | 머리 행 생성·수정. 모듈이 `DRAFT`여도 초안은 가능 |
| `file_collection_save_node` | `p_collection_id uuid, p_node_id uuid default null, p_parent_id uuid default null, p_node_type text default 'QUESTION', p_title text default '', p_guide text default null, p_is_required boolean default false, p_sort_order integer default 0, p_expected_updated_at timestamptz default null` | `uuid`(node id) | 노드 생성(= `p_node_id` null)·수정. `p_expected_updated_at`이 오면 대조(불일치 `40001`). 이미 자료를 받은 문항은 삭제·이동·종류 변경 불가 |
| `file_collection_move_node` | `p_node_id uuid, p_parent_id uuid default null, p_sort_order integer default 0` | `void` | 부모·순서 변경. 이미 자료를 받은 문항은 삭제·이동·종류 변경 불가 |
| `file_collection_reorder_node` | `p_node_id uuid, p_direction text('up'\|'down')` | `boolean`(실제로 바뀌었는가) | **형제 순서 한 칸 이동.** `file_collections` 행을 `FOR UPDATE`로 잡고, 같은 부모(최상위는 `parent_id is null`)의 살아 있는 형제만 세어 인접한 둘을 맞바꾸고 `1..n` 재번호를 **한 UPDATE**로 끝냅니다 — 중간 상태가 없습니다. 양 끝에서 누르면 오류 없이 `false`(무변화), 방향이 `up`/`down`이 아니면 `P0001`, 이미 자료를 받은 문항은 삭제·이동·종류 변경 불가. 부모 변경은 `move_node`가 맡습니다 |
| `file_collection_delete_node` | `p_node_id uuid` | `integer`(지운 노드 수) | 자손까지 소프트 삭제. 이미 자료를 받은 문항은 삭제·이동·종류 변경 불가 |
| `file_collection_save_structure` | `p_collection_id uuid, p_nodes jsonb default '[]', p_deletes jsonb default '[]', p_level_names text[] default null, p_expected_updated_at timestamptz default null` | `jsonb` | **구성 전체를 한 번에 저장합니다(2026-09-13 신설, 미적용).** 가로 계층 격자 화면이 부르는 유일한 쓰기입니다. `p_nodes`는 `{key, parent_key, node_id, node_type, title, guide, is_required, expected_updated_at}` 배열이며 **부모가 자기보다 앞에 서야** 합니다(순환·유령 부모를 값 단계에서 막습니다). 기존 마디는 `node_id`와 `expected_updated_at`을 반드시 함께 싣고, 살아 있는 마디는 `p_nodes`나 `p_deletes` 중 **한쪽에 반드시** 있어야 합니다 — 어느 쪽에도 없으면 `40001`(내가 못 본 마디를 조용히 지우지 않습니다). 적용은 삭제 → 분류(위→아래) → 문항(자리 먼저, 종류는 마지막)의 세 걸음이며 `sort_order`는 서버가 `1..n`으로 매깁니다. 반환은 `{collection_id, created, changed, deleted, keys, updated_at, level_names, nodes}`로, `nodes`는 저장 직후 살아 있는 트리 전부입니다(화면이 조회를 기다리지 않고 기준을 다시 세웁니다). 이미 자료를 받은 문항은 삭제·이동·종류 변경 불가 |
| `file_collection_assign` | `p_collection_id uuid, p_participant_ids uuid[]` | `integer`(처리한 대상 수) | 명부 줄로 배정. 이미 회수된 대상은 **같은 행을 되살려** 이력을 잇고 명부 연결을 다시 맺습니다. 공개 이후면 응답 칸을 즉시 생성 |
| `file_collection_revoke_assignment` | `p_assignment_id uuid` | `void` | 배정 회수(소프트). 명부가 이미 정지·삭제된 대상도 회수됩니다 |
| `file_collection_publish` | `p_collection_id uuid` | `timestamptz`(published_at) | **2026-09-13부터 화면이 부르지 않습니다**(공개 판정이 모듈로 옮겨갔습니다). 함수와 `published_at` 열은 기록으로 남아 있을 뿐 어떤 판정에도 쓰이지 않습니다 |
| `file_collection_review` | `p_response_id uuid, p_decision text('APPROVED'\|'REWORK_REQUESTED'), p_comment text default null` | `file_collection_status` | `SUBMITTED` 문항만 검토. `REWORK_REQUESTED`면 `round`+1(이전 회차 파일은 보존). 코멘트가 있으면 `WORKS` 쪽으로 적재 |

**게스트(및 공용)**

| RPC | 인자 | 반환 | 하는 일 |
| :--- | :--- | :--- | :--- |
| `file_collection_register_upload` | `p_response_id uuid, p_original_name text, p_content_type text default null, p_byte_size bigint default null` | `table (file_id uuid, storage_bucket text, storage_path text)` | 업로드 자리를 예약합니다. **경로는 서버가 만듭니다** — `{module}/{assignment}/{response}/r{round}/{file_id}`. 상태 `PENDING`. 제출·승인된 문항이면 거절. `p_byte_size`는 신고값일 뿐이며 범위(0 초과 100MB 이하)만 봅니다 |
| `file_collection_commit_upload` | `p_file_id uuid` | `uuid`(file id) | **DB가 `storage.objects`를 직접 읽어** 정확한 버킷·이름의 실물 존재·크기·형식을 확인하고 `READY`로 올립니다. 크기·형식은 실물이 답합니다(클라이언트가 크기를 보내는 인자가 없습니다). 본인 파일·쓰기 가능 배정·현재 회차·미제출 상태를 모두 재확인하며, 이미 `READY`면 멱등 |
| `file_collection_remove_file` | `p_file_id uuid` | `void` | **현재 회차의 미제출 파일만** 소프트 삭제. 게스트는 본인 업로드만, 내부는 모듈 쓰기 권한으로. 제출·승인 문항과 지난 회차는 **누구도** 내리지 못하며 되살리기도 없습니다. `audit_logs`에 `FILE_COLLECTION_FILE_REMOVE` 적재 |
| `file_collection_submit` | `p_response_id uuid` | `file_collection_status`(`SUBMITTED`) | **문항 단위 제출.** 현재 회차에 `READY` 파일이 1개 이상이어야 하며, 다른 문항이 비어 있어도 막히지 않습니다. 전체 필수 진행률은 관제 화면이 응답 목록에서 파생합니다 |
| `file_collection_add_comment` | `p_response_id uuid, p_body text` | `uuid`(comment id) | `author_user_id`·`author_side`는 서버가 적습니다(게스트가 WORKS를 사칭할 수 없습니다). 게스트는 쓰기 가능 배정일 때만 |
| `file_collection_authorize_download` | `p_file_id uuid` | `table (storage_bucket text, storage_path text, original_name text, content_type text)` | **권한 판정과 경로 회신만** 합니다. 게스트는 자기 배정(읽기 폭과 동일), 내부는 모듈 읽기 권한. `READY`가 아니면 거절 |

**동시성**: 구조 변경(`save_node`/`move_node`/`delete_node`)·`assign`·`publish`는 같은 `file_collections` 행을, 응답 계열(`register_upload`/`commit_upload`/`remove_file`/`submit`/`review`/`add_comment`)은 해당 `file_collection_responses` 행을 `FOR UPDATE`로 잡고 상태·회차를 **잠근 뒤 다시 읽습니다**. 잠금 순서는 언제나 collection → response입니다.

---

## 5. 업로드·다운로드 흐름 (Edge 계약 — 구현·배포됨, §9)

Edge Function은 **하나**입니다 — `file-collection-file`. 함수를 업로드·다운로드로 쪼개지 않은 이유는 셋이 같은 버킷·같은 호출자 판정·같은 service_role 경계를 쓰기 때문입니다. 갈리는 것은 본문의 `action` 하나(`sign`·`commit`·`download`)뿐입니다.

* **요청 본문**: `{ action: 'sign', responseId, fileName, contentType?, byteSize }` 또는 `{ action: 'commit' | 'download', fileId }`. `action`이 이 셋이 아니면 `unsupported_action`, 본문 상한은 8KB입니다. 크기 상한은 **100MB**(`MAX_BYTE_SIZE`)이며 버킷(`storage.buckets.file_size_limit = 104857600`)·`register_upload`·`commit_upload`가 같은 값을 각자 다시 봅니다.
* **`sign`**: 호출자 JWT 클라이언트로 `file_collection_register_upload` 호출 → 받은 `bucket`·`path`가 비공개 버킷 `file-collection`의 안전한 경로인지 대조 → **그 경로 그대로** service_role로 업로드 서명 URL 발급(`upsert: false`).
* **`commit`**: 호출자 JWT로 `file_collection_commit_upload(p_file_id)` 호출이 전부입니다. **인자는 `p_file_id` 하나**이며 크기·형식을 클라이언트가 보내는 자리가 없습니다 — 실물이 답합니다. 실물이 없거나 크기가 어긋나면 `PENDING`으로 남고 제출 계산에 들지 않습니다.
* **`download`**: 호출자 JWT로 `file_collection_authorize_download`를 먼저 호출(거절되면 끝) → `access_logs` 적재 **성공 후에만** service_role로 **60초** 서명 URL 발급. 적재가 실패하면 발급하지 않습니다 — 로그 없는 반출은 없습니다.
* **service_role의 폭**: Storage 서명, 호출자 신원 조회(`users`), `access_logs` 적재 셋뿐입니다. 신규 6개 표에는 service_role DML이 없습니다(읽기는 호출자 JWT, 쓰기는 RPC) — 그래서 이 표들의 `service_role` 권한은 0입니다.

---

## 6. 화면이 쓰는 조회 (구현됨 — 브라우저 확인 통과)

* **WORKS 편집**: `file_collections`(모듈 id로 1행, `level_names` 포함) → `file_collection_nodes`(`collection_id`, `deleted_at is null`, `parent_id`·`sort_order` 정렬)를 읽어 **가로 계층 격자**를 그립니다(2026-09-13 전환 — 종전 들여쓰기 트리와 폴더·문항 창을 대신합니다). 부모 id 트리를 깊이순 목록으로 펴는 어댑터와 조작은 `apps/works/src/features/program/fileCollection/structureDraft.ts`, 조회·저장·충돌 판단은 `structureEditor.ts`가 갖고, 표 자체는 품의와 공용인 `HierarchyTable`입니다. 편집은 초안에서 일어나고 저장은 `file_collection_save_structure` 한 번입니다. `published_at`이 서면 편집 UI를 잠급니다(서버도 같은 폭으로 막습니다).
* **WORKS 관제**: `file_collection_assignments`(`deleted_at is null`) × `file_collection_responses`(`deleted_at is null`)를 배정별로 묶어 진행률을 **화면에서 파생**합니다. 저장된 진행률 컬럼은 없습니다. 셈은 `packages/master-data/src/fileCollection.ts` 한 벌이며 WORKS·GUEST가 같은 함수를 읽습니다.
  * **분모는 언제나 문항 수**입니다 — 응답 칸이 아직 서지 않은 조합(공개 직후·배정 직후)도 미제출 줄로 세웁니다.
  * **다섯 상태를 한 칸도 합치지 않습니다.** 요약과 대상별·문항별 표는 `검토 대기`·`보완`·`완료`·`작성 중`(`DRAFT`)·`미제출`(`NOT_SUBMITTED`)을 각각 세며, 다섯의 합이 (살아 있는 대상 × 문항)과 같습니다. 작성 중을 미제출에 합치면 "손도 안 댄 대상"과 "쓰다 만 대상"이 같은 모양이 되어 독촉 문구를 고를 수 없습니다.
  * 회수된 배정은 **대상별 목록에는 남고**(낸 자료가 사라지면 안 됩니다) 문항별 분모와 요약에서는 빠집니다.
* **WORKS 검토**: 응답 1행 + 그 응답의 `file_collection_files`(`deleted_at is null`, `round` 내림차순) + `file_collection_comments`. 검토는 `SUBMITTED`인 응답에만 뜹니다.
* **GUEST**: 자기 배정 1행 → 트리(`file_collection_nodes`) + 자기 응답(`file_collection_responses`) + 파일. RLS가 이미 남의 것을 지우므로 화면은 추가 필터 없이 그대로 그립니다. 모듈이 `CLOSED`면 쓰기 버튼을 감추되, **막는 것은 서버입니다**.
  * 제출은 **문항 단위**입니다 — 한 문항의 파일을 올리고 그 문항만 냅니다. 다른 문항이 비어 있어도 막히지 않습니다.
  * 지난 회차는 **이력으로 남습니다**(`filesByRound`, 최신 회차가 위). 보완 요청 뒤에도 무엇을 처음 냈는지가 남아야 검토 근거가 섭니다.
  * 게스트 쪽 '아직 시작 전' 문구는 `NOT_SUBMITTED` 하나만 가리킵니다 — 작성 중(`DRAFT`)은 그 말에 들지 않습니다.

---

## 7. 남은 일

* 알림(배정·보완요청·승인)은 이번 범위에 없습니다.
* 동시 편집 경합(두 세션이 같은 collection을 동시에 바꾸는 경우)은 잠금 설계만 있고 **실제 병렬 실행 검증은 하지 않았습니다** — 단일 세션 pgTAP으로는 재현할 수 없습니다.
* 실제 로그인 계정으로의 **업로드 E2E**는 아직입니다(§9 기준).
* 프론트엔드 AWS(S3·CloudFront) 배포는 **이번 범위가 아닙니다** — 사용자 확정으로 DB·Edge만 반영하고 화면 확인은 로컬(localhost)에서 했습니다.

---

## 8. 검증 현황과 공백 (2026-09-13 기준)

아래 숫자는 이 시점의 계수이며 **작업이 이어지는 동안 늘어납니다** — 인용 전에 직접 돌려 확인합니다.

| 대상 | 경로 | 상태 |
| :--- | :--- | :--- |
| DB 격리·계약 | `supabase/tests/file_collection_isolation_test.sql` | 단언 **113개** 통과(순서 이동 RPC 단언 10개 포함). 격리 러너 전체는 **22파일 693단언** |
| 권한 생성물 목록 | `supabase/tests/authorization_inventory_test.sql` | 파일 **전체가 단언 56개**이며(파일받기 전용 단언 수가 아닙니다) 그 안에 `file_collection_reorder_node(uuid, text)` 등재가 들어갑니다 |
| Edge Function | `supabase/functions/file-collection-file/handler.test.ts`, `validation.test.ts` | 단언 **56개** 통과 |
| WORKS 순수 계산 | `apps/works/src/features/program/fileCollection/fileCollectionDomain.test.ts`, `collectionTree.test.ts` | 루트 WORKS 스위트(**98파일 1,232건**) 안에서 통과 |

위 숫자는 Codex가 **독립적으로 직접 실행**해 얻은 값입니다(루트 `test` — WORKS 1,232 · GUEST 236/9파일 · `test:baseline` 94/18스위트, 루트 `typecheck` 6개 전부, `build` 4개, `typecheck:functions`, 격리 DB 러너 22파일 693단언, 베이스라인 해시 기존 380건 불변·신규 2건).

* **브라우저 확인(픽스처) 통과**: `node scripts/file-collection-browser/run.mjs`가 320·375·768·1280·1440 다섯 폭에서 **60/60 통과, 콘솔 오류 0**입니다(보고서 `file-collection-browser-2026-09-13T11-44-04-814Z/report.json`). 이어진 **수동 스크린샷 검토**에서 WORKS 카드 제목·이메일이 좁은 폭에서 눌리는 것을 찾아, `CollectionStructureTab`의 동작 버튼과 `CollectionTargetsTab`의 머리글 동작을 본문 툴바로 내리고 이메일 열에 `16rem`을 주었습니다. 수정 후 Codex 재실행(`--only works`)이 **20/20 통과, 콘솔 오류 0**입니다(보고서 `file-collection-browser-2026-09-13T11-46-51-039Z/report.json`). GUEST·WORKS 파일명 줄은 전체 폭 행으로 고쳤고, 스크린샷에서 공용 토큰·`Card`·`Badge`·`Button`·표·`Modal` 사용과 **페이지·모달 넘침 없음**(표 내부 가로 스크롤은 의도한 동작)을 확인했습니다.
* **하네스가 무엇을 보는지**: 픽스처 브라우저는 **실제 컴포넌트를 목(mock) 데이터로 렌더**합니다 — 살아 있는 인증·Storage·RLS를 지나지 않습니다.
* **린트·빌드**: 루트 `lint` **오류 0 · 경고 46**, `typecheck` 6개와 `build` 4개 통과입니다(하네스의 미사용 변수 오류는 해소되었습니다).
* **소스 기준의 한계**: 위 통과 기록은 전부 소스·격리 환경 기준입니다. 운영 반영 사실과 그 확인 범위는 §9가 소유합니다.

---

## 9. 운영 반영 (2026-09-13, DB·Edge 적용 완료 — 이 절이 사실의 소유자입니다)

* **적용 대상**: 연결된 프로젝트 `alopryrwakfpkgjumhba`(works 운영, Seoul) 하나입니다. 적용한 것은 `20260913210000_file_collection_module_type.sql`과 `20260913210500_file_collection_schema.sql` **둘뿐**이며, 각각 **별도 트랜잭션**으로 실행하고 마이그레이션 이력에 기록했습니다. 무관한 예산·지출 계열 두 건(`...190000`/`...200000`)은 **적용하지 않고 그대로 둡니다**.
* **동일성 대조(Codex 직접 확인)**: 이력에 기록된 원본과 로컬 파일의 MD5가 같습니다 — `210000` `6ae9c852918e275c3045bf2314feb4f2`, `210500` `2e072e9cc88d728e95cfb0c22cee4737`.
* **적용 결과 확인**: 전용 표 6종 모두 RLS 켜짐, `authenticated`는 **SELECT만**, `anon`·`service_role`에 DML 없음, 공개 RPC 15종 등재, `file-collection` 버킷 **비공개·100MB 상한**, ADMIN 카탈로그에서 `project`·`mna`만 켜지고 visibility `GUEST_ONLY`입니다.
* **Edge Function**: `file-collection-file`이 **ACTIVE v1**입니다. `supabase/config.toml`에 `verify_jwt = false`로 두었고, **인증은 함수 자체 핸들러가 그대로 강제**합니다(플랫폼 검증을 끈 자리를 핸들러가 메웁니다).
* **실동작 탐침(Codex 직접 실행)**: `localhost:5175` origin의 `OPTIONS`가 `200`과 올바른 `Access-Control-Allow-Origin`을 답하고, **무인증·위조 토큰 `POST`는 `401`**이며 서명 URL을 내주지 않습니다.
* **화면 확인**: 로컬 `5173`(WORKS)·`5175`(GUEST) `/login`이 각각 `HTTP 200`, JS 오류 없음, 375px에서 넘침 없음입니다.
* **사전 스냅샷**: `C:/Users/Admin/AppData/Local/Temp/fc-deploy-20260913/snapshot-pre`에 `schema-pre.sql`·`migration-history.json`·`objects-pre.json`을 남겼습니다. **이는 스키마·메타데이터 스냅샷이며 전체 사용자 데이터 백업이 아닙니다.** 별도로 적용 전에 관리형 백업을 조회해 최근 `COMPLETED` 시점이 `2026-09-12T18:04:30Z`(KST 2026-09-13 03:04:30), `walg_enabled=true`, `pitr_enabled=false`임을 확인했습니다.
* **운영상 제약(기록)**: 로컬 `SUPABASE_DB_URL` 직접 연결은 인증에 실패해, 적용은 CLI의 관리 API 경로로 수행했습니다. **자격증명은 바꾸지 않았습니다.**
* **알려진 어드바이저 공백(전부 통과가 아닙니다)**: 어드바이저 점검은 `exit 1`로 끝났습니다. `ERROR` 2건은 이번에 건드리지 않은 객체(`trade_partners_directory`, `portable_assets`)의 `security_definer_view`이고, `WARN` 115건 중 15건은 파일받기 RPC의 `authenticated_security_definer_function_executable`입니다 — **승인된 롤 + 함수 내부 가드라는 계약대로의 의도된 결과**이며 이를 이유로 권한을 자동 변경하지 않았습니다.
* **남은 공백**: 실제 인증 계정의 **업로드 E2E**와 **병렬 세션 동시성 시험**은 하지 않았습니다(§7, `E2E-1`). 커밋·푸시도 하지 않았습니다.
