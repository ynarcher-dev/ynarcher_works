-- =====================================================================
-- [게스트 통합 계정 2/4] 이관 — 계정 키 백필 · 중복 계정 병합 · 자격증명 이관
-- 선행: 20260905120000_guest_unified_account_schema.sql
-- 정본: docs/docs_planning/3_9_1_guest_unified_account.md §12.1
--
-- 무엇을 옮기는가:
--   종전에는 같은 기업·같은 전문가라도 사업이 다르면 users 행이 따로 생겼다. 그 행들을
--   **가장 먼저 만들어진 하나로 모으고**, 그것을 가리키던 참조를 전부 재배선한다.
--   흡수된 계정은 **물리 삭제하지 않는다**(물리 삭제 금지 원칙) — is_active=false +
--   deleted_at으로 재우며, 부분 유니크 인덱스가 deleted_at is null만 보므로 자리를 비켜 준다.
--
-- 재배선을 손으로 나열하지 않는 이유:
--   게스트가 남긴 기록(QNA·지원서·첨부·피드백)이 어느 컬럼으로 계정을 가리키는지 손으로
--   적으면 빠뜨리는 것이 생기고, 빠뜨린 컬럼은 **없는 계정을 가리키는 행**이 되어 그 기록이
--   누구 것인지 답할 수 없게 된다. FK 카탈로그가 대상을 답하게 한다(모듈 하드 딜리트가
--   app.module_content_tables로 대상을 찾는 것과 같은 자세).
--
-- 보안 게이트 답변:
--   - 소유 워크스페이스: admin(계정 원장 정리)
--   - 데이터 등급: Personal(계정) + Secret(자격증명 이관)
--   - 접근 주체: 없음 — 마이그레이션 실행 시점의 DDL/DML이며 런타임 경로를 열지 않는다
--   - SECURITY DEFINER 신설: 없음. 새 정책·새 GRANT 없음
--   - 감사 로그: 이관은 운영 행위가 아니라 스키마 전환이므로 audit_logs에 적재하지 않고
--     RAISE NOTICE로 건수를 남긴다(마이그레이션 로그가 그 기록이다)
--   - 운영 영향: 흡수된 계정의 세션은 session_version 증가로 즉시 끊긴다. 해당 게스트는
--     대표 계정의 비밀번호로 다시 들어오며, 그 비밀번호는 아래 (4)에서 이관된다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 계정 키 백필 — 초대 → 명부 → 원장 행
--
--     한 계정이 여러 초대에 걸려 있을 수 있으나 원장 행은 같아야 정상이다. 어긋난 계정
--     (한 계정이 두 원장 행을 가리킴)은 손대지 않고 남긴다 — 자동으로 고를 근거가 없고,
--     잘못 고르면 그 계정의 기록이 엉뚱한 회사에 붙는다. 아래 (5)가 그런 계정을 보고한다.
-- ---------------------------------------------------------------------
with resolved as (
  select gi.app_user_id                as user_id,
         min(pp.master_table)          as master_table,
         min(pp.master_id::text)::uuid as master_id,
         count(distinct pp.master_table || ':' || pp.master_id::text) as variants
    from public.guest_invitations gi
    join public.program_participants pp on pp.id = gi.participant_id
   where gi.app_user_id is not null
     and pp.master_table is not null
     and pp.master_id is not null
   group by gi.app_user_id
)
update public.users u
   set guest_master_table = r.master_table,
       guest_master_id    = r.master_id
  from resolved r
 where u.id = r.user_id
   and r.variants = 1
   and u.guest_master_id is null;

-- ---------------------------------------------------------------------
-- (2) 중복 계정 병합
--
--     같은 원장 행을 가리키는 계정이 여럿이면 가장 먼저 만들어진 것이 대표다. 대표를
--     '가장 최근에 로그인한 것'으로 고르지 않는 이유: 기존 기록(작성자·제출자)이 붙어 있는
--     쪽은 오래된 계정일 가능성이 높고, 재배선 대상이 적은 쪽을 대표로 삼아야 사고 면이 좁다.
-- ---------------------------------------------------------------------
do $$
declare
  r            record;
  fk           record;
  v_merged     int := 0;
  v_rewired    int := 0;
  v_rows       bigint;
begin
  for r in
    select u.guest_master_table,
           u.guest_master_id,
           (array_agg(u.id order by u.created_at, u.id))[1]      as canonical_id,
           (array_agg(u.id order by u.created_at, u.id))[2:]     as absorbed_ids
      from public.users u
     where u.guest_master_id is not null
       and u.deleted_at is null
     group by u.guest_master_table, u.guest_master_id
    having count(*) > 1
  loop
    -- workspace_permissions는 unique(user_id, workspace_key)라 재배선하면 충돌한다.
    -- 대표 계정이 이미 자기 권한 행을 갖고 있으므로 흡수 계정의 행은 지운다
    -- (권한 템플릿에서 파생되는 값이라 잃는 사실이 없다).
    delete from public.workspace_permissions
     where user_id = any (r.absorbed_ids);

    -- 나머지는 users(id)를 가리키는 FK 컬럼 전체를 카탈로그가 답한다.
    for fk in
      select con.conrelid::regclass::text as tbl,
             att.attname                  as col
        from pg_constraint con
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = con.conkey[1]
       where con.contype = 'f'
         and con.confrelid = 'public.users'::regclass
         and array_length(con.conkey, 1) = 1
         and con.conrelid::regclass::text <> 'public.workspace_permissions'
    loop
      execute format('update %s set %I = $1 where %I = any ($2)', fk.tbl, fk.col, fk.col)
        using r.canonical_id, r.absorbed_ids;
      get diagnostics v_rows = row_count;
      v_rewired := v_rewired + v_rows;
    end loop;

    -- guest_invitations.app_user_id는 FK가 아닐 수 있으므로 명시적으로 한 번 더 건다.
    update public.guest_invitations
       set app_user_id = r.canonical_id
     where app_user_id = any (r.absorbed_ids);

    -- 흡수 계정을 재운다. 세션 번호를 올려 발급된 토큰까지 죽인다 — 올리지 않으면
    -- 사라진 계정의 토큰으로 계속 들어온다.
    update public.users
       set is_active       = false,
           deleted_at      = now(),
           session_version = session_version + 1,
           updated_at      = now()
     where id = any (r.absorbed_ids);

    v_merged := v_merged + array_length(r.absorbed_ids, 1);
  end loop;

  raise notice '게스트 계정 병합: 흡수 %건, 참조 재배선 %행', v_merged, v_rewired;
end $$;

-- ---------------------------------------------------------------------
-- (3) 원장 행이 없는 계정(temporary_guest 등)은 그대로 둔다
--     초대 행이 곧 계정인 종전 방식이 유지되며, 아래 자격증명 이관에는 포함된다.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- (4) 자격증명 이관 — 초대 행에서 계정으로
--
--     한 계정에 초대가 여럿이면 **가장 최근에 정한 비밀번호**를 가져온다. 그것이 그 사람이
--     마지막으로 기억하고 있는 값이기 때문이다. 잠금 상태는 옮기지 않는다 — 이관 시점의
--     잠금은 옛 구조에서 센 값이라, 계정 단위로 다시 세는 편이 맞다.
-- ---------------------------------------------------------------------
insert into public.guest_credentials (user_id, password_hash, password_set_at)
select distinct on (gi.app_user_id)
       gi.app_user_id,
       gi.password_hash,
       gi.password_set_at
  from public.guest_invitations gi
  join public.users u on u.id = gi.app_user_id
 where gi.app_user_id is not null
   and gi.password_hash is not null
   and u.deleted_at is null
 order by gi.app_user_id, gi.password_set_at desc nulls last
on conflict (user_id) do nothing;

-- 흡수된 계정이 비밀번호를 갖고 대표 계정이 갖지 못한 경우를 메운다. (2)에서 app_user_id를
-- 대표로 재배선했으므로 위 조회가 이미 대표를 채우지만, 재배선 이전 상태로 남은 행이
-- 있을 수 있어 한 번 더 확인한다.
insert into public.guest_credentials (user_id, password_hash, password_set_at)
select u.id, null, null
  from public.users u
 where u.guest_master_id is not null
   and u.deleted_at is null
   and not exists (select 1 from public.guest_credentials c where c.user_id = u.id)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- (5) 손대지 않은 것 보고 — 사람이 판단해야 하는 잔여
-- ---------------------------------------------------------------------
do $$
declare
  v_multi  int;
  v_nokey  int;
begin
  select count(*) into v_multi
    from (
      select gi.app_user_id
        from public.guest_invitations gi
        join public.program_participants pp on pp.id = gi.participant_id
       where gi.app_user_id is not null
         and pp.master_id is not null
       group by gi.app_user_id
      having count(distinct pp.master_table || ':' || pp.master_id::text) > 1
    ) x;

  select count(*) into v_nokey
    from public.users u
   where app.is_guest_user_type(u.user_type)
     and u.deleted_at is null
     and u.guest_master_id is null;

  if v_multi > 0 then
    raise warning '한 계정이 두 원장 행을 가리켜 키를 채우지 못한 계정 %건 — ADMIN 게스트 계정 화면에서 손으로 정리해야 한다.', v_multi;
  end if;
  raise notice '원장 키가 없는 게스트 계정 %건(temporary_guest 등 정상 포함).', v_nokey;
end $$;
