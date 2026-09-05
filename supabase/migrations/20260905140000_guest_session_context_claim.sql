-- =====================================================================
-- [게스트 통합 계정 3/4] 판정 — 맥락 클레임 일반화 · 접근 기간 반영
-- 선행: 20260905130000_guest_unified_account_backfill.sql
-- 정본: docs/docs_planning/3_9_1_guest_unified_account.md §7.1, §8
--
-- 왜 클레임을 일반화하는가:
--   지금 세션 토큰에는 program_id 하나뿐이고 app.guest_session_program_id()가 그것을 읽는다.
--   FUND 온기보고가 GUEST로 들어오면 fund_id 클레임이 하나 더 생기고 guest_*_ids() 계열이
--   두 벌로 갈라진다. **섞임을 막는 것은 계정 분리가 아니라 맥락이 언제나 하나라는 것**이므로
--   (context_type, context_id) 쌍을 먼저 세운다. 사업 3종은 여기서 이미 답하고, 장래의
--   fund는 자기 판정 함수를 같은 쌍 위에 얹으면 된다.
--
-- 옛 클레임을 함께 받는 이유:
--   세션 수명이 8시간이라, 배포 직후 살아 있는 토큰은 아직 program_id만 갖고 있다.
--   폴백을 두지 않으면 배포 순간 접속 중인 게스트가 전원 빈 화면이 된다.
--   폴백은 새 Edge Function이 배포된 뒤 8시간이면 실질적으로 죽는다.
--
-- 보안 게이트 답변:
--   - 소유 워크스페이스: guest(판정 헬퍼)
--   - 데이터 등급: 해당 없음(판정 함수)
--   - 접근 주체: 게스트(authenticated). 내부 사용자는 이 함수의 결과를 쓰지 않는다
--   - Scope 기준: 세션 고정 맥락 + 명부의 열린 문 + 사업 생존 + **접근 기간**(신설)
--   - SECURITY DEFINER: 기존과 동일하게 유지한다 — 게스트는 사업 원장 읽기 권한이 없어
--     INVOKER면 자기 사업조차 판정하지 못한다. search_path는 고정되어 있다
--   - 감사 로그: 판정 함수라 해당 없음
--   - 운영 영향: guest_program_ids에 조건이 하나 늘지만 기존 행은 access_* 가 전부 null
--     (= 제한 없음)이라 결과가 동일하다. 신규 개방부터 기간이 채워진다
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 맥락 클레임 — 종류와 대상
-- ---------------------------------------------------------------------
create or replace function app.guest_session_context_type()
returns text
language sql
stable
security definer
set search_path = app, public, auth
as $fn$
  select nullif(auth.jwt() ->> 'context_type', '');
$fn$;

grant execute on function app.guest_session_context_type() to authenticated;

comment on function app.guest_session_context_type() is
  '게스트 세션에 고정된 맥락의 종류(program | ma_program | project_program, 장래 fund 등). 근거: 3_9_1 §7.1';

-- ---------------------------------------------------------------------
-- (2) 세션에 고정된 사업
--
--     context_type이 사업 3종일 때만 context_id를 사업으로 읽는다. 장래에 fund 맥락으로
--     들어온 세션은 여기서 null을 받아 **사업 쪽 조회가 전부 닫힌다** — 이것이 의도다.
--     한 세션은 한 맥락이며, 다른 축의 화면은 자기 판정 함수를 따로 갖는다.
-- ---------------------------------------------------------------------
create or replace function app.guest_session_program_id()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, auth
as $fn$
declare
  v_type  text := nullif(auth.jwt() ->> 'context_type', '');
  v_claim text;
begin
  if v_type is null then
    -- 구 토큰 폴백(배포 직후 8시간). 새 토큰은 반드시 context_type을 싣는다.
    v_claim := auth.jwt() ->> 'program_id';
  elsif v_type in ('program', 'ma_program', 'project_program') then
    v_claim := auth.jwt() ->> 'context_id';
  else
    return null;
  end if;

  if v_claim is null or v_claim = '' then
    return null;
  end if;
  return v_claim::uuid;
exception when others then
  return null;
end;
$fn$;

grant execute on function app.guest_session_program_id() to authenticated;

comment on function app.guest_session_program_id() is
  '게스트 세션에 고정된 사업. context_type이 사업 3종이면 context_id를, 클레임이 없는 구 토큰이면 program_id를 읽는다(배포 유예). 사업이 아닌 맥락이면 null이라 사업 조회가 전부 닫힌다.';

-- ---------------------------------------------------------------------
-- (3) 게스트가 볼 수 있는 사업 — 접근 기간을 조건에 더한다
--
--     네 조건이 모두 성립해야 한다.
--       · 명부에 올라 있고 로그인이 열려 실제로 들어온 행(ACTIVE)
--       · 사업이 살아 있음(종료·취소·삭제가 아님)
--       · 세션에 고정된 맥락과 일치
--       · **접근 기간이 지금을 포함함**(신설) — null은 제한 없음이다
--
--     기간이 별개 조건인 이유: 만료는 차단(login_status)과 다른 축이다. 담당자가 닫은 것과
--     기간이 지난 것을 같은 칸에 적으면, 기간이 지나 자동으로 닫힌 줄을 담당자가 다시 열 때
--     '차단을 푸는 것'과 '기간을 늘리는 것' 중 무엇을 해야 하는지 화면이 답하지 못한다.
-- ---------------------------------------------------------------------
create or replace function app.guest_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $fn$
  with live as (
    select id from public.programs         where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id from public.ma_programs      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id from public.project_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
  )
  select p.program_id
    from public.program_participants p
    join live g on g.id = p.program_id
   where p.user_id = app.current_app_user_id()
     and p.login_status = 'ACTIVE'
     and p.program_id = app.guest_session_program_id()
     and (p.access_starts_at is null or p.access_starts_at <= now())
     and (p.access_ends_at   is null or p.access_ends_at   >  now());
$fn$;

comment on function app.guest_program_ids() is
  '게스트가 볼 수 있는 사업 집합(로그인 개방 + 사업 생존 + 세션 고정 맥락 일치 + 접근 기간 유효). AC·M&A·PROJECT 세 원장을 모두 본다. 근거: 3_9_1 §7~§8';

-- ---------------------------------------------------------------------
-- (4) 열린 참여 목록 — 로그인 후 무엇을 고를 수 있는가
--
--     guest_program_ids()와 조건이 같되 **세션 고정 맥락을 보지 않는다.** 그것이 이 함수의
--     존재 이유다 — 아직 맥락을 고르기 전에 부르는 목록이기 때문이다.
--     SECURITY DEFINER인 이유도 같다: 게스트는 사업 원장 읽기 권한이 없다.
--     대상은 호출자 자신으로 못박아 파라미터를 두지 않는다 — 남의 id를 넣을 자리가 없어야 한다.
-- ---------------------------------------------------------------------
create or replace function public.guest_my_participations()
returns table (
  participant_id uuid,
  program_id     uuid,
  entity_key     text,
  workspace      text,
  code           text,
  title          text,
  role           text,
  access_ends_at timestamptz
)
language sql
stable
security definer
set search_path = app, public
as $fn$
  with live as (
    select 'program'::text as entity_key, id, code, title
      from public.programs         where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'ma_program', id, code, title
      from public.ma_programs      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'project_program', id, code, title
      from public.project_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
  )
  select p.id,
         p.program_id,
         p.entity_key,
         app.entity_key_workspace(p.entity_key),
         g.code,
         g.title,
         p.role::text,
         p.access_ends_at
    from public.program_participants p
    join live g
      on g.id = p.program_id
     and g.entity_key = p.entity_key
   where p.user_id = app.current_app_user_id()
     and p.login_status in ('INVITED', 'ACTIVE')
     and (p.access_starts_at is null or p.access_starts_at <= now())
     and (p.access_ends_at   is null or p.access_ends_at   >  now())
   order by g.title;
$fn$;

revoke all on function public.guest_my_participations() from public;
grant execute on function public.guest_my_participations() to authenticated;

comment on function public.guest_my_participations() is
  '호출자 본인의 열린 참여 목록. 세션 고정 맥락을 보지 않는다 — 맥락을 고르기 전에 부르는 목록이기 때문이다. 파라미터를 두지 않아 남의 id를 넣을 자리가 없다. 근거: 3_9_1 §7';
