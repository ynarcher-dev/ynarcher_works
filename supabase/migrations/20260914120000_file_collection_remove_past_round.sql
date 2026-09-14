-- 파일받기 — 지난 회차 파일도 내릴 수 있게 한다 (2026-09-14 사용자 지정)
--
-- 종전 규칙: 파일을 내릴 수 있는 것은 **현재 회차**뿐이었다. 그런데 보완 요청은 회차를 올리므로
-- (`file_collection_review`), 보완 요청을 받은 참여자에게는 앞서 낸 파일이 그 순간 '지난 회차'가
-- 되어 잘못 낸 자료를 스스로 치울 길이 없었다. 화면에는 내려받기만 남고, 담당자에게 부탁하는
-- 것도 같은 규칙에 막혔다(WORKS도 지난 회차는 못 내렸다).
--
-- 바뀐 규칙: 회차 조건을 걷고 **응답 칸의 상태**만 본다.
--   · 열린 상태(NOT_SUBMITTED·DRAFT·REWORK_REQUESTED)에서는 그 문항의 파일을 회차와 무관하게 내린다.
--   · 검토 중(SUBMITTED)·완료(APPROVED)에서는 여전히 누구도 내리지 못한다.
-- 소유자 검사(게스트는 자기가 올린 파일만)와 모듈 쓰기 권한 검사는 그대로다. 삭제는 종전과 같이
-- 소프트 삭제이며 감사 로그도 그대로 남는다 — 지운 사실과 지운 사람은 사라지지 않는다.
--
-- 남는 위험(기록해 둔다): 담당자가 무엇을 보고 보완을 요청했는지, 그 실물이 화면에서 사라질 수
-- 있다. 원장(`deleted_at`)과 `audit_logs`에는 남으므로 되짚을 수는 있다.

create or replace function public.file_collection_remove_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_response uuid; v_assignment uuid; v_module uuid;
  v_r_status public.file_collection_status; v_r_round integer;
  v_owner uuid; v_round integer;
begin
  select f.response_id into v_response
    from public.file_collection_files f where f.id = p_file_id and f.deleted_at is null;
  if v_response is null then
    raise exception '파일을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select r.assignment_id, r.program_module_id, r.status, r.round
    into v_assignment, v_module, v_r_status, v_r_round
    from public.file_collection_responses r where r.id = v_response and r.deleted_at is null
   for update;
  if v_assignment is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select f.uploaded_by, f.round into v_owner, v_round
    from public.file_collection_files f where f.id = p_file_id and f.deleted_at is null
   for update;

  if app.is_guest() then
    if v_owner <> app.current_app_user_id()
       or v_assignment not in (select app.file_collection_guest_writable_assignment_ids()) then
      raise exception '이 파일을 내릴 권한이 없습니다.' using errcode = '42501';
    end if;
  elsif not app.file_collection_internal_write(v_module) then
    raise exception '이 파일을 내릴 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 회차는 보지 않는다(2026-09-14). 문항이 아직 이쪽 손에 있는가만 본다.
  if v_r_status in ('SUBMITTED', 'APPROVED') then
    raise exception '제출한 문항의 파일은 내릴 수 없습니다.' using errcode = 'P0001';
  end if;

  update public.file_collection_files set deleted_at = now() where id = p_file_id;

  insert into public.audit_logs (actor_user_id, action, after_data, reason)
  values (
    app.current_app_user_id(), 'FILE_COLLECTION_FILE_REMOVE',
    jsonb_build_object('file_id', p_file_id, 'response_id', v_response,
                       'program_module_id', v_module, 'round', v_round,
                       'response_round', v_r_round),
    '파일받기 파일 내리기(소프트 삭제)'
  );
end;
$$;

-- `create or replace`이므로 함수 ACL은 그대로 유지된다(드롭·재생성이 아니다).
-- 원 마이그레이션(20260913210500)이 세운 `revoke all ... from public, anon` +
-- `grant execute ... to authenticated`가 계속 유효하다.
