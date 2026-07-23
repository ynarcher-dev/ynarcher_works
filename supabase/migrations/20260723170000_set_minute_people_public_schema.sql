-- =====================================================================
-- [Phase 5] 회의록 명단 교체 RPC를 public 스키마로 이동
--
-- 배경: 20260723140000에서 set_minute_people()을 app 스키마에 만들었으나,
--   PostgREST(=supabase.rpc)는 public 스키마만 노출한다. 클라이언트의
--   supabase.rpc('set_minute_people', ...) 호출이 404로 실패했다.
--   프로젝트의 다른 클라이언트 호출 RPC(deactivate_entity/update_entity/
--   reassign_entity/upload_insert_entities 등)는 모두 public에 있다.
--
-- 조치: 동일 본문을 public.set_minute_people()으로 재생성하고, 도달 불가능한
--   app.set_minute_people()은 제거한다. 권한 검사(작성자/관리자)는 그대로 유지.
-- =====================================================================

create or replace function public.set_minute_people(p_minute_id uuid, p_people jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not (app.is_admin() or app.is_minute_author(p_minute_id)) then
    raise exception '회의록 작성자만 참석자·참조를 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  delete from public.meeting_minute_people where minute_id = p_minute_id;

  insert into public.meeting_minute_people (minute_id, user_id, role)
  select p_minute_id,
         (elem->>'user_id')::uuid,
         coalesce((elem->>'role')::public.minute_person_role, 'ATTENDEE')
    from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) as elem
   where elem->>'user_id' is not null
  on conflict (minute_id, user_id) do update set role = excluded.role;
end $$;

revoke all on function public.set_minute_people(uuid, jsonb) from public;
grant execute on function public.set_minute_people(uuid, jsonb) to authenticated;

comment on function public.set_minute_people(uuid, jsonb) is
  '회의록 참석자(ATTENDEE)/참조(REFERENCE) 명단 일괄 교체. 작성자·관리자만 실행 가능(함수 내부 검사). 조인 테이블은 write RLS 정책 없음(Default Deny)이라 이 RPC가 유일한 쓰기 경로.';

-- 도달 불가능했던 app 스키마 버전 제거.
drop function if exists app.set_minute_people(uuid, jsonb);
