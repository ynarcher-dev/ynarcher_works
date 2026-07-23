-- =====================================================================
-- [Phase 5] 회의록 조회수·연동 RPC를 public 스키마로 이동
--
-- 배경: increment_minute_view()(20260723180000), set_minute_links()(20260723220000)를
--   app 스키마에 만들었으나, PostgREST(=supabase.rpc)는 public 스키마만 노출한다.
--   클라이언트의 supabase.rpc('increment_minute_view' / 'set_minute_links', ...) 호출이
--   404로 실패했다. set_minute_people()도 같은 이유로 20260723170000에서 public으로 옮겼다.
--
-- 조치: 동일 본문을 public.*로 재생성하고, 도달 불가능한 app.* 버전은 제거한다.
--   권한 검사(작성자/관리자·열람 판정)는 그대로 유지한다. 내부 헬퍼
--   app.can_link_minute_target()은 프론트가 직접 부르지 않으므로 app에 남긴다.
-- 근거: 20260723170000_set_minute_people_public_schema.sql(동일 이동 패턴),
--       docs/docs_dev/11_migration_security_gate.md
-- =====================================================================

-- 1. 조회수 증가 RPC(public) --------------------------------------------
-- 열람 권한자만 집계에 반영. 원장 UPDATE RLS(작성자/관리자)를 우회해야 하므로 DEFINER지만
-- 첫 줄에서 can_read_minute로 게이트하고 view_count 외 컬럼은 건드리지 않는다.
create or replace function public.increment_minute_view(p_minute_id uuid)
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

revoke all on function public.increment_minute_view(uuid) from public;
grant execute on function public.increment_minute_view(uuid) to authenticated;

comment on function public.increment_minute_view(uuid) is
  '회의록 조회수 +1. 열람 권한자(app.can_read_minute)만 반영하며 view_count 외 컬럼·updated_at을 바꾸지 않는다.';

-- 2. 링크 일괄 교체 RPC(public) -----------------------------------------
-- 작성자/관리자만, 대상별 can_link_minute_target 통과분만 반영. 조인 테이블은 write RLS
-- 정책이 없어(Default Deny) 이 RPC가 유일한 쓰기 경로.
create or replace function public.set_minute_links(p_minute_id uuid, p_links jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  r record;
begin
  if not (app.is_admin() or app.is_minute_author(p_minute_id)) then
    raise exception '회의록 작성자만 연동 대상을 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  delete from public.meeting_minute_links where minute_id = p_minute_id;

  for r in
    select distinct
           (elem->>'target_type') as target_type,
           (elem->>'target_id')::uuid as target_id
      from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as elem
     where elem->>'target_type' is not null
       and elem->>'target_id' is not null
  loop
    if not app.can_link_minute_target(r.target_type, r.target_id) then
      raise exception '연동할 수 없는 대상입니다(권한 없음 또는 삭제됨): % %',
        r.target_type, r.target_id using errcode = '42501';
    end if;

    insert into public.meeting_minute_links (minute_id, target_type, target_id)
    values (p_minute_id, r.target_type, r.target_id)
    on conflict (minute_id, target_type, target_id) do nothing;
  end loop;
end $$;

revoke all on function public.set_minute_links(uuid, jsonb) from public;
grant execute on function public.set_minute_links(uuid, jsonb) to authenticated;

comment on function public.set_minute_links(uuid, jsonb) is
  '회의록 연동 대상 일괄 교체. 작성자/admin만, 대상별 app.can_link_minute_target 통과분만 반영.';

-- 3. 도달 불가능했던 app 스키마 버전 제거 -------------------------------
drop function if exists app.increment_minute_view(uuid);
drop function if exists app.set_minute_links(uuid, jsonb);

-- 4. 컬럼 코멘트 정정(app → public 경로) --------------------------------
comment on column public.meeting_minutes.view_count is
  '누적 조회수. public.increment_minute_view()로만 증가(열람 권한자당 열람 1회 +1). 조회는 updated_at을 바꾸지 않는다.';
