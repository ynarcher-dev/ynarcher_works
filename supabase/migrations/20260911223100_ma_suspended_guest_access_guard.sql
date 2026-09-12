-- 중단된 M&A 딜의 게스트 문도 취소 딜과 같이 닫는다.
-- SUSPENDED enum 값은 직전 마이그레이션에서 추가했으므로 별도 트랜잭션인 이 파일에서 사용한다.

create or replace function app.guest_program_ids()
returns setof uuid language sql stable security definer set search_path = app, public as $fn$
  with live as (
    select id, guest_access_ends_at from public.programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.ma_programs
      where deleted_at is null and status not in ('FINISHED', 'SUSPENDED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.funds
      where deleted_at is null and status <> 'CLOSED'
  )
  select p.program_id
    from public.program_participants p
    join live g on g.id = p.program_id
   where p.user_id = app.current_app_user_id()
     and p.login_status = 'ACTIVE'
     and p.program_id = app.guest_session_program_id()
     and (g.guest_access_ends_at is null or g.guest_access_ends_at > now());
$fn$;

comment on function app.guest_program_ids() is
  '게스트가 볼 수 있는 맥락 집합(로그인 개방 + 원장 생존 + 세션 고정 맥락 일치). M&A 중단·취소 딜은 제외한다.';

create or replace function public.guest_my_participations()
returns table(participant_id uuid, program_id uuid, entity_key text, workspace text,
              code text, title text, persona text, access_ends_at timestamptz)
language sql stable security definer set search_path = app, public as $fn$
  with live as (
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at
      from public.programs    where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'ma_program', id, code, title, guest_access_ends_at
      from public.ma_programs where deleted_at is null and status not in ('FINISHED', 'SUSPENDED', 'CANCELLED')
    union all
    select 'fund', id, code, name, guest_access_ends_at
      from public.funds       where deleted_at is null and status <> 'CLOSED'
  )
  select p.id,
         p.program_id,
         p.entity_key,
         app.entity_key_workspace(p.entity_key),
         g.code,
         g.title,
         p.master_table,
         g.guest_access_ends_at
    from public.program_participants p
    join live g
      on g.id = p.program_id
     and g.entity_key = p.entity_key
   where p.user_id = app.current_app_user_id()
     and p.login_status in ('INVITED', 'ACTIVE')
     and (g.guest_access_ends_at is null or g.guest_access_ends_at > now())
   order by g.title;
$fn$;

-- 로그인 개방·재개 RPC가 명부의 문을 열기 직전에 한 곳에서 막는다. 각 RPC 본문을 복제하지 않아
-- 이후 계정 발급 규칙이 바뀌어도 이 상태 게이트는 그대로 적용된다. 예외가 나면 RPC 트랜잭션
-- 전체가 롤백되므로 계정·초대만 만들어지고 실제 문은 닫힌 반쪽 상태도 남지 않는다.
create or replace function app.guard_suspended_ma_guest_access()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if new.entity_key = 'ma_program'
     and new.login_status in ('INVITED', 'ACTIVE')
     and exists (
       select 1
         from public.ma_programs p
        where p.id = new.program_id
          and p.deleted_at is null
          and p.status = 'SUSPENDED'
     ) then
    raise exception '중단된 M&A 딜은 게스트 로그인을 열 수 없습니다.' using errcode = '22023';
  end if;
  return new;
end;
$fn$;

revoke all on function app.guard_suspended_ma_guest_access() from public;

drop trigger if exists trg_guard_suspended_ma_guest_access on public.program_participants;
create trigger trg_guard_suspended_ma_guest_access
  before insert or update of login_status on public.program_participants
  for each row execute function app.guard_suspended_ma_guest_access();

comment on function app.guard_suspended_ma_guest_access() is
  '중단된 M&A 딜에서 게스트 명부의 로그인 상태를 INVITED·ACTIVE로 열지 못하게 한다. 기존 활성 세션은 app.guest_program_ids가 함께 차단한다.';
