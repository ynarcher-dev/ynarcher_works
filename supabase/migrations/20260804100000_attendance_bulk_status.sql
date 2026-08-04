-- 근태 상태 일괄 변경 RPC
--
-- 화면에서 여러 칸을 골라 상태 하나로 맞추는 일(단체 워크숍을 공가로, 창립기념일을 휴일로)을
-- set_attendance_record 반복 호출로 처리하면 두 가지가 깨진다.
--
-- 1) 원자성 — 12건 중 5건에서 끊기면 어느 것이 반영됐는지 화면이 답할 수 없다. 근태는 급여로
--    이어지는 기록이라 "절반만 맞는 상태"를 남길 수 없다.
-- 2) 손대지 않기로 한 값의 보존 — set_attendance_record는 시각·근무지·비고까지 함께 덮어쓰므로
--    호출부가 각 행의 현재 값을 실어 보내야 하는데, 그 값은 화면이 읽은 뒤 바뀌었을 수 있다.
--    일괄 변경이 건드리는 축은 상태 하나뿐이므로 나머지는 서버가 원장 값 그대로 둔다.
--
-- 대상은 (임직원, 날짜) 쌍의 병렬 배열로 받는다. 날짜별 뷰는 한 날짜에 여러 사람이고 인력별
-- 뷰는 한 사람에 여러 날짜인데, 쌍으로 받으면 두 축을 함수 하나가 받는다.
--
-- SECURITY INVOKER — 우회할 것이 없다. attendance_days의 management 쓰기 정책이 그대로
-- 판정하고, 함수는 상태 갱신과 이력 기록을 한 트랜잭션으로 묶기만 한다. DEFINER로 만들면
-- 그 정책을 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다.

create or replace function public.set_attendance_status_bulk(
  p_user_ids   uuid[],
  p_work_dates date[],
  p_status     text,
  p_reason     text
)
returns integer
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_target record;
  v_policy public.attendance_policies%rowtype;
  v_old    public.attendance_days%rowtype;
  v_row    public.attendance_days%rowtype;
  v_count  integer := 0;
begin
  -- 사유는 단건 정정과 같은 규칙으로 필수다. 일괄이라고 "왜 바꿨는가"가 면제되지 않는다.
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception '정정 사유를 입력해야 합니다.';
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception '대상을 하나 이상 선택해야 합니다.';
  end if;
  if array_length(p_user_ids, 1) is distinct from array_length(p_work_dates, 1) then
    raise exception '대상 목록이 어긋났습니다.';
  end if;

  for v_target in
    select u as user_id, d as work_date from unnest(p_user_ids, p_work_dates) as t(u, d)
  loop
    select * into v_old
      from public.attendance_days
     where user_id = v_target.user_id
       and work_date = v_target.work_date
       and deleted_at is null;

    if found then
      -- 이미 그 상태면 건너뛴다. 바뀐 것이 없는데 이력에 줄을 남기면 '무엇이 무엇으로'가
      -- 같은 값 두 개인 기록이 쌓여, 나중에 진짜 변경을 찾을 수 없게 된다.
      if v_old.status_code = p_status then
        continue;
      end if;
      -- 상태만 바꾼다 — 찍힌 시각·근무지·비고는 원장 값 그대로 둔다.
      update public.attendance_days
         set status_code = p_status
       where id = v_old.id
       returning * into v_row;
    else
      -- 결근·미출근으로만 그려지던 빈 칸 — 이때 처음 행이 생긴다. 자동 판정값은 기록이 없는
      -- 상태의 판정이므로 단건 정정과 같은 함수로 매긴다(기준은 그날의 정책 스냅샷).
      v_policy := app.resolve_attendance_policy(v_target.user_id, v_target.work_date);
      insert into public.attendance_days (
        user_id, work_date, status_code, auto_status_code,
        policy_check_in_to, policy_work_minutes
      )
      values (
        v_target.user_id, v_target.work_date, p_status,
        app.attendance_auto_status(null, null,
          coalesce(v_policy.check_in_to, time '09:00'),
          coalesce(v_policy.work_minutes, 540)),
        coalesce(v_policy.check_in_to, time '09:00'),
        coalesce(v_policy.work_minutes, 540)
      )
      returning * into v_row;
    end if;

    insert into public.attendance_edits (attendance_day_id, field, before_value, after_value, reason)
    values (v_row.id, 'status', v_old.status_code, v_row.status_code, p_reason);

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke all on function public.set_attendance_status_bulk(uuid[], date[], text, text) from public;
grant execute on function public.set_attendance_status_bulk(uuid[], date[], text, text) to authenticated;
