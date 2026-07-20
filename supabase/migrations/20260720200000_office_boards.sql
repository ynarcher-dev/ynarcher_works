-- =====================================================================
-- [Phase 5] OFFICE 게시판·자료실·공지사항 데이터 계층
-- 설계 정본: docs/docs_planning/3_1_1_board_archive_notice.md
--
-- 핵심 구조:
-- - 게시 기능은 게시판(`POST`)과 자료실(`ARCHIVE`) 두 종류(`board_kind`)뿐이며,
--   둘 다 운영 중 필요할 때마다 생성하는 레지스트리(`public.boards`) 항목이다.
-- - 공지사항은 게시판 행이 아니라 `board_posts.global_notice = true` 게시글을
--   모아 보여주는 조회 뷰다. 사본을 만들지 않으므로 원본 수정/삭제가 즉시 반영된다.
-- - 게시판 내 최상단 고정(`pinned`)과 전체 공지(`global_notice`)는 독립 플래그이며
--   권한 레벨이 다르다(게시판 쓰기 권한자 vs `notice_scope`).
-- - 자료실은 상세페이지가 없고 목록 1행 = 파일 1건이므로 전체 공지가 될 수 없다.
--
-- 첨부는 기존 public.attachments를 재사용한다(target_type = 'BOARD_POST').
-- 다운로드는 material-download Edge Function 경유이며 access_logs에 적재된다
-- (20260716130300_attachments_storage_download_lock.sql에서 클라이언트 Signed URL 차단).
--
-- 근거: 20260707240000_entity_feedback.sql(스탬프/RLS 패턴),
--       20260705120200_rls_helpers.sql(app.* 헬퍼), 20260705120300_support_tables.sql(attachments)
-- =====================================================================

-- 1. 열거형 ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'board_kind') then
    create type public.board_kind as enum ('POST', 'ARCHIVE');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_scope') then
    -- DEPT는 부서 연결 테이블이 필요하므로 이번 단계에서는 값만 예약한다.
    -- 정책상 미구현 값은 Default Deny 원칙에 따라 admin 외 접근을 허용하지 않는다.
    create type public.board_scope as enum ('ALL', 'ADMIN', 'DEPT');
  end if;
end $$;

-- 2. 게시판 레지스트리 ---------------------------------------------------
create table if not exists public.boards (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,                 -- `?tab=` 라우팅 키
  label         text not null,
  kind          public.board_kind not null,
  icon          text not null default 'clipboard',    -- boardIcons.ts 키
  is_system     boolean not null default false,       -- 기본 게시판(비활성화만 가능, slug/kind 변경 불가)
  is_active     boolean not null default true,        -- 소프트 비활성화
  sort_order    integer not null default 0,           -- 사이드바 정렬
  read_scope    public.board_scope not null default 'ALL',
  write_scope   public.board_scope not null default 'ALL',
  notice_scope  public.board_scope not null default 'ADMIN',  -- 전체 공지 등록 권한
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_boards_kind_order
  on public.boards (kind, sort_order, label);

-- 3. 게시글 -------------------------------------------------------------
create table if not exists public.board_posts (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references public.boards(id),
  -- 소속 게시판의 kind 비정규화. CHECK는 부모 테이블을 참조할 수 없으므로
  -- 트리거로 동기화한 뒤 자료실 전체 공지 금지를 DB에서 강제한다.
  board_kind     public.board_kind not null,
  title          text not null,                       -- 게시판=제목 / 자료실=자료명
  summary        text,                                -- 자료실 목록에 노출하는 요약(약 40자)
  body           text,                                -- 게시판 본문(리치텍스트). 자료실은 미사용
  author_id      uuid references public.users(id),
  author_name    text,                                -- users RLS 우회 표시용 비정규화(서버 스탬프)
  pinned         boolean not null default false,      -- 게시판 내 최상단 고정
  global_notice  boolean not null default false,      -- 공지사항 메뉴 노출
  notice_until   date,                                -- 전체 공지 만료일(NULL이면 무기한)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint board_posts_archive_no_notice
    check (not (global_notice and board_kind = 'ARCHIVE'))
);
create index if not exists idx_board_posts_board
  on public.board_posts (board_id, pinned desc, created_at desc);
create index if not exists idx_board_posts_global_notice
  on public.board_posts (created_at desc)
  where global_notice and deleted_at is null;

-- 4. 접근 판정 헬퍼 -------------------------------------------------------
-- 게시판 단위 범위(scope) 판정. RLS를 우회해 boards를 읽어야 하므로 SECURITY DEFINER이며,
-- 호출자 권한 확인(app.can_read_workspace / can_write_workspace)을 함수 내부에서 먼저 수행한다.
-- 외부 역할(external_startup/external_expert/temporary_guest)은 office 워크스페이스
-- 권한이 없으므로 여기서 전부 차단된다.

create or replace function app.can_read_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.boards b
     where b.id = p_board_id
       and b.deleted_at is null
       and b.is_active
       and b.read_scope = 'ALL'
       and app.can_read_workspace('office')
  );
$$;

create or replace function app.can_write_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.boards b
     where b.id = p_board_id
       and b.deleted_at is null
       and b.is_active
       and b.write_scope = 'ALL'
       and b.read_scope = 'ALL'
       and app.can_write_workspace('office')
  );
$$;

-- 전체 공지 등록 권한. 기본값 notice_scope = 'ADMIN'이므로 사실상 관리자 전용이며,
-- 게시판을 'ALL'로 열어둔 경우에만 office 쓰기 권한자에게 허용된다.
create or replace function app.can_notice_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.boards b
     where b.id = p_board_id
       and b.deleted_at is null
       and b.is_active
       and b.kind = 'POST'
       and b.notice_scope = 'ALL'
       and app.can_write_workspace('office')
  );
$$;

revoke all on function app.can_read_board(uuid) from public;
revoke all on function app.can_write_board(uuid) from public;
revoke all on function app.can_notice_board(uuid) from public;
grant execute on function app.can_read_board(uuid) to authenticated;
grant execute on function app.can_write_board(uuid) to authenticated;
grant execute on function app.can_notice_board(uuid) to authenticated;

-- 5. RLS ----------------------------------------------------------------
alter table public.boards enable row level security;
alter table public.board_posts enable row level security;

-- 게시판 레지스트리: 열람은 office 권한자 중 read_scope='ALL' 게시판만.
-- 비활성/삭제 게시판과 ADMIN 범위 게시판은 관리자에게만 보인다.
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards for select
  using (
    app.is_admin() or (
      deleted_at is null
      and is_active
      and read_scope = 'ALL'
      and app.can_read_workspace('office')
    )
  );

-- 게시판 생성/변경은 ADMIN(게시판 관리 콘솔) 전용.
drop policy if exists boards_insert on public.boards;
create policy boards_insert on public.boards for insert
  with check (app.is_admin());

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards for update
  using (app.is_admin())
  with check (app.is_admin());

-- 게시글: 소속 게시판 접근 권한을 그대로 따른다.
drop policy if exists board_posts_select on public.board_posts;
create policy board_posts_select on public.board_posts for select
  using (
    app.can_read_board(board_id)
    and (deleted_at is null or app.is_admin())
  );

drop policy if exists board_posts_insert on public.board_posts;
create policy board_posts_insert on public.board_posts for insert
  with check (
    app.can_write_board(board_id)
    and (not global_notice or app.can_notice_board(board_id))
  );

-- 수정/소프트삭제: 작성자 본인 또는 admin. 전체 공지 전환은 별도 권한을 다시 확인한다.
drop policy if exists board_posts_update on public.board_posts;
create policy board_posts_update on public.board_posts for update
  using (
    app.can_write_board(board_id)
    and (app.is_admin() or author_id = app.current_app_user_id())
  )
  with check (
    app.can_write_board(board_id)
    and (app.is_admin() or author_id = app.current_app_user_id())
    and (not global_notice or app.can_notice_board(board_id))
  );

-- 6. 트리거 --------------------------------------------------------------
drop trigger if exists trg_boards_updated_at on public.boards;
create trigger trg_boards_updated_at
  before update on public.boards
  for each row execute function app.set_updated_at();

drop trigger if exists trg_board_posts_updated_at on public.board_posts;
create trigger trg_board_posts_updated_at
  before update on public.board_posts
  for each row execute function app.set_updated_at();

-- 기본 게시판 보호: slug/kind는 불변, 물리 삭제는 정책 부재로 이미 차단됨.
create or replace function app.guard_system_board()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if OLD.is_system then
    if NEW.slug is distinct from OLD.slug then
      raise exception '기본 게시판의 slug는 변경할 수 없습니다.';
    end if;
    if NEW.kind is distinct from OLD.kind then
      raise exception '기본 게시판의 구분(게시판/자료실)은 변경할 수 없습니다.';
    end if;
    if NEW.deleted_at is not null then
      raise exception '기본 게시판은 삭제할 수 없습니다. 비활성화만 가능합니다.';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_boards_guard_system on public.boards;
create trigger trg_boards_guard_system
  before update on public.boards
  for each row execute function app.guard_system_board();

-- 게시글 작성자 스탬프 + 소속 게시판 kind 동기화.
create or replace function app.stamp_board_post()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_kind public.board_kind;
begin
  if NEW.author_id is null then
    NEW.author_id := app.current_app_user_id();
  end if;
  if NEW.author_name is null and NEW.author_id is not null then
    select u.name into NEW.author_name from public.users u where u.id = NEW.author_id;
  end if;

  -- board_kind는 클라이언트 입력을 신뢰하지 않고 항상 원장에서 다시 읽는다.
  select b.kind into v_kind from public.boards b where b.id = NEW.board_id;
  if v_kind is null then
    raise exception '존재하지 않는 게시판입니다.';
  end if;
  NEW.board_kind := v_kind;

  return NEW;
end $$;

drop trigger if exists trg_board_posts_stamp on public.board_posts;
create trigger trg_board_posts_stamp
  before insert or update on public.board_posts
  for each row execute function app.stamp_board_post();

-- 7. 기본 게시판 시드 -----------------------------------------------------
-- `전사 알림`은 모든 전체 공지가 소속될 기본 게시판이다(공지사항은 게시판이 아니므로
-- 마땅한 소속처가 없는 전사 공지의 홈 역할을 한다).
insert into public.boards (slug, label, kind, icon, is_system, sort_order)
values
  ('notices-general', '전사 알림',   'POST',    'megaphone', true, 10),
  ('insights',        '인사이트',    'POST',    'lightbulb', true, 20),
  ('files',           '공용자료실',  'ARCHIVE', 'folder',    true, 10)
on conflict (slug) do nothing;

-- 8. 코멘트 --------------------------------------------------------------
comment on table public.boards is
  'OFFICE 게시 레지스트리. kind=POST(게시판, 상세페이지 있음) / ARCHIVE(자료실, 1행=1파일 즉시 다운로드). 소프트 비활성화(is_active)만 허용';
comment on table public.board_posts is
  '게시판·자료실 게시글. pinned=게시판 내 최상단 고정, global_notice=공지사항 메뉴 노출(자료실 금지). 첨부는 attachments(target_type=BOARD_POST)';
comment on column public.board_posts.board_kind is
  '소속 게시판 kind 비정규화(트리거 동기화). 자료실 전체 공지 금지 CHECK 제약을 위해 존재하며 직접 수정하지 않는다';
comment on column public.board_posts.summary is
  '자료실 목록 행에 노출하는 약 40자 요약. 자료실은 상세페이지가 없으므로 이 값이 유일한 설명이다';
