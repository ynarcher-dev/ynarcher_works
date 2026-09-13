-- =====================================================================
-- ACL·RLS 카탈로그 인벤토리 (READ ONLY)
--
-- 재생된 DB의 **실제 카탈로그**를 읽어 기계 판독용 JSON 한 덩어리를 출력합니다.
-- 마이그레이션 DDL을 정규식으로 훑는 방식이 아니라, 마지막 마이그레이션까지
-- 반영된 최종 상태(pg_class/pg_policy/pg_proc/aclexplode)를 그대로 찍습니다.
--
-- 담는 것
--   · public·app 스키마의 모든 테이블·뷰·구체화뷰·외부테이블·시퀀스
--   · RLS 활성/강제 여부와 정책 전문(역할·명령·qual·with check)
--   · anon·authenticated·service_role의 **유효 권한**과 직접 부여분, PUBLIC 경유분
--   · 컬럼 단위 ACL이 따로 걸린 자리
--   · 뷰의 security_invoker·security_barrier와 참조 대상
--   · public·app 함수의 시그니처·SECURITY DEFINER·proconfig(search_path)·EXECUTE 권한
--   · storage 버킷 **설정**과 storage 정책 메타데이터
--
-- 담지 않는 것
--   · 업무 데이터 행, 자격증명, 키, 토큰, 사용자 식별자
--   · storage.objects의 개별 객체 행
--
-- 실행: scripts/security/acl-inventory.mjs export (직접 psql로 돌려도 같은 결과)
-- 트랜잭션은 read only로 열립니다 — 이 파일은 어떤 상태도 바꾸지 않습니다.
-- =====================================================================

begin transaction read only;

with
-- ── 대상 정의 ──────────────────────────────────────────────────────────
app_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
),
-- MAINTAIN은 PostgreSQL 17에서 들어온 권한입니다(VACUUM·ANALYZE·REINDEX·CLUSTER·
-- REFRESH MATERIALIZED VIEW·LOCK TABLE). 행을 열지는 않지만 Data API 경로가 쓰지 않는
-- 권한이라 인벤토리에서 빠뜨리면 잔여 권한을 실제보다 작게 셉니다.
table_privs(priv) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
),
sequence_privs(priv) as (
  values ('USAGE'), ('SELECT'), ('UPDATE')
),
target_schemas(nspname) as (
  values ('public'), ('app')
),

-- ── 관계(테이블·뷰·시퀀스 …) ───────────────────────────────────────────
rel as (
  select c.oid,
         n.nspname,
         c.relname,
         c.relkind,
         c.relrowsecurity,
         c.relforcerowsecurity,
         c.relacl,
         c.reloptions,
         pg_catalog.pg_get_userbyid(c.relowner) as owner
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join target_schemas t on t.nspname = n.nspname
   where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
),

-- 관계 ACL을 (grantee, priv) 쌍으로 펼친다. grantee = 0 은 PUBLIC.
rel_acl as (
  select r.oid,
         case when a.grantee = 0 then 'PUBLIC'
              else coalesce(pg_catalog.pg_get_userbyid(a.grantee), a.grantee::text) end as grantee,
         a.privilege_type as priv
    from rel r
    cross join lateral pg_catalog.aclexplode(r.relacl) a
),

-- 테이블류 유효 권한(상속·PUBLIC 경유 포함)
rel_effective as (
  select r.oid,
         ar.role_name,
         coalesce(
           jsonb_agg(p.priv order by p.priv)
             filter (where pg_catalog.has_table_privilege(ar.role_name, r.oid, p.priv)),
           '[]'::jsonb) as effective
    from rel r
    cross join app_roles ar
    cross join table_privs p
   where r.relkind in ('r', 'p', 'v', 'm', 'f')
     and pg_catalog.to_regrole(ar.role_name) is not null
   group by r.oid, ar.role_name
),

-- 시퀀스 유효 권한
seq_effective as (
  select r.oid,
         ar.role_name,
         coalesce(
           jsonb_agg(p.priv order by p.priv)
             filter (where pg_catalog.has_sequence_privilege(ar.role_name, r.oid, p.priv)),
           '[]'::jsonb) as effective
    from rel r
    cross join app_roles ar
    cross join sequence_privs p
   where r.relkind = 'S'
     and pg_catalog.to_regrole(ar.role_name) is not null
   group by r.oid, ar.role_name
),

-- ── RLS 정책 ───────────────────────────────────────────────────────────
pol as (
  select p.polrelid,
         jsonb_build_object(
           'name', p.polname,
           'command', case p.polcmd
                        when 'r' then 'SELECT' when 'a' then 'INSERT'
                        when 'w' then 'UPDATE' when 'd' then 'DELETE'
                        else 'ALL' end,
           'permissive', p.polpermissive,
           'roles', case
                      when p.polroles = '{0}'::oid[] then jsonb_build_array('PUBLIC')
                      else coalesce((
                        select jsonb_agg(rn order by rn)
                          from (select pg_catalog.pg_get_userbyid(unnest(p.polroles)) as rn) s
                      ), '[]'::jsonb)
                    end,
           'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
         ) as js,
         p.polname
    from pg_catalog.pg_policy p
    join rel r on r.oid = p.polrelid
),

-- ── 컬럼 단위 ACL(따로 걸린 자리만) ────────────────────────────────────
col_acl as (
  select a.attrelid,
         jsonb_build_object(
           'column', a.attname,
           'grants', (
             select jsonb_agg(distinct jsonb_build_object(
                      'grantee', case when x.grantee = 0 then 'PUBLIC'
                                      else pg_catalog.pg_get_userbyid(x.grantee) end,
                      'privilege', x.privilege_type))
               from pg_catalog.aclexplode(a.attacl) x
           )
         ) as js,
         a.attname
    from pg_catalog.pg_attribute a
    join rel r on r.oid = a.attrelid
   where a.attacl is not null
     and a.attnum > 0
     and not a.attisdropped
),

-- ── 뷰가 참조하는 관계 ─────────────────────────────────────────────────
view_deps as (
  select distinct rw.ev_class as view_oid,
         dn.nspname || '.' || dc.relname as ref
    from pg_catalog.pg_rewrite rw
    join pg_catalog.pg_depend d
      on d.objid = rw.oid
     and d.classid = 'pg_rewrite'::regclass
     and d.refclassid = 'pg_class'::regclass
    join pg_catalog.pg_class dc on dc.oid = d.refobjid
    join pg_catalog.pg_namespace dn on dn.oid = dc.relnamespace
    join rel v on v.oid = rw.ev_class and v.relkind in ('v', 'm')
   where d.refobjid <> rw.ev_class
     and dc.relkind in ('r', 'p', 'v', 'm', 'f')
),

-- ── 함수·프로시저 ──────────────────────────────────────────────────────
fn as (
  select p.oid,
         n.nspname,
         p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args,
         pg_catalog.pg_get_function_result(p.oid) as result_type,
         p.prosecdef,
         p.proconfig,
         p.proacl,
         p.prokind,
         case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end as volatility,
         pg_catalog.pg_get_userbyid(p.proowner) as owner
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join target_schemas t on t.nspname = n.nspname
),
fn_acl as (
  select f.oid,
         case when a.grantee = 0 then 'PUBLIC'
              else coalesce(pg_catalog.pg_get_userbyid(a.grantee), a.grantee::text) end as grantee
    from fn f
    cross join lateral pg_catalog.aclexplode(f.proacl) a
   where a.privilege_type = 'EXECUTE'
),

-- ── storage 메타데이터 ─────────────────────────────────────────────────
storage_policies as (
  select jsonb_build_object(
           'table', c.relname,
           'name', p.polname,
           'command', case p.polcmd
                        when 'r' then 'SELECT' when 'a' then 'INSERT'
                        when 'w' then 'UPDATE' when 'd' then 'DELETE'
                        else 'ALL' end,
           'permissive', p.polpermissive,
           'roles', case
                      when p.polroles = '{0}'::oid[] then jsonb_build_array('PUBLIC')
                      else coalesce((
                        select jsonb_agg(rn order by rn)
                          from (select pg_catalog.pg_get_userbyid(unnest(p.polroles)) as rn) s
                      ), '[]'::jsonb)
                    end,
           'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
         ) as js,
         c.relname as tname,
         p.polname
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage'
),
storage_rel as (
  select c.oid, c.relname, c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relkind in ('r', 'p')
),
storage_rel_priv as (
  select sr.oid, sr.relname, sr.relrowsecurity,
         ar.role_name,
         coalesce(
           jsonb_agg(p.priv order by p.priv)
             filter (where pg_catalog.has_table_privilege(ar.role_name, sr.oid, p.priv)),
           '[]'::jsonb) as effective
    from storage_rel sr
    cross join app_roles ar
    cross join table_privs p
   where pg_catalog.to_regrole(ar.role_name) is not null
   group by sr.oid, sr.relname, sr.relrowsecurity, ar.role_name
),

-- ── 조립 ───────────────────────────────────────────────────────────────
relations as (
  select jsonb_agg(js order by nspname, relname) as js,
         count(*) filter (where relkind in ('r', 'p')) as n_tables,
         count(*) filter (where relkind = 'v') as n_views,
         count(*) filter (where relkind = 'm') as n_matviews,
         count(*) filter (where relkind = 'f') as n_foreign,
         count(*) filter (where relkind = 'S') as n_sequences
    from (
      select r.nspname, r.relname, r.relkind,
             jsonb_strip_nulls(jsonb_build_object(
               'schema', r.nspname,
               'name', r.relname,
               'kind', case r.relkind
                         when 'r' then 'table' when 'p' then 'partitioned_table'
                         when 'v' then 'view' when 'm' then 'materialized_view'
                         when 'f' then 'foreign_table' when 'S' then 'sequence' end,
               'owner', r.owner,
               'rls_enabled', case when r.relkind in ('r', 'p') then r.relrowsecurity end,
               'rls_forced', case when r.relkind in ('r', 'p') then r.relforcerowsecurity end,
               'acl_is_default', r.relacl is null,
               'security_invoker', case
                 when r.relkind in ('v', 'm')
                 then coalesce(array_to_string(r.reloptions, ',') like '%security_invoker=true%', false)
               end,
               'security_barrier', case
                 when r.relkind in ('v', 'm')
                 then coalesce(array_to_string(r.reloptions, ',') like '%security_barrier=true%', false)
               end,
               'references', case when r.relkind in ('v', 'm') then coalesce(
                 (select jsonb_agg(distinct vd.ref order by vd.ref) from view_deps vd where vd.view_oid = r.oid),
                 '[]'::jsonb) end,
               'privileges', (
                 select jsonb_object_agg(e.role_name, e.effective)
                   from (
                     select role_name, effective from rel_effective where oid = r.oid
                     union all
                     select role_name, effective from seq_effective where oid = r.oid
                   ) e
               ),
               'granted_direct', coalesce((
                 select jsonb_object_agg(g.grantee, g.privs)
                   from (
                     select ra.grantee, jsonb_agg(ra.priv order by ra.priv) as privs
                       from rel_acl ra
                      where ra.oid = r.oid
                        and ra.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
                      group by ra.grantee
                   ) g
               ), '{}'::jsonb),
               'granted_other', coalesce((
                 select jsonb_agg(distinct ra.grantee order by ra.grantee)
                   from rel_acl ra
                  where ra.oid = r.oid
                    and ra.grantee not in ('anon', 'authenticated', 'service_role', 'PUBLIC')
               ), '[]'::jsonb),
               'column_acl', case when exists (select 1 from col_acl ca where ca.attrelid = r.oid)
                 then (select jsonb_agg(ca.js order by ca.attname) from col_acl ca where ca.attrelid = r.oid)
               end,
               'policies', case when r.relkind in ('r', 'p') then coalesce(
                 (select jsonb_agg(p.js order by p.polname) from pol p where p.polrelid = r.oid),
                 '[]'::jsonb) end,
               'policy_commands', case when r.relkind in ('r', 'p') then coalesce((
                 select jsonb_agg(distinct (p.js ->> 'command') order by (p.js ->> 'command'))
                   from pol p where p.polrelid = r.oid
               ), '[]'::jsonb) end
             )) as js
        from rel r
    ) x
),
routines as (
  select jsonb_agg(js order by nspname, proname, identity_args) as js,
         count(*) as n_total,
         count(*) filter (where prosecdef) as n_secdef,
         count(*) filter (where prosecdef and search_path is null) as n_secdef_no_search_path,
         count(*) filter (where proacl_default) as n_acl_default
    from (
      select f.nspname, f.proname, f.identity_args, f.prosecdef,
             f.proacl is null as proacl_default,
             (select cfg from unnest(coalesce(f.proconfig, '{}')) cfg where cfg like 'search\_path=%') as search_path,
             jsonb_strip_nulls(jsonb_build_object(
               'schema', f.nspname,
               'name', f.proname,
               'kind', case f.prokind when 'f' then 'function' when 'p' then 'procedure'
                                      when 'a' then 'aggregate' when 'w' then 'window' end,
               'identity_args', f.identity_args,
               'result', f.result_type,
               'security_definer', f.prosecdef,
               'volatility', f.volatility,
               'owner', f.owner,
               'proconfig', coalesce(to_jsonb(f.proconfig), 'null'::jsonb),
               'search_path', (select cfg from unnest(coalesce(f.proconfig, '{}')) cfg where cfg like 'search\_path=%'),
               'acl_is_default', f.proacl is null,
               'execute_effective', coalesce((
                 select jsonb_agg(ar.role_name order by ar.role_name)
                   from app_roles ar
                  where pg_catalog.to_regrole(ar.role_name) is not null
                    and pg_catalog.has_function_privilege(ar.role_name, f.oid, 'EXECUTE')
               ), '[]'::jsonb),
               'execute_granted_direct', coalesce((
                 select jsonb_agg(distinct fa.grantee order by fa.grantee)
                   from fn_acl fa where fa.oid = f.oid
               ), '[]'::jsonb)
             )) as js
        from fn f
    ) y
),
storage_block as (
  select jsonb_build_object(
    'buckets', coalesce((
      select jsonb_agg(b.js order by b.id)
        from (
          select bb.id,
                 to_jsonb(bb) - 'created_at' - 'updated_at' - 'owner' - 'owner_id' as js
            from storage.buckets bb
        ) b
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(t.js order by t.relname)
        from (
          select srp.relname,
                 jsonb_build_object(
                   'name', srp.relname,
                   'rls_enabled', srp.relrowsecurity,
                   'privileges', jsonb_object_agg(srp.role_name, srp.effective)
                 ) as js
            from storage_rel_priv srp
           group by srp.relname, srp.relrowsecurity
        ) t
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(sp.js order by sp.tname, sp.polname) from storage_policies sp
    ), '[]'::jsonb)
  ) as js
)
select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'source', 'supabase/security/catalog_inventory.sql',
  'database', jsonb_build_object(
    'server_version', current_setting('server_version'),
    'current_database', current_database(),
    'schemas_scanned', (select jsonb_agg(nspname order by nspname) from target_schemas)
  ),
  -- 스키마 USAGE가 없으면 그 안의 어떤 권한도 닿지 않습니다. 표 단위 ACL만 보면
  -- 놓치는 층이라 함께 찍습니다.
  'schema_usage', (
    select jsonb_object_agg(s.nspname, u.js)
      from (values ('public'), ('app'), ('storage'), ('graphql_public'), ('extensions')) s(nspname)
      cross join lateral (
        select jsonb_object_agg(ar.role_name,
                 pg_catalog.has_schema_privilege(ar.role_name, s.nspname, 'USAGE')) as js
          from app_roles ar
         where pg_catalog.to_regrole(ar.role_name) is not null
      ) u
     where pg_catalog.to_regnamespace(s.nspname) is not null
  ),
  -- 새로 만들어지는 객체가 자동으로 받게 되는 권한. 표 단위 회수만으로는
  -- 다음 마이그레이션의 새 표에서 같은 잔여가 다시 생깁니다.
  'default_privileges', (
    select coalesce(jsonb_agg(js order by js ->> 'schema', js ->> 'grantor', js ->> 'object_type'), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'schema', coalesce(n.nspname, '(all)'),
                 'grantor', d.defaclrole::regrole::text,
                 'object_type', case d.defaclobjtype
                                  when 'r' then 'table' when 'S' then 'sequence'
                                  when 'f' then 'function' when 'T' then 'type'
                                  when 'n' then 'schema' else d.defaclobjtype::text end,
                 'grants', (
                   select jsonb_object_agg(g.grantee, g.privs)
                     from (
                       select case when a.grantee = 0 then 'PUBLIC'
                                   else pg_catalog.pg_get_userbyid(a.grantee) end as grantee,
                              jsonb_agg(a.privilege_type order by a.privilege_type) as privs
                         from pg_catalog.aclexplode(d.defaclacl) a
                        group by 1
                     ) g
                 )
               ) as js
          from pg_catalog.pg_default_acl d
          left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
         where n.nspname is null or n.nspname in ('public', 'app')
      ) dp
  ),
  'roles_present', (
    select coalesce(jsonb_agg(r order by r), '[]'::jsonb)
      from unnest(array[
        'anon', 'authenticated', 'service_role', 'authenticator',
        'postgres', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin'
      ]) r
     where pg_catalog.to_regrole(r) is not null
  ),
  'counts', jsonb_build_object(
    'tables', (select n_tables from relations),
    'views', (select n_views from relations),
    'materialized_views', (select n_matviews from relations),
    'foreign_tables', (select n_foreign from relations),
    'sequences', (select n_sequences from relations),
    'policies', (select count(*) from pol),
    'routines', (select n_total from routines),
    'routines_security_definer', (select n_secdef from routines),
    'routines_security_definer_without_search_path', (select n_secdef_no_search_path from routines),
    'routines_acl_default', (select n_acl_default from routines),
    'storage_buckets', (select jsonb_array_length(js -> 'buckets') from storage_block),
    'storage_policies', (select jsonb_array_length(js -> 'policies') from storage_block)
  ),
  'relations', coalesce((select js from relations), '[]'::jsonb),
  'routines', coalesce((select js from routines), '[]'::jsonb),
  'storage', (select js from storage_block)
));

commit;
