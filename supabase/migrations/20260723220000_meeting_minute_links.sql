-- =====================================================================
-- [Phase 5] OFFICE 회의록 ↔ 사업/스타트업 연동(cross-reference) 계층
-- 설계 정본: docs/docs_master/CLAUDE.md(다형 참조·작성자 전용 쓰기), 본 세션 결정.
--
-- 목적: 회의록 1건을 AC/M&A/PROJECT 사업 또는 STARTUP 발굴기업 N건과 상호 참조로
--   연결한다. 아무것도 연결하지 않으면 일반 회의록이다. 관계형으로 묶여 회의록 상세에서
--   대상을, 대상 상세에서 관련 회의록을 양방향으로 조회한다.
--
-- 핵심 구조(다형 링크 조인):
-- - meeting_minute_links(minute_id, target_type, target_id) — attachments.target_type /
--   entity_contributions.entity_table와 동일한 다형 참조 규약을 재사용한다. 전용 FK 컬럼을
--   대상 종류마다 늘리지 않아 향후 대상 확장이 값 추가만으로 끝난다.
-- - target_type 값은 사업 원장의 entityKey를 그대로 쓴다:
--   'program'(AC) / 'ma_program'(M&A) / 'project_program'(PROJECT) / 'startup'(STARTUP).
--
-- 열람 판정(양방향을 정책 한 줄이 처리):
-- - 링크 SELECT = app.can_read_minute(minute_id). 회의록 상세에서는 볼 수 있는 회의록의
--   링크만, 대상 상세에서 target으로 역조회해도 열람 불가한 PARTICIPANTS 회의록은 애초에
--   행이 돌아오지 않는다 — 일부공개 회의록이 사업/스타트업 페이지로 새는 것을 원천 차단.
--
-- 쓰기(작성자 전용, RPC 한 곳으로 집약):
-- - 조인 테이블에 write RLS 정책을 두지 않아(Default Deny) 직접 INSERT/UPDATE/DELETE를
--   모두 차단하고, app.set_minute_links() RPC로만 명단을 일괄 교체한다(set_minute_people 대칭).
-- - RPC는 첫 줄에서 작성자/관리자 권한을 확인한 뒤, 각 대상이 요청자에게 열람 가능한지
--   app.can_link_minute_target()로 서버측 재검증한다(접근 불가·삭제·미존재 대상은 거부).
--   UI에서 접근 가능한 것만 보여주더라도 서버가 최종 강제한다("UI 숨김은 보안이 아니다").
--
-- 근거: 20260723140000_office_meeting_minutes.sql(set_minute_people·can_read_minute 패턴),
--       20260720130000_ws_program_scope_helper.sql(can_access_ws_program),
--       20260705120500_rls_enable_policies.sql:123-131(startups_select = networks read),
--       20260720140000/150000_*_program_schema.sql:281-282(program 원장 SELECT 정책 형태)
-- =====================================================================

-- 1. 링크 조인 테이블 ----------------------------------------------------
-- target_type은 enum 대신 text + CHECK로 둔다(attachments/entity_contributions와 동일 규약).
create table if not exists public.meeting_minute_links (
  id           uuid primary key default gen_random_uuid(),
  minute_id    uuid not null references public.meeting_minutes(id) on delete cascade,
  target_type  text not null
    check (target_type in ('program', 'ma_program', 'project_program', 'startup')),
  target_id    uuid not null,
  created_at   timestamptz not null default now(),
  unique (minute_id, target_type, target_id)       -- 같은 대상을 한 회의록에 중복 연결 금지
);
create index if not exists idx_minute_links_minute
  on public.meeting_minute_links (minute_id);
create index if not exists idx_minute_links_target
  on public.meeting_minute_links (target_type, target_id);   -- 역방향(대상→회의록) 조회 축

-- 2. 대상 연동 가능 판정 헬퍼 -------------------------------------------
-- 요청자가 해당 대상을 '볼 수 있는가'를 각 원장의 SELECT 정책과 동일하게 재현하고,
-- 소프트삭제·미존재 대상을 함께 배제한다. 교차 원장 조회를 SECURITY DEFINER로 이관해
-- 호출부(RPC)의 재귀·권한 경계 문제를 피하며, 실제 권한은 내부 app.* 헬퍼로 판정한다.
create or replace function app.can_link_minute_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'project_program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
      and exists (select 1 from public.project_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$$;

revoke all on function app.can_link_minute_target(text, uuid) from public;
grant execute on function app.can_link_minute_target(text, uuid) to authenticated;

-- 3. 링크 일괄 교체 RPC -------------------------------------------------
-- 회의록의 연동 대상은 이 RPC로만 변경한다. 조인 테이블에 write RLS 정책이 없어(Default Deny)
-- 직접 write는 전부 차단되며, 쓰기 경로가 여기 하나로 모인다. SECURITY DEFINER지만 첫 줄에서
-- 작성자/관리자 권한을 직접 확인한 뒤, 각 대상마다 열람 권한을 can_link_minute_target으로
-- 재검증한 통과분만 반영한다.
-- p_links 예: '[{"target_type":"program","target_id":"..."},{"target_type":"startup","target_id":"..."}]'
create or replace function app.set_minute_links(p_minute_id uuid, p_links jsonb)
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

revoke all on function app.set_minute_links(uuid, jsonb) from public;
grant execute on function app.set_minute_links(uuid, jsonb) to authenticated;

-- 4. RLS ----------------------------------------------------------------
alter table public.meeting_minute_links enable row level security;

-- 읽기: 회의록을 볼 수 있는 사람만(양방향 열람을 이 한 줄이 처리).
drop policy if exists minute_links_select on public.meeting_minute_links;
create policy minute_links_select on public.meeting_minute_links for select
  using (app.can_read_minute(minute_id));

-- 쓰기 정책 없음(Default Deny) — app.set_minute_links() RPC 전용.

-- 5. 코멘트 --------------------------------------------------------------
comment on table public.meeting_minute_links is
  '회의록↔사업/스타트업 다형 링크(program/ma_program/project_program/startup). 읽기 app.can_read_minute(), 쓰기 app.set_minute_links() RPC 전용(직접 write 차단)';
comment on function app.can_link_minute_target(text, uuid) is
  '요청자가 연동 대상을 열람 가능한가(각 원장 SELECT 정책 재현 + 소프트삭제·미존재 배제). set_minute_links 서버측 재검증용.';
comment on function app.set_minute_links(uuid, jsonb) is
  '회의록 연동 대상 일괄 교체. 작성자/admin만, 대상별 can_link_minute_target 통과분만 반영.';
