-- =====================================================================
-- [MANAGEMENT] 근무체크 재스탬프 허용 — 하루에 여러 번 찍을 수 있게
--
-- 20260803190000의 두 RPC는 '이미 출근을 기록했습니다' / '이미 퇴근을 기록했습니다'로
-- 두 번째 스탬프를 거절했다. 실제 하루는 그렇게 흐르지 않는다 — 잘못 눌러 퇴근이 찍히거나,
-- 외근을 나갔다 돌아와 다시 근무를 시작하는 날이 있다. 그때마다 경영지원에 정정을
-- 요청하게 만들면, 사유를 남겨야 하는 정정 경로가 단순 오조작으로 채워진다.
--
-- 규칙은 하나로 둔다: **마지막으로 찍은 시각이 그날의 기록이다.**
--   - 출근 재스탬프: 출근 시각을 지금으로 바꾼다. 이미 퇴근이 찍혀 있고 그것이 지금보다
--     이르면 비운다 — 다시 근무를 시작한 것이므로 앞선 퇴근은 더 이상 그날의 끝이 아니다
--     (그대로 두면 퇴근 < 출근이 되어 check 제약도 깨진다).
--   - 퇴근 재스탬프: 퇴근 시각을 지금으로 바꾼다.
-- 두 경우 모두 자동 판정을 다시 매기되, 관리자가 이미 고친 행(확정값 ≠ 자동값)의
-- status_code는 덮어쓰지 않는다(종전과 같다).
--
-- 되돌아갈 수 없다는 성질은 그대로다: 시각은 서버의 now()이고 앞으로만 흐르므로,
-- 재스탬프로 지각을 지울 수는 없다(늦게 찍을수록 불리해질 뿐이다).
--
-- 보안 게이트: 기존 SECURITY DEFINER 함수 2건의 본문 교체. 새 테이블·정책·Storage 없음.
--   search_path 고정·내부 권한 확인·대상 사용자 current_app_user_id() 고정은 종전 유지.
-- =====================================================================

create or replace function public.attendance_check_in(
  p_place public.attendance_place default 'INTERNAL'
)
returns public.attendance_days
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_user   uuid := app.current_app_user_id();
  v_policy public.attendance_policies%rowtype;
  v_date   date := app.kst_today();
  v_now    timestamptz := now();
  v_row    public.attendance_days%rowtype;
  v_out    timestamptz;
  v_auto   text;
begin
  if v_user is null or not app.is_internal_user() then
    raise exception '근태를 기록할 수 있는 계정이 아닙니다.';
  end if;

  v_policy := app.resolve_attendance_policy(v_user, v_date);
  if v_policy.id is null then
    raise exception '적용할 근무 기준이 없습니다. 근태 설정을 확인하세요.';
  end if;

  if not (extract(dow from v_date)::smallint = any (v_policy.workdays)) then
    raise exception '오늘은 근무일이 아닙니다.';
  end if;

  if app.kst_now()::time < v_policy.check_in_from then
    raise exception '출근은 % 이후부터 기록할 수 있습니다.', v_policy.check_in_from;
  end if;

  if p_place = 'EXTERNAL' and not v_policy.allow_external then
    raise exception '외부근무가 허용되지 않은 근무 기준입니다.';
  end if;

  select * into v_row from public.attendance_days
   where user_id = v_user and work_date = v_date and deleted_at is null;

  if found then
    -- 다시 근무를 시작하는 것이므로 앞선 퇴근은 그날의 끝이 아니게 된다.
    v_out := case when v_row.check_out_at is not null and v_row.check_out_at < v_now
                  then null else v_row.check_out_at end;
    v_auto := app.attendance_auto_status(
                v_now, v_out, v_policy.check_in_to, v_policy.work_minutes);

    update public.attendance_days
       set check_in_at      = v_now,
           check_out_at     = v_out,
           work_place       = p_place,
           auto_status_code = v_auto,
           -- 관리자가 이미 고친 행은 확정 상태를 유지한다.
           status_code      = case
                                when v_row.auto_status_code is distinct from v_row.status_code
                                  then v_row.status_code
                                else v_auto
                              end
     where id = v_row.id
     returning * into v_row;
  else
    v_auto := app.attendance_auto_status(v_now, null, v_policy.check_in_to, v_policy.work_minutes);
    insert into public.attendance_days (
      user_id, work_date, work_place, check_in_at,
      status_code, auto_status_code, policy_check_in_to, policy_work_minutes
    )
    values (
      v_user, v_date, p_place, v_now,
      v_auto, v_auto, v_policy.check_in_to, v_policy.work_minutes
    )
    returning * into v_row;
  end if;

  return v_row;
end $$;

create or replace function public.attendance_check_out()
returns public.attendance_days
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_user uuid := app.current_app_user_id();
  v_date date := app.kst_today();
  v_now  timestamptz := now();
  v_row  public.attendance_days%rowtype;
  v_auto text;
begin
  if v_user is null or not app.is_internal_user() then
    raise exception '근태를 기록할 수 있는 계정이 아닙니다.';
  end if;

  select * into v_row from public.attendance_days
   where user_id = v_user and work_date = v_date and deleted_at is null;

  if not found or v_row.check_in_at is null then
    raise exception '출근 기록이 없어 퇴근을 기록할 수 없습니다.';
  end if;

  v_auto := app.attendance_auto_status(
    v_row.check_in_at, v_now, v_row.policy_check_in_to, v_row.policy_work_minutes);

  update public.attendance_days
     set check_out_at     = v_now,
         auto_status_code = v_auto,
         status_code      = case
                              when v_row.auto_status_code is distinct from v_row.status_code
                                then v_row.status_code
                              else v_auto
                            end
   where id = v_row.id
   returning * into v_row;

  return v_row;
end $$;

comment on function public.attendance_check_in(public.attendance_place) is
  '본인 오늘 출근 스탬프. 다시 찍으면 마지막 시각이 그날의 출근이 되고, 그보다 이른 퇴근 기록은 비워진다.';
comment on function public.attendance_check_out() is
  '본인 오늘 퇴근 스탬프. 다시 찍으면 마지막 시각이 그날의 퇴근이 된다.';
