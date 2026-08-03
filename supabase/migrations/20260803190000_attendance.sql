-- =====================================================================
-- [MANAGEMENT] 근태 관리 — 근무 정책·상태 원장 + 일별 근태 + 정정 이력
-- 기획: docs/docs_planning/3_7_3_management_attendance.md
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=management / 등급=Personal / 접근=내부 임직원(게스트 전면 차단)
--   Scope = self(본인 기록 조회·찍기) + global(management의 전 직원 조회·정정)
--   - 신규 테이블 4종 전부 생성 즉시 RLS 활성화, SELECT/INSERT/UPDATE 정책 분리.
--   - DELETE 정책 없음(soft delete: deleted_at). 정정 이력은 append-only(UPDATE도 없음).
--   - 권한 판정은 app.can_read_workspace/can_write_workspace/is_internal_user 헬퍼만 경유.
--   - SECURITY DEFINER 함수는 search_path 고정 + 함수 내부 권한 확인 + authenticated 한정 GRANT.
--   - 감사 로그: 개인 근태 Export 기능이 없어 access_logs 경로를 두지 않는다(도입 시 함께 설계).
-- 근거: 20260728120000_meeting_rooms.sql(내부 사용자 헬퍼·스탬프·요일 배열 패턴)
--
-- 설계 메모(왜 이렇게 두는가는 기획서 §5~§6에 있다):
--   - 판정 기준(출근 마감·소정 근무시간)을 attendance_days에 복사한다. 스냅샷이 없으면
--     출근 마감을 늦추는 순간 과거의 지각이 전부 정상으로 바뀐다.
--   - 지각·조기퇴근을 플래그 둘로 쪼개지 않고 조합 상태(LATE_EARLY)를 하나 더 둔다.
--     관리자가 고치는 단위가 '그날의 상태' 한 값이기 때문이다.
--   - 본인에게 attendance_days 쓰기 정책을 주지 않는다. 주면 자기 status_code까지 고칠 수
--     있으므로, 출퇴근은 좁은 SECURITY DEFINER RPC 두 개로만 길을 낸다.
-- =====================================================================

-- 0. 근무지 enum -------------------------------------------------------
do $$
begin
  create type public.attendance_place as enum ('INTERNAL', 'EXTERNAL');
exception when duplicate_object then null;
end $$;

-- 1. 한국 시각 헬퍼 ----------------------------------------------------
-- DB는 UTC로 돌아간다. '오늘'과 '몇 시에 찍었나'는 전부 한국 시각 기준이어야 하므로
-- 날짜·시각 판정을 이 두 함수로 모은다(호출부마다 at time zone을 흩뿌리지 않는다).
create or replace function app.kst_now()
returns timestamp
language sql
stable
set search_path = app, public
as $$
  select (now() at time zone 'Asia/Seoul')::timestamp;
$$;

create or replace function app.kst_today()
returns date
language sql
stable
set search_path = app, public
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

revoke all on function app.kst_now() from public;
revoke all on function app.kst_today() from public;
grant execute on function app.kst_now() to authenticated;
grant execute on function app.kst_today() to authenticated;

-- 2. 근태 상태 원장 ----------------------------------------------------
-- 상태 값을 코드에 박지 않는 이유: 회사가 쓰는 휴가 종류가 늘어나는 것이 정상이고,
-- 그때마다 마이그레이션을 부르면 기준정보를 고칠 자리가 개발자에게 있게 된다.
create table if not exists public.attendance_statuses (
  code        text primary key,
  label       text not null,
  tone        text not null default 'neutral',   -- Badge 톤
  kind        text not null default 'WORK',      -- 집계 축(근무/휴가/결근)
  is_system   boolean not null default false,    -- 규칙이 자동으로 매기는 상태(코드 고정)
  is_paid     boolean not null default true,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint attendance_statuses_kind_chk check (kind in ('WORK', 'LEAVE', 'ABSENT')),
  constraint attendance_statuses_tone_chk
    check (tone in ('success', 'warning', 'danger', 'info', 'neutral')),
  constraint attendance_statuses_label_chk check (btrim(label) <> '')
);

-- 3. 근무 정책 원장 ----------------------------------------------------
create table if not exists public.attendance_policies (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id),      -- null = 전사 기본
  check_in_from   time not null default '07:00',         -- 이 시각 전에는 찍을 수 없다
  check_in_to     time not null default '09:00',         -- 지각 판정선
  work_minutes    integer not null default 540,          -- 출근 + 이 시간 = 정상 퇴근
  workdays        smallint[] not null default '{1,2,3,4,5}',  -- 0=일 .. 6=토
  allow_external  boolean not null default true,
  effective_from  date not null default current_date,
  note            text,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint attendance_policies_time_order check (check_in_from < check_in_to),
  constraint attendance_policies_work_minutes check (work_minutes between 60 and 1440),
  constraint attendance_policies_workdays check (
    array_length(workdays, 1) between 1 and 7
    and workdays <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

-- 같은 대상의 같은 발효일이 둘일 수 없다. user_id가 null(전사 기본)인 행도 함께 막아야 하므로
-- coalesce로 고정 uuid에 눌러 색인한다(null은 유니크 인덱스에서 서로 다른 값으로 취급된다).
create unique index if not exists attendance_policies_target_uniq
  on public.attendance_policies
     (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from)
  where deleted_at is null;

create index if not exists attendance_policies_user_idx
  on public.attendance_policies (user_id, effective_from desc)
  where deleted_at is null;

-- 4. 일별 근태 원장 ----------------------------------------------------
create table if not exists public.attendance_days (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id),
  work_date           date not null,
  work_place          public.attendance_place not null default 'INTERNAL',
  check_in_at         timestamptz,
  check_out_at        timestamptz,
  status_code         text not null references public.attendance_statuses(code),
  auto_status_code    text references public.attendance_statuses(code),  -- 규칙이 매긴 원본
  policy_check_in_to  time not null,        -- 판정에 쓴 기준(스냅샷)
  policy_work_minutes integer not null,     -- 판정에 쓴 기준(스냅샷)
  note                text,
  created_by          uuid references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  -- 퇴근만 있고 출근이 없는 행은 만들 수 없다.
  constraint attendance_days_time_order check (
    check_out_at is null
    or (check_in_at is not null and check_out_at >= check_in_at)
  )
);

create unique index if not exists attendance_days_user_date_uniq
  on public.attendance_days (user_id, work_date)
  where deleted_at is null;

create index if not exists attendance_days_date_idx
  on public.attendance_days (work_date, user_id)
  where deleted_at is null;

create index if not exists attendance_days_user_idx
  on public.attendance_days (user_id, work_date desc)
  where deleted_at is null;

-- 5. 정정 이력 (append-only) ------------------------------------------
-- 공용 기여 로그(entity_contributions)를 쓰지 않는 이유: 이전값·이후값 칸이 없고
-- SELECT가 워크스페이스 단위여서 개인 근태 정정 사유가 다른 원장 이력 패널에 섞인다.
create table if not exists public.attendance_edits (
  id                uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null references public.attendance_days(id),
  edited_by         uuid references public.users(id),
  edited_by_name    text,                    -- users RLS 우회 표시용 비정규화(서버 스탬프)
  edited_at         timestamptz not null default now(),
  field             text not null,
  before_value      text,
  after_value       text,
  reason            text not null,
  constraint attendance_edits_field_chk
    check (field in ('status', 'check_in_at', 'check_out_at', 'work_place', 'note')),
  constraint attendance_edits_reason_chk check (btrim(reason) <> '')
);

create index if not exists attendance_edits_day_idx
  on public.attendance_edits (attendance_day_id, edited_at desc);

-- 6. RLS ---------------------------------------------------------------
alter table public.attendance_statuses enable row level security;
alter table public.attendance_policies enable row level security;
alter table public.attendance_days     enable row level security;
alter table public.attendance_edits    enable row level security;

-- 상태 원장: 라벨·톤은 본인 위젯도 읽어야 하므로 내부 사용자 전원 조회. 쓰기는 management.
drop policy if exists attendance_statuses_select on public.attendance_statuses;
create policy attendance_statuses_select on public.attendance_statuses for select
  using (app.is_internal_user());

drop policy if exists attendance_statuses_insert on public.attendance_statuses;
create policy attendance_statuses_insert on public.attendance_statuses for insert
  with check (app.can_write_workspace('management'));

drop policy if exists attendance_statuses_update on public.attendance_statuses;
create policy attendance_statuses_update on public.attendance_statuses for update
  using (app.can_write_workspace('management'))
  with check (app.can_write_workspace('management'));

-- 근무 정책: 본인에게 적용될 기준(전사 기본 + 본인 예외)은 본인이 읽을 수 있어야 위젯이
-- '오늘은 근무일이 아닙니다'를 말할 수 있다. 남의 예외는 management만 본다.
drop policy if exists attendance_policies_select on public.attendance_policies;
create policy attendance_policies_select on public.attendance_policies for select
  using (
    app.can_read_workspace('management')
    or user_id is null
    or user_id = app.current_app_user_id()
  );

drop policy if exists attendance_policies_insert on public.attendance_policies;
create policy attendance_policies_insert on public.attendance_policies for insert
  with check (app.can_write_workspace('management'));

drop policy if exists attendance_policies_update on public.attendance_policies;
create policy attendance_policies_update on public.attendance_policies for update
  using (app.can_write_workspace('management'))
  with check (app.can_write_workspace('management'));

-- 일별 근태: 본인 기록은 본인이 조회, 전 직원은 management. 쓰기는 management뿐이며
-- 본인 찍기는 아래 RPC 두 개로만 통한다(정책을 주면 자기 status_code도 고칠 수 있다).
drop policy if exists attendance_days_select on public.attendance_days;
create policy attendance_days_select on public.attendance_days for select
  using (
    app.can_read_workspace('management')
    or user_id = app.current_app_user_id()
  );

drop policy if exists attendance_days_insert on public.attendance_days;
create policy attendance_days_insert on public.attendance_days for insert
  with check (app.can_write_workspace('management'));

drop policy if exists attendance_days_update on public.attendance_days;
create policy attendance_days_update on public.attendance_days for update
  using (app.can_write_workspace('management'))
  with check (app.can_write_workspace('management'));

-- 정정 이력: 조회 management read, 기록 management write. UPDATE·DELETE 정책 없음.
drop policy if exists attendance_edits_select on public.attendance_edits;
create policy attendance_edits_select on public.attendance_edits for select
  using (app.can_read_workspace('management'));

drop policy if exists attendance_edits_insert on public.attendance_edits;
create policy attendance_edits_insert on public.attendance_edits for insert
  with check (
    app.can_write_workspace('management')
    -- 본인 명의로만 기록한다(실제 강제는 아래 스탬프 트리거의 무조건 덮어쓰기).
    and (edited_by is null or edited_by = app.current_app_user_id())
  );

-- 7. 트리거 ------------------------------------------------------------
drop trigger if exists trg_attendance_statuses_updated_at on public.attendance_statuses;
create trigger trg_attendance_statuses_updated_at
  before update on public.attendance_statuses
  for each row execute function app.set_updated_at();

drop trigger if exists trg_attendance_policies_updated_at on public.attendance_policies;
create trigger trg_attendance_policies_updated_at
  before update on public.attendance_policies
  for each row execute function app.set_updated_at();

drop trigger if exists trg_attendance_days_updated_at on public.attendance_days;
create trigger trg_attendance_days_updated_at
  before update on public.attendance_days
  for each row execute function app.set_updated_at();

-- 생성자·정정자 스탬프(클라이언트 입력을 신뢰하지 않는다).
create or replace function app.stamp_attendance_creator()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  return NEW;
end $$;

drop trigger if exists trg_attendance_policies_stamp on public.attendance_policies;
create trigger trg_attendance_policies_stamp
  before insert on public.attendance_policies
  for each row execute function app.stamp_attendance_creator();

drop trigger if exists trg_attendance_days_stamp on public.attendance_days;
create trigger trg_attendance_days_stamp
  before insert on public.attendance_days
  for each row execute function app.stamp_attendance_creator();

create or replace function app.stamp_attendance_editor()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  NEW.edited_by := app.current_app_user_id();
  if NEW.edited_by is not null then
    select u.name into NEW.edited_by_name from public.users u where u.id = NEW.edited_by;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_attendance_edits_stamp on public.attendance_edits;
create trigger trg_attendance_edits_stamp
  before insert on public.attendance_edits
  for each row execute function app.stamp_attendance_editor();

-- 8. 시드 --------------------------------------------------------------
-- 시스템 상태 5종: 규칙이 매기는 결과라 코드가 고정이다(라벨·톤만 화면에서 고친다).
insert into public.attendance_statuses (code, label, tone, kind, is_system, is_paid, sort_order)
values
  ('NORMAL',      '정상',          'success', 'WORK',   true,  true,  10),
  ('LATE',        '지각',          'warning', 'WORK',   true,  true,  20),
  ('EARLY_LEAVE', '조기퇴근',      'warning', 'WORK',   true,  true,  30),
  ('LATE_EARLY',  '지각·조기퇴근', 'danger',  'WORK',   true,  true,  40),
  ('ABSENT',      '결근',          'danger',  'ABSENT', true,  false, 50)
on conflict (code) do nothing;

-- 관리자 지정 상태: 그대로 쓰거나 화면에서 늘린다.
insert into public.attendance_statuses (code, label, tone, kind, is_system, is_paid, sort_order)
values
  ('LEAVE_ANNUAL',   '연차', 'info',    'LEAVE', false, true,  60),
  ('LEAVE_HALF',     '반차', 'info',    'LEAVE', false, true,  70),
  ('LEAVE_SICK',     '병가', 'info',    'LEAVE', false, true,  80),
  ('LEAVE_OFFICIAL', '공가', 'info',    'LEAVE', false, true,  90),
  ('HOLIDAY',        '휴일', 'neutral', 'WORK',  false, true, 100)
on conflict (code) do nothing;

-- 전사 기본 근무 정책 1행. 이미 있으면 건드리지 않는다(운영값을 시드가 되돌리지 않게).
insert into public.attendance_policies
  (user_id, check_in_from, check_in_to, work_minutes, workdays, allow_external, effective_from, note)
select null, '07:00', '09:00', 540, '{1,2,3,4,5}'::smallint[], true, date '2026-01-01',
       '전사 기본 근무 기준'
where not exists (
  select 1 from public.attendance_policies where user_id is null and deleted_at is null
);

-- 9. 정책 해석·자동 판정 함수 -------------------------------------------
-- 그 날짜에 그 사람에게 적용되는 기준 한 벌. 임직원 예외가 있으면 그것, 없으면 전사 기본이다.
-- RPC와 화면(my_attendance_policy)이 같은 규칙을 쓰도록 한 곳에 둔다.
create or replace function app.resolve_attendance_policy(p_user uuid, p_date date)
returns public.attendance_policies
language sql
stable
security definer
set search_path = app, public
as $$
  select *
    from public.attendance_policies p
   where p.deleted_at is null
     and p.effective_from <= p_date
     and (p.user_id = p_user or p.user_id is null)
   order by (p.user_id is not null) desc,   -- 임직원 예외가 전사 기본을 이긴다
            p.effective_from desc
   limit 1;
$$;

-- 출퇴근 시각과 기준으로 상태 코드를 매긴다. 지각·조기퇴근이 겹치면 조합 상태가 된다.
create or replace function app.attendance_auto_status(
  p_check_in    timestamptz,
  p_check_out   timestamptz,
  p_check_in_to time,
  p_work_min    integer
)
returns text
language sql
-- immutable이 아니라 stable이다: timestamptz를 명명 시간대로 옮기는 연산이 stable이다
-- (시간대 데이터베이스가 갱신될 수 있다). 잘못 표기하면 인라인·상수 폴딩에서 값이 굳는다.
stable
set search_path = app, public
as $$
  select case
    when p_check_in is null then 'ABSENT'
    else case
      when ((p_check_in at time zone 'Asia/Seoul')::time > p_check_in_to)
       and (p_check_out is not null
            and p_check_out < p_check_in + make_interval(mins => p_work_min))
        then 'LATE_EARLY'
      when ((p_check_in at time zone 'Asia/Seoul')::time > p_check_in_to)
        then 'LATE'
      when (p_check_out is not null
            and p_check_out < p_check_in + make_interval(mins => p_work_min))
        then 'EARLY_LEAVE'
      else 'NORMAL'
    end
  end;
$$;

revoke all on function app.resolve_attendance_policy(uuid, date) from public;
revoke all on function app.attendance_auto_status(timestamptz, timestamptz, time, integer) from public;
grant execute on function app.resolve_attendance_policy(uuid, date) to authenticated;
grant execute on function app.attendance_auto_status(timestamptz, timestamptz, time, integer) to authenticated;

-- 10. 본인 출퇴근 RPC (SECURITY DEFINER) --------------------------------
-- DEFINER인 이유: 본인에게 attendance_days 쓰기 정책을 주면 자기 status_code까지 고칠 수 있다.
-- 컬럼 단위 권한 대신 '본인 행의 시각만' 건드리는 좁은 함수 두 개로만 길을 낸다.
-- 대상 사용자는 인자가 아니라 app.current_app_user_id()로 고정하므로 남의 행에 닿지 않는다.

/** 오늘 내 근태에 출근을 찍는다. 근무일·출근 가능 시각·중복 여부를 서버가 판정한다. */
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

  if found and v_row.check_in_at is not null then
    raise exception '이미 출근을 기록했습니다.';
  end if;

  if found then
    -- 관리자가 휴가·결근으로 먼저 만들어 둔 행에 출근이 찍히는 경우. 시각만 채우고
    -- 관리자가 확정한 상태는 건드리지 않는다(자동 판정은 auto 칸에만 남긴다).
    update public.attendance_days
       set check_in_at      = v_now,
           work_place       = p_place,
           auto_status_code = app.attendance_auto_status(
                                v_now, null, v_policy.check_in_to, v_policy.work_minutes)
     where id = v_row.id
     returning * into v_row;
  else
    insert into public.attendance_days (
      user_id, work_date, work_place, check_in_at,
      status_code, auto_status_code, policy_check_in_to, policy_work_minutes
    )
    values (
      v_user, v_date, p_place, v_now,
      app.attendance_auto_status(v_now, null, v_policy.check_in_to, v_policy.work_minutes),
      app.attendance_auto_status(v_now, null, v_policy.check_in_to, v_policy.work_minutes),
      v_policy.check_in_to, v_policy.work_minutes
    )
    returning * into v_row;
  end if;

  return v_row;
end $$;

/** 오늘 내 근태에 퇴근을 찍는다. 소정 시간을 못 채웠으면 조기퇴근으로 판정된다. */
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
  if v_row.check_out_at is not null then
    raise exception '이미 퇴근을 기록했습니다.';
  end if;

  v_auto := app.attendance_auto_status(
    v_row.check_in_at, v_now, v_row.policy_check_in_to, v_row.policy_work_minutes);

  update public.attendance_days
     set check_out_at     = v_now,
         auto_status_code = v_auto,
         -- 관리자가 이미 고친 행(확정값 ≠ 자동값)은 덮어쓰지 않는다.
         status_code      = case
                              when v_row.auto_status_code is distinct from v_row.status_code
                                then v_row.status_code
                              else v_auto
                            end
   where id = v_row.id
   returning * into v_row;

  return v_row;
end $$;

/** 나에게 적용되는 근무 기준 한 벌(위젯이 근무일·출근 가능 시각·외부근무 허용을 판단한다). */
create or replace function public.my_attendance_policy(p_date date default null)
returns public.attendance_policies
language sql
stable
security definer
set search_path = app, public
as $$
  select app.resolve_attendance_policy(
           app.current_app_user_id(),
           coalesce(p_date, app.kst_today())
         )
   where app.current_app_user_id() is not null
     and app.is_internal_user();
$$;

revoke all on function public.attendance_check_in(public.attendance_place) from public;
revoke all on function public.attendance_check_out() from public;
revoke all on function public.my_attendance_policy(date) from public;
grant execute on function public.attendance_check_in(public.attendance_place) to authenticated;
grant execute on function public.attendance_check_out() to authenticated;
grant execute on function public.my_attendance_policy(date) to authenticated;

-- 11. 관리자 정정 RPC (SECURITY INVOKER) --------------------------------
-- INVOKER인 이유: 여기서 우회할 것이 없다. attendance_days/attendance_edits의 management
-- 쓰기 정책이 그대로 판정하고, 함수는 원장 수정과 이력 기록을 한 트랜잭션으로 묶기만 한다.
-- DEFINER로 두면 정책을 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다.
create or replace function public.set_attendance_record(
  p_user_id    uuid,
  p_work_date  date,
  p_status     text,
  p_check_in   timestamptz,
  p_check_out  timestamptz,
  p_place      public.attendance_place,
  p_note       text,
  p_reason     text
)
returns public.attendance_days
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_policy public.attendance_policies%rowtype;
  v_old    public.attendance_days%rowtype;
  v_row    public.attendance_days%rowtype;
begin
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception '정정 사유를 입력해야 합니다.';
  end if;
  if p_check_out is not null and p_check_in is null then
    raise exception '출근 기록 없이 퇴근만 남길 수 없습니다.';
  end if;

  select * into v_old from public.attendance_days
   where user_id = p_user_id and work_date = p_work_date and deleted_at is null;

  if found then
    update public.attendance_days
       set status_code  = p_status,
           check_in_at  = p_check_in,
           check_out_at = p_check_out,
           work_place   = p_place,
           note         = p_note
     where id = v_old.id
     returning * into v_row;
  else
    -- 결근으로만 그려지던 빈 칸에 상태를 지정하는 경우 — 이때 처음 행이 생긴다.
    v_policy := app.resolve_attendance_policy(p_user_id, p_work_date);
    insert into public.attendance_days (
      user_id, work_date, work_place, check_in_at, check_out_at,
      status_code, auto_status_code, policy_check_in_to, policy_work_minutes, note
    )
    values (
      p_user_id, p_work_date, p_place, p_check_in, p_check_out,
      p_status,
      app.attendance_auto_status(p_check_in, p_check_out,
        coalesce(v_policy.check_in_to, time '09:00'), coalesce(v_policy.work_minutes, 540)),
      coalesce(v_policy.check_in_to, time '09:00'),
      coalesce(v_policy.work_minutes, 540),
      p_note
    )
    returning * into v_row;
  end if;

  -- 이력은 바뀐 필드만, 필드별로 한 줄씩. 사유는 같은 문장을 공유한다.
  if v_old.id is null or v_old.status_code is distinct from v_row.status_code then
    insert into public.attendance_edits (attendance_day_id, field, before_value, after_value, reason)
    values (v_row.id, 'status', v_old.status_code, v_row.status_code, p_reason);
  end if;
  if v_old.id is not null and v_old.check_in_at is distinct from v_row.check_in_at then
    insert into public.attendance_edits (attendance_day_id, field, before_value, after_value, reason)
    values (v_row.id, 'check_in_at', v_old.check_in_at::text, v_row.check_in_at::text, p_reason);
  end if;
  if v_old.id is not null and v_old.check_out_at is distinct from v_row.check_out_at then
    insert into public.attendance_edits (attendance_day_id, field, before_value, after_value, reason)
    values (v_row.id, 'check_out_at', v_old.check_out_at::text, v_row.check_out_at::text, p_reason);
  end if;
  if v_old.id is not null and v_old.work_place is distinct from v_row.work_place then
    insert into public.attendance_edits (attendance_day_id, field, before_value, after_value, reason)
    values (v_row.id, 'work_place', v_old.work_place::text, v_row.work_place::text, p_reason);
  end if;
  if v_old.id is not null and coalesce(v_old.note, '') is distinct from coalesce(v_row.note, '') then
    insert into public.attendance_edits (attendance_day_id, field, before_value, after_value, reason)
    values (v_row.id, 'note', v_old.note, v_row.note, p_reason);
  end if;

  return v_row;
end $$;

revoke all on function public.set_attendance_record(
  uuid, date, text, timestamptz, timestamptz, public.attendance_place, text, text) from public;
grant execute on function public.set_attendance_record(
  uuid, date, text, timestamptz, timestamptz, public.attendance_place, text, text) to authenticated;

-- 12. 조회 RPC — 근무일 판정을 화면이 다시 하지 않게 -------------------
-- 일간 표는 '임직원 명부 + 그날 기록 + 그날이 근무일인가' 셋이 있어야 그려진다. 셋째를
-- 화면에서 계산하면 정책 해석 규칙(임직원 예외 > 전사 기본, 발효일 최신)이 DB와 프론트
-- 두 곳에 살게 되고, 그 둘이 갈리는 순간 표와 판정이 서로 다른 말을 한다.
-- 둘 다 SECURITY INVOKER다 — users·attendance_days의 RLS가 그대로 판정한다.

/** 그날의 전 임직원 근태 한 줄씩(기록이 없으면 근태 칸이 비어 온다). */
create or replace function public.attendance_board(p_date date)
returns table (
  user_id          uuid,
  user_name        text,
  department_id    uuid,
  is_workday       boolean,
  day_id           uuid,
  work_place       public.attendance_place,
  check_in_at      timestamptz,
  check_out_at     timestamptz,
  status_code      text,
  auto_status_code text,
  note             text
)
language sql
stable
security invoker
set search_path = app, public
as $$
  select u.id, u.name, u.department_id,
         coalesce(extract(dow from p_date)::smallint = any (p.workdays), false),
         d.id, d.work_place, d.check_in_at, d.check_out_at,
         d.status_code, d.auto_status_code, d.note
    from public.users u
    left join lateral app.resolve_attendance_policy(u.id, p_date) p on true
    left join public.attendance_days d
           on d.user_id = u.id and d.work_date = p_date and d.deleted_at is null
   where app.can_read_workspace('management')
     and u.deleted_at is null
     and u.user_type not in ('external_startup', 'external_expert', 'temporary_guest')
   order by u.name;
$$;

/** 한 사람의 기간 근태(기록이 없는 날도 줄이 선다 — 결근·휴무를 화면이 그릴 수 있게). */
create or replace function public.attendance_month(
  p_user_id uuid,
  p_from    date,
  p_to      date
)
returns table (
  work_date        date,
  is_workday       boolean,
  day_id           uuid,
  work_place       public.attendance_place,
  check_in_at      timestamptz,
  check_out_at     timestamptz,
  status_code      text,
  auto_status_code text,
  note             text
)
language sql
stable
security invoker
set search_path = app, public
as $$
  select g.d::date,
         coalesce(extract(dow from g.d)::smallint = any (p.workdays), false),
         a.id, a.work_place, a.check_in_at, a.check_out_at,
         a.status_code, a.auto_status_code, a.note
    from generate_series(p_from, p_to, interval '1 day') g(d)
    left join lateral app.resolve_attendance_policy(p_user_id, g.d::date) p on true
    left join public.attendance_days a
           on a.user_id = p_user_id and a.work_date = g.d::date and a.deleted_at is null
   where p_to >= p_from
     and p_to - p_from <= 366   -- 한 번에 훑는 범위를 1년으로 묶는다(대량 Export 경로 차단)
   order by g.d;
$$;

revoke all on function public.attendance_board(date) from public;
revoke all on function public.attendance_month(uuid, date, date) from public;
grant execute on function public.attendance_board(date) to authenticated;
grant execute on function public.attendance_month(uuid, date, date) to authenticated;

-- 13. 코멘트 -----------------------------------------------------------
comment on table public.attendance_policies is
  '근무 기준(출근 가능 시간대·소정 근무시간·근무 요일). user_id가 null이면 전사 기본, 값이 있으면 임직원별 예외.';
comment on table public.attendance_statuses is
  '근태 상태 원장. is_system=true 5종은 규칙이 자동으로 매기는 결과라 코드가 고정이다.';
comment on column public.attendance_days.policy_check_in_to is
  '판정에 쓴 출근 마감(스냅샷). 정책을 바꿔도 과거 판정이 흔들리지 않게 행에 복사해 둔다.';
comment on column public.attendance_days.auto_status_code is
  '규칙이 매긴 원본 상태. status_code와 다르면 관리자가 정정한 행이다.';
comment on table public.attendance_edits is
  '근태 정정 이력(append-only). 사유 필수이며 UPDATE·DELETE 정책을 두지 않는다.';
