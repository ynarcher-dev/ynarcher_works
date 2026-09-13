#!/usr/bin/env node
// 재생성 엔트리포인트 — 결정 매니페스트에서 마이그레이션 본문을 찍어 냅니다.
// 산출된 .sql이 정본이며, 이 파일은 "같은 입력에서 같은 문장이 다시 나온다"를 보이기 위해
// 남깁니다. 사용: node scripts/security/_gen_migration.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/security/acl-decisions.json'), 'utf8'))

const ROW = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
// 회수 대상은 **카탈로그 전수**입니다. delta(지금 남아 있는 잔여)로 좁히면 이 마이그레이션이
// 한 번 적용된 DB에서 매니페스트를 다시 만들 때 목록이 0개가 되고, 그대로 다시 찍으면 표
// 이름이 하나도 없는 `revoke ... on table from ...`이 되어 깨끗한 재생이 문법 오류로 멈춥니다.
// 이미 없는 권한을 회수하는 것은 PostgreSQL에서 무해한 no-op이므로 전수로 적어, 생성 시점의
// 카탈로그 상태와 무관하게 같은 문장이 나오게 합니다(사후 확인 (4)도 전수를 요구합니다).
const NON_ROW_TABLES = d.decisions.map((x) => x.table).sort()
const AUTH_TABLES = d.decisions.filter((x) => x.proposed.authenticated.length).map((x) => x.table).sort()
const AUTH_DELETE = d.decisions.filter((x) => x.proposed.authenticated.includes('DELETE')).map((x) => x.table).sort()

const qualified = (ts, indent = '  ') => ts.map((t) => `${indent}public.${t}`).join(',\n')
const quoted = (ts, indent = '    ') => ts.map((t) => `${indent}'${t}'`).join(',\n')
const values = (ts, indent = '      ') => ts.map((t) => `${indent}('${t}')`).join(',\n')

function grantBlocks(pick, role) {
  const m = new Map()
  for (const x of d.decisions) {
    const ops = pick(x)
    if (!ops.length) continue
    const k = ROW.filter((o) => ops.includes(o)).join(', ').toLowerCase()
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(x.table)
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ops, ts]) => `grant ${ops} on table\n${qualified(ts.sort())}\nto ${role};`)
    .join('\n\n')
}

const sql = `-- =====================================================================
-- public 스키마 테이블 권한 — 인벤토리 전수에 대한 유한 보정 (AUTHZ-1/2)
--
-- 20260912025406은 원장 11개에만 권한을 적었고 나머지는 공백으로 남았습니다. 이 파일은
-- **재생된 카탈로그 전수(159개 표)**를 근거로 그 공백을 닫습니다. 표별 결정과 근거는
-- supabase/security/acl-decisions.json이 소유하며, 이 파일은 그 결정을 옮긴 것입니다
-- (scripts/security/emit-grant-sql.mjs가 같은 문장을 다시 찍어 대조할 수 있습니다).
--
-- 권한을 주는 근거는 네 가지를 **모두** 본 결과입니다.
--   (1) 재생된 DB의 실제 정책 — 정책이 없는 명령에는 권한을 주지 않습니다.
--   (2) 화면의 직접 호출(.from('표'))과 설정 객체를 거친 간접 호출.
--   (3) SECURITY INVOKER RPC가 **호출자 권한으로** 닿는 표. 정책과 직접 호출만 보면 이
--       요구가 통째로 빠집니다 — INVOKER는 호출자 권한으로 돌기 때문에 권한이 없으면 RPC가
--       그 자리에서 42501로 멈춥니다. SECURITY DEFINER는 소유자 권한으로 도므로 그 안쪽
--       표는 대상이 아닙니다(권한 경계에서 끊습니다).
--   (4) Edge Function 전수 감사 — service_role 경로와 호출자 JWT 경로를 갈라 봤습니다.
--
-- SELECT는 "읽는 화면이 있는가"만으로 정하지 않습니다. PostgreSQL은 쓰기 문에도 SELECT를
-- 따로 요구합니다.
--   · insert ... returning (supabase-js의 .insert(...).select())은 돌려줄 칸을 읽습니다.
--   · update/delete의 WHERE에 쓰인 칸도 읽습니다.
-- **RLS를 우회하는 service_role도 테이블 ACL은 그대로 받습니다.** 그래서 "INSERT만 주면 된다"가
-- 실행 시점에 42501로 무너집니다 — application-submit이 제출 행의 id를 돌려받는 자리
-- (application-submit/index.ts:121)와 게스트 초대를 참가자로 좁혀 소진하는 자리
-- (_shared/guestAccount.ts:321, _shared/guestSession.ts:187)가 그 예입니다. 체인 꼬리와
-- 함수 본문의 문 단위로 이 둘을 찾아 최소 SELECT를 함께 적습니다.
--
-- 하지 않는 것
--   · 'all tables in schema'와 기본 권한 변경. 대상은 아래 이름으로 적은 표뿐입니다
--     (기본 권한은 다음 마이그레이션이 따로 다룹니다).
--   · anon에 어떤 행 권한도 주지 않습니다. 게스트도 로그인 뒤에는 authenticated 롤이며,
--     내부·외부 경계는 계속 RLS가 정합니다.
--   · 근거를 찾지 못한 기존 권한의 회수. 우리 조사가 못 본 경로일 수 있어 회수하지 않고
--     acl-decisions.json의 확인 대기 목록에 남깁니다.
--
-- service_role: 깨끗한 재생에서 이 역할은 public 159개 표 전부에 행 권한이 **없었습니다**.
--   supabaseAdmin() 경로의 Edge Function이 새 환경에서 전부 42501로 떨어지는 상태였고,
--   내부 인증(internalAuth.ts)이 users·workspace_permissions를 읽지 못해 함께 막혔습니다.
--   여기서는 Edge 전수 감사가 확인한 표에만, 확인된 연산만 줍니다.
--
-- 물리 삭제(DELETE)는 네 표뿐이며 모두 **DELETE 정책이 이미 있는** 자리입니다.
--   capital_call_payments — 캐피탈콜 삭제가 납입 행을 물리 삭제합니다
--     (features/fund/hooks.ts useDeleteCapitalCall, CapitalCallPanel.tsx가 호출).
--   fund_managers / fund_purposes / investment_purposes — 배정성 원장이라 INVOKER RPC가
--     "지우고 다시 넣기"로 행을 교체합니다(set_fund_staffing / set_fund_purposes /
--     set_investment_purposes). 이 RPC들은 호출자 권한으로 돌아 권한이 없으면 멈춥니다.
--   그 밖의 업무 표는 종전대로 soft delete이며 DELETE를 주지 않습니다.
-- =====================================================================

-- ── 가드: 권한을 주는 표에 RLS가 켜져 있는가 ────────────────────────────
--
-- 권한만 있고 RLS가 꺼져 있으면 그 표는 전체 공개가 됩니다. 부여 직전에 확인하고
-- 하나라도 어긋나면 마이그레이션을 실패시킵니다.
do $$
declare
  v_missing text;
begin
  select string_agg(t.name, ', ' order by t.name)
    into v_missing
    from (values
${values(AUTH_TABLES)}
    ) as t(name)
    left join pg_class c
      on c.relname = t.name
     and c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r'
   where c.oid is null or c.relrowsecurity is false;

  if v_missing is not null then
    raise exception
      'RLS가 꺼져 있거나 존재하지 않는 표에는 권한을 주지 않습니다: %', v_missing
      using errcode = '42501';
  end if;
end $$;

-- ── 부여 전 스냅샷 ──────────────────────────────────────────────────────
--
-- 끝에서 "이 마이그레이션이 의도 밖으로 권한을 넓히지 않았다"를 스스로 증명합니다.
-- 절대값이 아니라 전후 차이를 봅니다 — 레거시 자동 노출 시절에 만들어진 기존 DB가
-- 이 파일이 준 적 없는 권한 때문에 멈춰서는 안 되기 때문입니다.
create temporary table _acl_before as
select c.relname as name,
       r.role_name,
       p.priv,
       has_table_privilege(r.role_name, c.oid, p.priv) as had
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
 where n.nspname = 'public' and c.relkind = 'r';

-- ── 회수: 행을 열지 않는 권한 ───────────────────────────────────────────
--
-- TRUNCATE·REFERENCES·TRIGGER는 기본 권한을 타고 딸려 온 것이며 Data API 경로는 셋 다
-- 쓰지 않습니다. 특히 TRUNCATE는 정책을 거치지 않고 표를 통째로 비우는 RLS 우회 경로입니다.
-- REFERENCES·TRIGGER는 **생성 시점에만** 검사하므로 이미 만들어진 외래키·트리거는
-- 그대로 남습니다.
revoke truncate, references, trigger on table
${qualified(NON_ROW_TABLES)}
from anon, authenticated;

-- MAINTAIN은 PostgreSQL 17에서 들어온 권한입니다(VACUUM·ANALYZE·REINDEX·CLUSTER·
-- REFRESH MATERIALIZED VIEW·LOCK TABLE). 20260912025406은 이 권한을 몰랐기에, 그때 정리한
-- 표 12개에도 MAINTAIN만은 그대로 남아 있었습니다. 16 이하에는 문법 자체가 없으므로
-- 서버 버전을 보고 돕니다 — 없는 버전에서 마이그레이션이 멈추지 않아야 합니다.
do $$
declare
  t text;
begin
  if current_setting('server_version_num')::int < 170000 then
    raise notice 'PostgreSQL 17 미만이라 MAINTAIN 회수를 건너뜁니다(이 버전에 없는 권한입니다).';
    return;
  end if;
  foreach t in array array[
${quoted(NON_ROW_TABLES)}
  ]
  loop
    execute format('revoke maintain on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 부여: authenticated ─────────────────────────────────────────────────
--
-- 표별 근거(호출 파일·줄, 경유 RPC, 정책 명령)는 acl-decisions.json의
-- decisions[].evidence가 갖습니다. 여기서 같은 내용을 되풀이하지 않습니다.

${grantBlocks((x) => x.proposed.authenticated, 'authenticated')}

-- ── 부여: service_role ──────────────────────────────────────────────────
--
-- Edge Function 전수 감사(22개 함수 전문 확인)가 supabaseAdmin() 경로에서 실제로 닿는 표와
-- 연산입니다. 호출자 JWT로 도는 경로(supabaseAsCaller)는 authenticated이므로 여기 없습니다.

${grantBlocks((x) => x.proposed.service_role, 'service_role')}

-- ── 사후 확인 ───────────────────────────────────────────────────────────
do $$
declare
  v_bad text;
begin
  -- (1) anon에 행 권한이 하나라도 생겼는가 — 하나도 없어야 합니다.
  select string_agg(format('%s(%s)', c.relname, p.priv), ', ' order by c.relname, p.priv)
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, p.priv);
  if v_bad is not null then
    raise exception 'anon에 행 권한이 있습니다(있어서는 안 됩니다): %', v_bad using errcode = '42501';
  end if;

  -- (2) authenticated의 DELETE는 승인된 네 표뿐인가.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('authenticated', c.oid, 'DELETE')
     and c.relname <> all (array[
${quoted(AUTH_DELETE, '       ')}
     ]);
  if v_bad is not null then
    raise exception
      '승인되지 않은 표에 authenticated DELETE가 있습니다: %', v_bad using errcode = '42501';
  end if;

  -- (3) 이 마이그레이션이 anon·authenticated의 비행 권한을 새로 만들지 않았는가.
  select string_agg(format('%s/%s(%s)', b.name, b.role_name, b.priv), ', ')
    into v_bad
    from _acl_before b
    join pg_class c on c.relname = b.name and c.relnamespace = 'public'::regnamespace
   where b.role_name in ('anon', 'authenticated')
     and b.priv in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
     and b.had is false
     and has_table_privilege(b.role_name, c.oid, b.priv);
  if v_bad is not null then
    raise exception '비행 권한이 새로 생겼습니다: %', v_bad using errcode = '42501';
  end if;

  -- (4) 회수 뒤 anon·authenticated에 비행 권한이 남아 있지 않은가(전수).
  select string_agg(format('%s/%s(%s)', c.relname, r.role_name, p.priv), ', '
                    order by c.relname, r.role_name, p.priv)
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) as r(role_name)
   cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege(r.role_name, c.oid, p.priv);
  if v_bad is not null then
    raise exception '비행 권한이 남아 있습니다: %', v_bad using errcode = '42501';
  end if;
end $$;

drop table _acl_before;
`

fs.writeFileSync(path.join(ROOT, 'supabase/migrations/20260912160000_acl_table_privileges.sql'), sql, 'utf8')
console.log('table privileges:', {
  authenticated_tables: AUTH_TABLES.length,
  service_role_tables: d.decisions.filter((x) => x.proposed.service_role.length).length,
  non_row_revoke_tables: NON_ROW_TABLES.length,
  authenticated_delete: AUTH_DELETE,
})
