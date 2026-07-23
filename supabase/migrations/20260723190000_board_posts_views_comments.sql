-- =====================================================================
-- [Phase 5] OFFICE 게시글 조회수(view_count) + 댓글(board_comments)
-- 게시글을 프론트 로컬 더미에서 실데이터로 전환하기 위한 마지막 원장 조각.
--
-- - view_count: 열람 1회당 +1. 열람 권한자(app.can_read_board_post)만 집계에 반영한다.
--   증가는 app.increment_board_post_view() RPC 전용(원장 UPDATE RLS는 작성자/관리자만 허용).
--   조회는 '수정'이 아니므로 updated_at을 바꾸지 않는다(회의록 view_count와 동일 규약).
-- - board_comments: 게시글 댓글. 열람은 게시글을 볼 수 있는 사람, 작성은 office 열람자.
--   물리 삭제 금지(soft delete), 작성자/작성자명은 서버 트리거가 스탬프한다.
-- 근거: 20260720200000_office_boards.sql(원장·RLS·can_read_board),
--       20260723180000_meeting_minutes_view_count.sql(조회수 규약)
-- =====================================================================

-- 1. 조회수 컬럼 --------------------------------------------------------
alter table public.board_posts
  add column if not exists view_count integer not null default 0;

comment on column public.board_posts.view_count is
  '누적 조회수. app.increment_board_post_view()로만 증가(열람 권한자당 열람 1회 +1). 조회는 updated_at을 바꾸지 않는다.';

-- updated_at 트리거: view_count만 바뀐 UPDATE(조회수 증가)에는 발화하지 않는다.
-- (일반 편집은 view_count를 건드리지 않아 항상 WHEN 참이 되어 종전대로 updated_at이 갱신된다.)
drop trigger if exists trg_board_posts_updated_at on public.board_posts;
create trigger trg_board_posts_updated_at
  before update on public.board_posts
  for each row
  when (old.view_count is not distinct from new.view_count)
  execute function app.set_updated_at();

-- 2. 게시글 열람 판정 헬퍼 ------------------------------------------------
-- 게시글이 존재하고(미삭제) 소속 게시판을 읽을 수 있는가. 조회수 증가·댓글 RLS가 공용으로 쓴다.
-- board_posts를 RLS 없이 읽어 board_id를 얻어야 하므로 SECURITY DEFINER이며,
-- 실제 권한은 app.can_read_board(board_id)로 판정한다.
create or replace function app.can_read_board_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.board_posts p
     where p.id = p_post_id
       and p.deleted_at is null
       and app.can_read_board(p.board_id)
  );
$$;

revoke all on function app.can_read_board_post(uuid) from public;
grant execute on function app.can_read_board_post(uuid) to authenticated;

-- 3. 조회수 증가 RPC ----------------------------------------------------
create or replace function app.increment_board_post_view(p_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count integer;
begin
  if not app.can_read_board_post(p_post_id) then
    return null;
  end if;
  update public.board_posts
     set view_count = view_count + 1
   where id = p_post_id
     and deleted_at is null
  returning view_count into v_count;
  return v_count;
end $$;

revoke all on function app.increment_board_post_view(uuid) from public;
grant execute on function app.increment_board_post_view(uuid) to authenticated;

-- 4. 댓글 --------------------------------------------------------------
create table if not exists public.board_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.board_posts(id) on delete cascade,
  author_id    uuid references public.users(id),
  author_name  text,                                  -- users RLS 우회 표시용 비정규화(서버 스탬프)
  content      text not null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_board_comments_post
  on public.board_comments (post_id, created_at)
  where deleted_at is null;

alter table public.board_comments enable row level security;

-- 열람: 게시글을 볼 수 있는 사람. 삭제된 댓글은 관리자에게만.
drop policy if exists board_comments_select on public.board_comments;
create policy board_comments_select on public.board_comments for select
  using (
    app.can_read_board_post(post_id)
    and (deleted_at is null or app.is_admin())
  );

-- 작성: 게시글을 볼 수 있는 office 열람자. 작성자는 트리거가 스탬프한다.
drop policy if exists board_comments_insert on public.board_comments;
create policy board_comments_insert on public.board_comments for insert
  with check (app.can_read_board_post(post_id));

-- 수정/소프트삭제: 작성자 본인 또는 admin.
drop policy if exists board_comments_update on public.board_comments;
create policy board_comments_update on public.board_comments for update
  using (app.is_admin() or author_id = app.current_app_user_id())
  with check (app.is_admin() or author_id = app.current_app_user_id());

grant select, insert, update on public.board_comments to authenticated;

-- 작성자 스탬프: 클라이언트 입력을 신뢰하지 않고 세션 사용자로 채운다.
create or replace function app.stamp_board_comment()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.author_id is null then
    NEW.author_id := app.current_app_user_id();
  end if;
  if NEW.author_name is null and NEW.author_id is not null then
    select u.name into NEW.author_name from public.users u where u.id = NEW.author_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_board_comments_stamp on public.board_comments;
create trigger trg_board_comments_stamp
  before insert on public.board_comments
  for each row execute function app.stamp_board_comment();

comment on table public.board_comments is
  '게시글 댓글. 열람은 게시글 열람 권한자(app.can_read_board_post), 작성은 office 열람자. 물리 삭제 금지(soft delete)';
