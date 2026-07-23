-- =====================================================================
-- [Phase 5] OFFICE 회의록 조회수(view_count)
-- 목록·상세에서 조회수를 노출하기 위한 집계 컬럼과 증가 RPC.
--
-- - view_count: 열람 1회당 +1. 열람 권한자(app.can_read_minute)만 집계에 반영한다.
-- - 증가 경로: app.increment_minute_view(uuid) RPC 전용. 원장 UPDATE RLS는 작성자/관리자만
--   허용하므로 일반 열람자가 조회수를 올릴 수 있도록 SECURITY DEFINER로 우회하되,
--   함수 첫 줄에서 can_read_minute로 게이트한다(볼 수 없는 회의록은 집계 불가).
-- - 조회는 '수정'이 아니므로 updated_at을 바꾸지 않는다: view_count만 달라진 UPDATE에는
--   set_updated_at 트리거가 발화하지 않도록 WHEN 조건을 건다(일반 편집은 view_count를
--   건드리지 않으므로 항상 WHEN 참이 되어 종전대로 updated_at이 갱신된다).
-- 근거: 20260723140000_office_meeting_minutes.sql(원장·RLS·can_read_minute)
-- =====================================================================

-- 1. 집계 컬럼 ----------------------------------------------------------
alter table public.meeting_minutes
  add column if not exists view_count integer not null default 0;

comment on column public.meeting_minutes.view_count is
  '누적 조회수. app.increment_minute_view()로만 증가(열람 권한자당 열람 1회 +1). 조회는 updated_at을 바꾸지 않는다.';

-- 2. updated_at 트리거: view_count만 바뀐 UPDATE(조회수 증가)에는 발화하지 않는다 --------
drop trigger if exists trg_meeting_minutes_updated_at on public.meeting_minutes;
create trigger trg_meeting_minutes_updated_at
  before update on public.meeting_minutes
  for each row
  when (old.view_count is not distinct from new.view_count)
  execute function app.set_updated_at();

-- 3. 조회수 증가 RPC ----------------------------------------------------
-- 열람 권한자만 집계에 반영한다. 원장 UPDATE RLS(작성자/관리자)를 우회해야 하므로 DEFINER지만
-- 첫 줄에서 can_read_minute로 게이트하고 view_count 외 컬럼은 건드리지 않는다.
create or replace function app.increment_minute_view(p_minute_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count integer;
begin
  if not app.can_read_minute(p_minute_id) then
    return null;
  end if;
  update public.meeting_minutes
     set view_count = view_count + 1
   where id = p_minute_id
     and deleted_at is null
  returning view_count into v_count;
  return v_count;
end $$;

revoke all on function app.increment_minute_view(uuid) from public;
grant execute on function app.increment_minute_view(uuid) to authenticated;
