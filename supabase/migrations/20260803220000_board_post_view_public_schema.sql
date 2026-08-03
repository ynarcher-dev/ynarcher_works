-- =====================================================================
-- [Phase 5] 게시글 조회수 증가 RPC를 public 스키마로 이동
--
-- 배경: increment_board_post_view()(20260723190000)를 app 스키마에 만들었으나,
--   PostgREST(=supabase.rpc)는 public 스키마만 노출한다. 클라이언트의
--   supabase.rpc('increment_board_post_view', ...) 호출이 404(PGRST202)로 실패해
--   게시글·공지사항 조회수가 한 번도 오르지 않았다. 회의록 조회수도 같은 이유로
--   20260723230000에서 public으로 옮겼는데, 게시글 쪽이 함께 옮겨지지 않았다.
--
-- 조치: 동일 본문을 public.*로 재생성하고, 도달 불가능한 app.* 버전은 제거한다.
--   권한 검사(app.can_read_board_post 게이트)는 그대로 유지한다.
-- 근거: 20260723230000_minute_view_links_public_schema.sql(동일 이동 패턴),
--       docs/docs_dev/11_migration_security_gate.md
-- =====================================================================

-- 1. 조회수 증가 RPC(public) --------------------------------------------
-- 열람 권한자만 집계에 반영. 원장 UPDATE RLS(작성자/관리자)를 우회해야 하므로 DEFINER지만
-- 첫 줄에서 can_read_board_post로 게이트하고 view_count 외 컬럼은 건드리지 않는다.
-- (updated_at 트리거는 view_count만 바뀐 UPDATE에 발화하지 않는다 — 20260723190000 §1)
create or replace function public.increment_board_post_view(p_post_id uuid)
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

revoke all on function public.increment_board_post_view(uuid) from public;
grant execute on function public.increment_board_post_view(uuid) to authenticated;

comment on function public.increment_board_post_view(uuid) is
  '게시글 조회수 +1. 열람 권한자(app.can_read_board_post)만 반영하며 view_count 외 컬럼·updated_at을 바꾸지 않는다.';

-- 2. 도달 불가능했던 app 스키마 버전 제거 -------------------------------
drop function if exists app.increment_board_post_view(uuid);

-- 3. 컬럼 코멘트 정정(app → public 경로) --------------------------------
comment on column public.board_posts.view_count is
  '누적 조회수. public.increment_board_post_view()로만 증가(열람 권한자당 열람 1회 +1). 조회는 updated_at을 바꾸지 않는다.';
