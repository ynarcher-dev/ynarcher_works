-- =====================================================================
-- 회의록 외부 참석자를 문자열 명단에서 networks 상호참조로 승격
--
-- 배경
--   외부 참석자는 `meeting_minutes.external_attendees text[]`에 '이름/소속' 표기 문자열로만
--   담겼다(20260723160000). 그런데 입력 피커는 이미 networks 원장을 검색해서 고르게 하고,
--   없으면 간이 등록으로 **원장에 실제 인물을 만든 뒤** 그 이름을 문자열로 떨어뜨린다 —
--   즉 원장 레코드를 손에 쥐고도 이름만 베껴 적고 참조를 버렸다. 결과가 셋이었다.
--     1) 상세에서 외부 참석자 이름을 눌러도 그 사람에게 갈 수 없다.
--     2) networks 인물 상세의 '관련 회의록'에 그 회의가 뜨지 않는다 — 그 사람이 실제로
--        참석한 회의인데도, 연동(meeting_minute_links)으로 따로 걸어야만 잡혔다.
--     3) 그래서 같은 사람이 외부 참석자 줄(문자열)과 연동 줄(링크)에 두 번 서고, 이름이
--        바뀌면 문자열 쪽만 옛 이름으로 남는다.
--
-- 결정: 원장을 새로 만들지 않고 meeting_minute_links에 `role`을 단다
--   외부 참석자가 기록하는 사실은 "이 회의록이 이 networks 인물을 가리킨다"로, 연동이
--   기록하는 사실과 **같은 모양**이다. 다른 것은 가리키는 이유 하나뿐이다 —
--   회의가 '다룬 대상'인가(SUBJECT), 회의에 '온 사람'인가(EXTERNAL_ATTENDEE).
--   이유가 하나 다르다고 원장을 하나 더 만들면 역방향 조회(관련 회의록)·열람 정책·
--   쓰기 RPC를 전부 두 벌로 갖게 되고, 두 원장이 같은 사람을 가리킬 때 어느 쪽이 참인지
--   판정할 근거가 없다. 그래서 컬럼 하나를 더한다.
--
--   같은 이유로 `unique (minute_id, target_type, target_id)`는 그대로 둔다 — 한 회의록에서
--   한 대상은 한 줄이고, 역할이 그 줄의 성격을 말한다. 이 제약이 곧 위 3)의 중복을 막는다.
--
-- 남기는 것: external_attendees text[]
--   지우지 않는다. 아래 백필은 **원장에서 한 사람으로 확정되는 표기만** 옮기고(이름과 소속이
--   정확히 같은 살아 있는 행이 원장 전체에서 딱 하나일 때), 확정되지 않는 표기는 문자열로
--   남긴다. 애매한 매칭으로 엉뚱한 사람을 연결하는 것은 링크가 없는 것보다 나쁘다 —
--   그 회의에 오지 않은 사람의 상세에 남의 회의가 뜬다. 남은 문자열은 화면에서 링크 없는
--   텍스트로 서고, 편집 화면에서는 뺄 수만 있다(새로 넣는 경로는 이제 없다).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(회의록) / networks(연동 대상). 데이터 등급: Internal.
--     이 경로로 흐르는 것은 인물의 이름·소속뿐이며 연락처·이메일 원본은 지나지 않는다.
--   · 접근 주체: 내부 사용자. 게스트는 meeting_minutes/meeting_minute_links를 못 읽는다.
--   · 신규 테이블·신규 정책 없음 — 기존 테이블에 컬럼 1개와 CHECK 2개를 더한다.
--     읽기 정책(app.can_read_minute)·쓰기 경로(app.set_minute_links RPC 전용, 조인 테이블에
--     write 정책 없음)는 그대로다. role은 열람 범위를 넓히지 않는다(같은 행의 성격 표시일 뿐).
--   · SECURITY DEFINER 함수는 기존 app.set_minute_links 하나를 재정의하며 search_path 고정과
--     첫 줄 권한 확인(작성자/admin)을 그대로 유지한다. 대상별 재검증
--     (app.can_link_minute_target)도 그대로이고, 여기에 역할별 대상 종류 검증을 더한다.
--   · 백필은 SELECT 결과로만 INSERT/UPDATE하며 개인정보를 새로 노출하지 않는다.
-- 근거: 20260723160000_meeting_minutes_external_attendees.sql(문자열 명단 도입),
--       20260723220000_meeting_minute_links.sql(링크 원장·set_minute_links 원형),
--       20260825150000_network_minute_links.sql(networks 10종 확장·can_link_minute_target)
-- =====================================================================

-- (1) 역할 컬럼 -----------------------------------------------------------
-- 기존 행은 전부 '회의가 다룬 대상'이므로 SUBJECT가 기본값이자 백필값이다.
alter table public.meeting_minute_links
  add column if not exists role text not null default 'SUBJECT';

alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_role_check;
alter table public.meeting_minute_links
  add constraint meeting_minute_links_role_check
  check (role in ('SUBJECT', 'EXTERNAL_ATTENDEE'));

-- 사업·스타트업·펀드는 회의에 참석하지 않는다 — 외부 참석자 역할은 networks 인물/조직
-- 원장 10종에만 허용한다. UI가 그것만 검색하더라도 원장이 최종 강제한다.
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_attendee_target_check;
alter table public.meeting_minute_links
  add constraint meeting_minute_links_attendee_target_check
  check (
    role <> 'EXTERNAL_ATTENDEE'
    or target_type in (
      'expert', 'van', 'exp', 'investor', 'corporate', 'institution',
      'university', 'etc', 'other', 'global_network'
    )
  );

comment on column public.meeting_minute_links.role is
  '이 회의록이 대상을 가리키는 이유 — SUBJECT(회의가 다룬 대상) / EXTERNAL_ATTENDEE(회의에 온 사외 인원, networks 원장 10종만)';

-- (2) 문자열 명단 백필 ----------------------------------------------------
-- '이름/소속' 표기를 networks 디렉토리 원장 9종에서 되찾아 링크로 옮긴다.
-- 확정 조건은 하나 — 이름과 소속이 정확히 같은 살아 있는 행이 원장 전체에서 딱 하나일 것.
do $backfill$
declare
  v_moved int := 0;
begin
  create temporary table _minute_ext_match on commit drop as
  with parsed as (
    -- 표기 규약(ExternalAttendeePicker.toDisplay): 소속이 있으면 '이름/소속', 없으면 '이름'.
    select m.id as minute_id,
           raw,
           btrim(case when position('/' in raw) > 0
                      then left(raw, position('/' in raw) - 1)
                      else raw end) as nm,
           nullif(btrim(case when position('/' in raw) > 0
                             then substr(raw, position('/' in raw) + 1)
                             else '' end), '') as aff
      from public.meeting_minutes m
      cross join lateral unnest(m.external_attendees) as ext(raw)
     where m.deleted_at is null
       and coalesce(array_length(m.external_attendees, 1), 0) > 0
  ),
  candidates as (
    -- 다형 키는 attachments/entity_feedback와 같은 단수 키(minuteLinks.ts와 값이 일치해야 한다).
              select 'van'::text        as t, x.id, x.name, x.affiliation from public.van x          where x.deleted_at is null and x.merged_into_id is null
    union all select 'exp',                   x.id, x.name, x.affiliation from public.exp x          where x.deleted_at is null and x.merged_into_id is null
    union all select 'expert',                x.id, x.name, x.affiliation from public.experts x      where x.deleted_at is null and x.merged_into_id is null
    union all select 'investor',              x.id, x.name, x.affiliation from public.investors x    where x.deleted_at is null and x.merged_into_id is null
    union all select 'corporate',             x.id, x.name, x.affiliation from public.corporates x   where x.deleted_at is null and x.merged_into_id is null
    union all select 'institution',           x.id, x.name, x.affiliation from public.institutions x where x.deleted_at is null and x.merged_into_id is null
    union all select 'university',            x.id, x.name, x.affiliation from public.universities x where x.deleted_at is null and x.merged_into_id is null
    union all select 'etc',                   x.id, x.name, x.affiliation from public.etc x          where x.deleted_at is null and x.merged_into_id is null
    union all select 'other',                 x.id, x.name, x.affiliation from public.others x       where x.deleted_at is null and x.merged_into_id is null
  )
  select p.minute_id,
         p.raw,
         -- having가 단일 매칭만 남기므로 집계는 그 한 행을 꺼내는 수단일 뿐이다.
         -- uuid에 min()이 없는 서버가 있어 array_agg로 꺼낸다.
         (array_agg(c.t))[1]  as target_type,
         (array_agg(c.id))[1] as target_id
    from parsed p
    join candidates c
      on btrim(c.name) = p.nm
     and coalesce(nullif(btrim(c.affiliation), ''), '') = coalesce(p.aff, '')
   group by p.minute_id, p.raw
  -- 둘 이상 걸리면 누구인지 확정할 수 없다 — 옮기지 않고 문자열로 남긴다.
  having count(*) = 1;

  -- 이미 연동(SUBJECT)으로 걸려 있던 사람은 역할을 참석자로 올린다. 작성자가 명단에 따로
  -- 적어 둔 '참석했다'가 '다뤘다'보다 구체적인 사실이고, 한 줄에 한 성격만 설 수 있다.
  insert into public.meeting_minute_links (minute_id, target_type, target_id, role)
  select minute_id, target_type, target_id, 'EXTERNAL_ATTENDEE'
    from _minute_ext_match
  on conflict (minute_id, target_type, target_id)
    do update set role = 'EXTERNAL_ATTENDEE';

  get diagnostics v_moved = row_count;

  -- 옮긴 표기는 문자열 명단에서 뺀다 — 남겨 두면 같은 사람이 두 줄에 선다.
  update public.meeting_minutes m
     set external_attendees = coalesce(
           array(
             select ext.raw
               from unnest(m.external_attendees) as ext(raw)
              where not exists (
                    select 1 from _minute_ext_match x
                     where x.minute_id = m.id and x.raw = ext.raw)
           ),
           '{}'::text[])
   where exists (select 1 from _minute_ext_match x where x.minute_id = m.id);

  raise notice '외부 참석자 문자열 → networks 링크 승격: % 건', v_moved;
end
$backfill$;

comment on column public.meeting_minutes.external_attendees is
  '외부 참석자 잔존 표기(원장에서 한 사람으로 확정되지 않은 옛 문자열). 새 입력은 meeting_minute_links(role=EXTERNAL_ATTENDEE)로 들어간다 — 표시용이며 접근권한과 무관';

-- (3) 링크 일괄 교체 RPC — 역할을 함께 받는다 ------------------------------
-- 쓰기 경로는 여전히 여기 하나다(조인 테이블 write 정책 없음). 연동과 외부 참석자를 한 번의
-- 호출로 함께 교체하므로, 편집 중에 한쪽만 반영되어 명단이 어긋나는 구간이 생기지 않는다.
-- p_links 예: '[{"target_type":"program","target_id":"..."},
--               {"target_type":"expert","target_id":"...","role":"EXTERNAL_ATTENDEE"}]'
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
    -- 같은 대상이 두 역할로 실려 오면 참석자 쪽을 남긴다(unique 제약이 한 줄만 허용한다).
    select distinct on (target_type, target_id) target_type, target_id, role
      from (
        select (elem->>'target_type') as target_type,
               (elem->>'target_id')::uuid as target_id,
               coalesce(nullif(elem->>'role', ''), 'SUBJECT') as role
          from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) as elem
         where elem->>'target_type' is not null
           and elem->>'target_id' is not null
      ) src
     order by target_type, target_id, (role = 'EXTERNAL_ATTENDEE') desc
  loop
    if r.role not in ('SUBJECT', 'EXTERNAL_ATTENDEE') then
      raise exception '알 수 없는 연동 역할입니다: %', r.role using errcode = '22023';
    end if;

    if r.role = 'EXTERNAL_ATTENDEE' and r.target_type not in (
      'expert', 'van', 'exp', 'investor', 'corporate', 'institution',
      'university', 'etc', 'other', 'global_network'
    ) then
      raise exception '외부 참석자로 담을 수 없는 대상 종류입니다: %', r.target_type
        using errcode = '22023';
    end if;

    if not app.can_link_minute_target(r.target_type, r.target_id) then
      raise exception '연동할 수 없는 대상입니다(권한 없음 또는 삭제됨): % %',
        r.target_type, r.target_id using errcode = '42501';
    end if;

    insert into public.meeting_minute_links (minute_id, target_type, target_id, role)
    values (p_minute_id, r.target_type, r.target_id, r.role)
    on conflict (minute_id, target_type, target_id) do nothing;
  end loop;
end $$;

revoke all on function app.set_minute_links(uuid, jsonb) from public;
grant execute on function app.set_minute_links(uuid, jsonb) to authenticated;

comment on function app.set_minute_links(uuid, jsonb) is
  '회의록 연동 대상·외부 참석자 일괄 교체(role: SUBJECT/EXTERNAL_ATTENDEE). 작성자/admin만, 대상별 can_link_minute_target 통과분만 반영.';

comment on table public.meeting_minute_links is
  '회의록↔사업/스타트업/펀드/NETWORKS 다형 링크. role이 가리키는 이유를 말한다(SUBJECT=회의가 다룬 대상, EXTERNAL_ATTENDEE=회의에 온 사외 인원). 읽기 app.can_read_minute(), 쓰기 app.set_minute_links() RPC 전용';
