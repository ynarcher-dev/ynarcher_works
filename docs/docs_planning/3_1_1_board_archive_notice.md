# [3.1.1] OFFICE 게시판·자료실·공지사항 구조 설계

> **상위 문서**: [3_1_workspace_hub.md](./3_1_workspace_hub.md) (OFFICE 화면/데이터 연동 규격)
> **연관 규칙**: [11_migration_security_gate.md](../docs_dev/11_migration_security_gate.md) · [2_app_layout_navigation.md](../docs_design/2_app_layout_navigation.md)

---

## 1. 목적

OFFICE의 게시 기능을 **게시판(POST)** 과 **자료실(ARCHIVE)** 두 종류로 확정하고, 공지사항을 별도 게시판이 아닌 **게시글 플래그 기반의 조회 뷰**로 재정의합니다. 게시판과 자료실 모두 운영 중 필요할 때마다 생성·확장할 수 있는 레지스트리 구조를 전제로 합니다.

현재 구현은 `apps/works/src/features/hub/boardStore.ts`의 zustand 인메모리 데모이며 DB 테이블이 존재하지 않습니다. 본 문서는 이를 물리 스키마로 이행하기 위한 설계 정본입니다.

---

## 2. 종류 구분 (`board_kind`)

| 항목 | `POST` (게시판) | `ARCHIVE` (자료실) |
| :--- | :--- | :--- |
| 상세페이지 | 있음 (제목 클릭 → 본문·첨부·댓글) | **없음** (목록 행에서 즉시 다운로드) |
| 목록 1행의 의미 | 게시글 1건 | **파일 1건** |
| 첨부 | 0~N개 | **정확히 1개(필수)** |
| 목록 노출 정보 | 제목·작성자·게시일 | 자료명·요약(약 40자)·용량·게시일·다운로드 버튼 |
| 댓글 | 사용 | 미사용 |
| 게시판 내 고정(`pinned`) | 가능 | 가능 |
| 전체 공지(`global_notice`) | 가능 | **불가** |
| 생성 | 관리자가 필요 시 무제한 생성 | 관리자가 필요 시 무제한 생성 |

* **자료실은 1행 1파일입니다**: 파일 여러 개를 배포할 때는 여러 행으로 등록합니다. 다운로드 버튼이 항상 단일 액션이 되어 상세페이지 없이도 동작이 모호해지지 않습니다.
* **자료실도 상단 고정을 허용합니다**: 자주 쓰는 양식·최신 규정을 목록 최상단에 두는 용도로 게시판보다 오히려 활용도가 높습니다.

---

## 3. 공지사항 = 게시판이 아니라 뷰

공지사항은 `boards` 테이블에 행으로 존재하지 않습니다. `global_notice = true`인 게시글을 여러 게시판에서 모아 보여주는 **가상 페이지**입니다.

* **원본 단일화**: 공지 목록의 항목을 클릭하면 원본 게시판의 상세페이지로 이동합니다. 사본을 만들지 않으므로 원본 수정·삭제가 즉시 반영됩니다. (현행 데모의 `${id}-notice` 사본 생성 방식은 폐기합니다.)
* **권한 자동 정합**: 공지 목록은 게시판 원본을 조회하므로, 게시판별 열람 권한이 그대로 적용되어 별도 RLS 설계가 필요 없습니다.
* **자료실 제외**: `ARCHIVE` 게시판의 게시글은 전체 공지가 될 수 없습니다. 작성 폼에서 체크박스를 노출하지 않고, DB `CHECK` 제약으로도 강제합니다.

### 3.1 두 종류의 공지

| 구분 | 컬럼 | 노출 위치 | 영향 범위 | 권한 |
| :--- | :--- | :--- | :--- | :--- |
| 게시판 공지 | `posts.pinned` | 소속 게시판 목록 최상단 | 해당 게시판 열람자 | 게시판 쓰기 권한자 |
| 전체 공지 | `posts.global_notice` | OFFICE `공지사항` 메뉴 | 전사 | **관리자(`notice_scope`)** |

두 플래그는 서로 독립입니다. 작성 폼에서 "전체 공지"를 체크하면 "게시판 상단 고정"을 기본 선택으로 켜되, 사용자가 해제할 수 있습니다.

> [!NOTE]
> 모든 공지는 반드시 어떤 게시판에 소속되므로, 마땅한 소속처가 없는 전사 공지를 위해 기본 게시판 `전사 알림`을 시드합니다.

---

## 4. 사이드바 구조

OFFICE 사이드바는 게시 영역을 3블록으로 구성합니다.

```
경영지원
  대시보드 / AI 에이전트 / 임직원·부서·지사 정보 / 캘린더 / 회의실 / 전자결재 / 거래처
────────────
공지사항                        ← 고정 라우트(뷰), 게시판 레지스트리와 무관
────────────
게시판                          ← 상위 메뉴 (kind = POST)
  전사 알림 / 인사이트 / (생성분…)
자료실                          ← 상위 메뉴 (kind = ARCHIVE)
  공용자료실 / (생성분…)
```

* **그룹핑 축은 `kind` 하나입니다**: 기존 `pinned`(고정 게시판/일반 게시판) 기반 그룹은 폐기합니다. 게시판 레벨의 `pinned` 개념은 사라지고, `pinned`는 **게시글** 속성으로만 남습니다.
* **`dynamicKey`**: `'boards' | 'pinnedBoards'` → **`'boards' | 'archives'`** 로 교체합니다.
* **정렬**: 각 그룹 내 순서는 `boards.sort_order` 오름차순입니다. 게시판이 계속 늘어나는 구조이므로 생성 순서 고정이 아닌 관리자 조정 가능한 정렬 축을 둡니다.

---

## 5. 물리 스키마

### 5.1 `public.boards`

| 컬럼 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | uuid PK | `gen_random_uuid()` |
| `slug` | text UNIQUE NOT NULL | `?tab=` 라우팅 키 |
| `label` | text NOT NULL | 표시명 |
| `kind` | `public.board_kind` NOT NULL | `POST` \| `ARCHIVE` |
| `icon` | text NOT NULL | `boardIcons.ts` 키, 기본 `clipboard` |
| `is_system` | boolean NOT NULL default false | 기본 게시판(비활성화만 가능, 구분 변경 불가) |
| `is_active` | boolean NOT NULL default true | 소프트 비활성화 |
| `sort_order` | int NOT NULL default 0 | 사이드바 정렬 |
| `read_scope` | `public.board_scope` NOT NULL default `ALL` | 열람 범위 |
| `write_scope` | `public.board_scope` NOT NULL default `ALL` | 작성 범위 |
| `notice_scope` | `public.board_scope` NOT NULL default `ADMIN` | 전체 공지 등록 범위 |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | soft delete |

### 5.2 `public.board_posts`

| 컬럼 | 타입 | 설명 |
| :--- | :--- | :--- |
| `id` | uuid PK | |
| `board_id` | uuid NOT NULL → `boards(id)` | |
| `title` | text NOT NULL | 게시판=제목 / 자료실=자료명 |
| `summary` | text | 자료실 목록에 노출하는 약 40자 요약 |
| `body` | text | 게시판 본문(리치텍스트 HTML). 자료실은 미사용 |
| `author_id` | uuid NOT NULL → `users(id)` | 서버 스탬프 |
| `pinned` | boolean NOT NULL default false | 게시판 내 최상단 고정 |
| `global_notice` | boolean NOT NULL default false | 공지사항 메뉴 노출 |
| `notice_until` | date | 전체 공지 만료일(NULL이면 무기한) |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | soft delete |

### 5.3 제약

* **자료실 공지 금지**: `global_notice = true`인 행의 소속 게시판이 `ARCHIVE`가 될 수 없도록 강제합니다. 부모 참조가 필요하므로 `CHECK` 단독으로는 불가하며, 비정규화 컬럼 `board_kind`를 `board_posts`에 복제하고(삽입/수정 트리거로 동기화) `CHECK (not (global_notice and board_kind = 'ARCHIVE'))`로 처리합니다.
* **자료실 첨부 1건**: 애플리케이션 및 등록 RPC에서 강제하고, 목록 조회 시 첨부 0건인 자료실 행은 노출하지 않습니다.
* **시스템 게시판 보호**: `is_system = true` 행의 `DELETE`는 정책 부재로 차단되며, `kind`·`slug` 변경은 트리거로 거부합니다.

### 5.4 첨부

기존 `public.attachments`를 재사용하며 `target_type = 'BOARD_POST'`, `target_id = board_posts.id`로 연결합니다. 신규 테이블을 만들지 않습니다.

* **다운로드 경로**: 자료실은 상세페이지 없이 다운로드가 유일한 소비 경로이므로 반드시 `material-download` Edge Function을 경유하며, `access_logs`에 이력이 적재됩니다. 클라이언트 Signed URL 발급은 이미 잠겨 있습니다([20260716130300](../../supabase/migrations/20260716130300_attachments_storage_download_lock.sql)).

### 5.5 시드(기본 게시판)

| slug | label | kind | is_system | 비고 |
| :--- | :--- | :--- | :--- | :--- |
| `notices-general` | 전사 알림 | `POST` | true | 전체 공지의 기본 소속처 |
| `insights` | 인사이트 | `POST` | true | 기존 데모 승계 |
| `files` | 공용자료실 | `ARCHIVE` | true | 기존 데모 승계 |

기존 데모의 `notices` 게시판은 물리 행으로 이행하지 않습니다. 해당 게시글은 `전사 알림` 게시판에 `global_notice = true`로 이관합니다.

---

## 6. 권한(`board_scope`)

| 값 | 의미 | 이번 범위 |
| :--- | :--- | :--- |
| `ALL` | 전 임직원(외부 게스트 제외) | 구현 |
| `ADMIN` | 관리자만 | 구현 |
| `DEPT` | 특정 부서 한정 | **값만 예약, 미구현** |

* **RLS 판정은 `app.*` 헬퍼를 경유합니다**: 외부 역할(`external_startup`, `external_expert`, `temporary_guest`)은 게시판 전체에서 차단하며, 관리자 판정은 `app.is_admin()`을 사용합니다.
* **`DEPT`는 부서 연결 테이블이 필요**하므로 이번 마이그레이션에서는 값만 정의하고 정책 분기는 두지 않습니다. 향후 `board_departments` 연결 테이블 추가로 확장합니다.

---

## 7. 이행 시 유의사항

* **프론트 회귀 범위**: `OfficePage`, `BoardWorkspace`, `BoardPanel`, `BoardAdminPanel`, `DashboardPanel`, `WorksLayout`, `navigation.ts`, `boardStore.ts`, `boardPostStore.ts`가 모두 영향권입니다.
* **자료실 전용 화면 신설**: `BoardWorkspace`가 `kind`에 따라 분기하되, 자료실 목록은 상세 진입이 없는 별도 컴포넌트로 분리합니다(컴포넌트 250줄 상한 준수).
* **관리 화면 확장**: 게시판 생성 모달에 `구분(게시판/자료실)` 선택을 추가하고, 목록 테이블에 구분·정렬 순서 컬럼을 노출합니다.

---

## 8. 테스트 기준

* 자료실 게시판에서 전체 공지 체크박스가 노출되지 않고, 우회 삽입 시 DB 제약으로 거부된다.
* 전체 공지로 등록한 게시글이 공지사항 메뉴에 나타나고, 클릭 시 원본 게시판 상세로 이동한다.
* 원본 게시글을 소프트 삭제하면 공지사항 메뉴에서도 즉시 사라진다.
* `notice_until`이 지난 전체 공지는 공지사항 목록에서 제외된다.
* 자료실 목록의 다운로드가 `access_logs`에 적재된다.
* 외부 게스트 계정으로 `boards`·`board_posts` 직접 조회 시 0건을 반환한다.
* 비활성화(`is_active = false`)한 게시판은 사이드바와 라우팅에서 사라지고 직접 URL 접근도 차단된다.
