-- =====================================================================
-- public 스키마 기본 권한(default privileges) — 잔여 권한의 재발을 끊습니다
--
-- 앞 마이그레이션은 **그때 존재하던 표 159개 전수**의 비행 권한을 회수했습니다. 그것만으로는
-- 다음에 만드는 표에서 같은 잔여가 다시 생깁니다. 원인은 표마다의 실수가 아니라 스키마의
-- 기본값이기 때문입니다.
--
-- 재생된 DB에서는 비행 권한만 남지만, 예전 Data API 기본값으로 만든 클라우드 프로젝트에는
-- 행 권한까지 남아 있을 수 있습니다(pg_default_acl, grantor = postgres, schema = public).
--
--   table    → anon, authenticated, service_role 에 TRUNCATE·REFERENCES·TRIGGER·MAINTAIN
--   sequence → anon, authenticated, service_role 에 UPDATE
--   function → postgres 만 EXECUTE
--
-- 따라서 특정 권한만 골라 회수하지 않고 anon·authenticated의 표·시퀀스 기본 권한을 모두
-- 비웁니다. Data API 권한은 객체를 만드는 마이그레이션에서 이름을 적어 부여해야 하며,
-- TRUNCATE는 정책을 거치지 않고 표를 통째로 비우는 RLS 우회 경로이기도 합니다.
--
-- 시퀀스도 같은 사정입니다. 기본값이 anon·authenticated에 UPDATE를 줍니다. UPDATE는
-- `nextval`·`setval`을 함께 여는 권한이라, 앱 롤이 남의 표의 채번을 임의의 값으로 밀어 버릴
-- 수 있습니다. 지금 public 스키마에 시퀀스는 **0개**이므로(acl-inventory.json counts.sequences)
-- 이 회수는 현재 동작을 바꾸지 않고, 앞으로 `serial` 칼럼이 생길 때 잔여가 자동으로 붙는 것만
-- 막습니다. 채번이 필요한 표는 그 표를 만드는 마이그레이션이 이름을 적어 `usage`를 줍니다
-- (`generated as identity`는 칼럼에 매인 시퀀스라 권한 자체가 필요 없습니다 — 그쪽을 권합니다).
--
-- 이 파일이 하는 것
--   · `alter default privileges for role postgres in schema public`으로 anon·authenticated의
--     표·시퀀스 기본 권한을 모두 회수합니다.
--   · 소유자를 `for role postgres`로 못박습니다. 기본 권한은 **객체를 만든 롤**에 매이므로
--     생략하면 이 마이그레이션을 실행하는 롤에만 붙고, 다른 롤이 만든 표에는 적용되지
--     않습니다. 저장소의 모든 public 표는 postgres 소유입니다(재생 DB에서 159/159 확인).
--
-- 하지 않는 것
--   · **DML 기본 부여를 만들지 않습니다.** 새 표는 계속 "권한 없음"으로 태어나고, 필요한
--     권한은 그 표를 만드는 마이그레이션이 이름을 적어 줍니다. 이것이 11_migration_security_gate.md
--     가 요구하는 순서입니다.
--   · **service_role의 기본 권한은 건드리지 않습니다.** 서버 신뢰 롤이라 급하지 않고,
--     지금 손대면 이번 범위 밖의 거동 변화가 따라옵니다(별도 판단 대상).
--   · 이미 만들어진 표의 권한은 바꾸지 않습니다 — 그것은 앞 마이그레이션이 합니다.
--     기본 권한은 **앞으로 만들 객체**에만 적용됩니다.
--
-- PUBLIC 경유 상속은 없습니다. 재생 DB에서 public 스키마 표의 PUBLIC 대상 grant 0건,
-- pg_default_acl의 PUBLIC 항목 0건을 확인했으므로 회수 대상은 두 앱 롤뿐입니다.
-- =====================================================================

-- ── 회수: 앞으로 만들 표의 비행 권한 ────────────────────────────────────
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;

-- ── 회수: 앞으로 만들 시퀀스의 채번 권한 ────────────────────────────────
--
-- 레거시 프로젝트의 SELECT·USAGE·UPDATE를 모두 걷어 내 새 시퀀스가 "권한 없음"으로
-- 태어나게 합니다.
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;

-- MAINTAIN(PostgreSQL 17)은 문법 자체가 16 이하에 없으므로 버전을 보고 돕니다.
do $$
begin
  if current_setting('server_version_num')::int < 170000 then
    raise notice 'PostgreSQL 17 미만이라 MAINTAIN 기본 권한 회수를 건너뜁니다(이 버전에 없는 권한입니다).';
    return;
  end if;
  execute 'alter default privileges for role postgres in schema public '
          'revoke maintain on tables from anon, authenticated';
end $$;

-- ── 사후 확인: 기본값이 실제로 비었는가 ─────────────────────────────────
--
-- pg_default_acl을 직접 읽어, postgres가 public에 만들 표와 시퀀스의 기본 권한에
-- anon·authenticated가 남아 있지 않은지 봅니다. 남아 있으면 다음 객체에서 같은 빚이 다시
-- 생기므로 여기서 멈춥니다.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s:%s=%s', kind, grantee, privs), ', ' order by kind, grantee)
    into v_bad
    from (
      select case d.defaclobjtype when 'r' then 'table' else 'sequence' end as kind,
             case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
             string_agg(a.privilege_type, '+' order by a.privilege_type) as privs
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
       cross join lateral aclexplode(d.defaclacl) a
       where n.nspname = 'public'
         and d.defaclobjtype in ('r', 'S')
         and d.defaclrole = 'postgres'::regrole
         and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
       group by 1, 2
    ) x;

  if v_bad is not null then
    raise exception
      'public 스키마의 기본 권한에 앱 롤이 남아 있습니다: %', v_bad
      using errcode = '42501';
  end if;
end $$;
