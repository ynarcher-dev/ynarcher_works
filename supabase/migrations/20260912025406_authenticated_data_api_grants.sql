-- =====================================================================
-- Data API(authenticated) 테이블 권한 명시 부여 + 불필요 권한 회수
--
-- 배경: supabase/config.toml의 `auto_expose_new_tables`가 설정되어 있지 않아 새 DB에는
-- 행 단위 권한(SELECT/INSERT/UPDATE/DELETE)이 자동으로 주어지지 않는다. 그동안 테이블
-- 권한을 한 번도 적지 않아, 깨끗한 재생에서는 RLS 정책이 있어도 42501에서 먼저 막힌다.
-- 권한은 "그 연산을 시도할 수 있는가", RLS는 "어떤 행에 손댈 수 있는가"이며 여기서는
-- 앞쪽만 채운다. 정책과 기본 권한(default privileges)은 건드리지 않는다.
--
-- 이 파일의 범위
--   (1) DML 11개 원장에 정책이 뒷받침하는 행 단위 권한만 부여한다.
--   (2) 그 11개 + 보호 표 approval_budget_revisions에서 anon·authenticated의
--       TRUNCATE·REFERENCES·TRIGGER를 회수한다. 깨끗한 재생에서도 이 셋이 남아 있는 것이
--       확인됐다(행 단위 권한만 회수되는 현재 동작의 잔여물). Data API 경로는 셋 다 쓰지
--       않으며, 특히 TRUNCATE는 정책을 거치지 않고 표를 통째로 비우는 RLS 우회 경로다.
--       REFERENCES·TRIGGER는 DDL 권한이라 앱 롤에 있을 이유가 없다.
--
-- 하지 않는 것
--   · `all tables in schema`·기본 권한 변경. 대상은 아래 이름으로 적은 표뿐이다.
--   · `service_role` 권한 변경. 회수 대상은 anon·authenticated뿐이다.
--   · `DELETE` 부여. 3_database_rls_policy_matrix.md §2.5가 물리 삭제를 막고 soft delete를
--     `deleted_at` UPDATE로 대체하며, 이 표들에 `for delete` 정책은 한 건도 없다.
--     기존 DELETE도 회수하지 않는다(레거시 감사 대상 — 끝의 경고 참조).
--   · approval_budget_revisions에 DML 부여. 서버가 쓰는 감사 이력이며 기존 ACL·RLS는
--     그대로 둔다(회수만 한다).
-- =====================================================================

-- ── 가드: RLS가 켜져 있지 않은 테이블에는 권한을 주지 않는다 ─────────────────
--
-- 권한만 있고 RLS가 꺼져 있으면 그 테이블은 전체 공개가 된다. 순서가 뒤바뀐
-- 마이그레이션이나 이후의 `disable row level security`를 조용히 통과시키지 않도록,
-- 부여 직전에 확인하고 하나라도 어긋나면 마이그레이션을 실패시킨다.
do $$
declare
  v_missing text;
begin
  select string_agg(t.name, ', ' order by t.name)
    into v_missing
    from (
      values
        ('startups'), ('networks'), ('users'), ('programs'),
        ('ma_programs'), ('ma_buyers'), ('ma_sellers'), ('funds'),
        ('entity_contributions'), ('guest_identities'), ('audit_logs')
    ) as t(name)
    left join pg_class c
      on c.relname = t.name
     and c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r'
   where c.oid is null or c.relrowsecurity is false;

  if v_missing is not null then
    raise exception
      'RLS가 활성화되지 않았거나 존재하지 않는 테이블에는 권한을 부여하지 않습니다: %',
      v_missing
      using errcode = '42501';
  end if;
end $$;

-- ── 부여 전 스냅샷 ──────────────────────────────────────────────────────────
--
-- 끝에서 "이 마이그레이션이 권한을 넓히지 않았다"를 스스로 증명하기 위해 현재 상태를
-- 찍어 둔다. 절대값으로 단언하면 레거시 자동 노출 시절에 만들어진 기존 DB에서
-- 마이그레이션이 멈춘다 — 이 파일이 준 적 없는 권한 때문에 업그레이드가 막히는 것은
-- 옳지 않다. 그래서 전후 비교만 한다.
create temporary table _acl_before as
select t.name,
       p.priv,
       has_table_privilege('authenticated', format('public.%I', t.name), p.priv) as had
  from (
    values
      ('startups'), ('networks'), ('users'), ('programs'),
      ('ma_programs'), ('ma_buyers'), ('ma_sellers'), ('funds'),
      ('entity_contributions'), ('guest_identities'), ('audit_logs')
  ) as t(name)
 cross join (values ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv);

-- ── 회수: 행과 무관한 권한 ─────────────────────────────────────────────────
--
-- 회수해도 정상 DML에는 영향이 없다. 이미 만들어진 외래키·트리거도 그대로다 —
-- REFERENCES·TRIGGER는 **생성 시점에만** 검사하는 권한이기 때문이다.
do $$
declare
  t text;
begin
  foreach t in array array[
    'startups', 'networks', 'users', 'programs',
    'ma_programs', 'ma_buyers', 'ma_sellers', 'funds',
    'entity_contributions', 'guest_identities', 'audit_logs',
    -- DML은 주지 않는 보호 표. 상속으로 남은 TRUNCATE만 걷어낸다
    -- (rls_regression 케이스15b가 보는 경계와 같다).
    'approval_budget_revisions'
  ]
  loop
    execute format(
      'revoke truncate, references, trigger on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 부여 ────────────────────────────────────────────────────────────────────

-- startups — STARTUP 워크스페이스의 물리 원장(3_database_rls_policy_matrix.md §4).
--   SELECT: 목록·대시보드·전역 검색(features/startup/dashboard, hub/globalSearch.ts:161).
--   INSERT: 원장 등록 폼 `useCreateEntity('startups')`(master/entityHooks.ts:60, ledgers.ts:41).
--   UPDATE: 원장 수정과 `deactivate_entities`의 soft delete.
--   정책: startups_select / startups_insert / startups_update (20260909190000 최신).
grant select, insert, update on table public.startups to authenticated;

-- networks — 외부 전문가·투자사·기관·기업 통합 원장(20260904120000).
--   SELECT/INSERT: NETWORKS 목록·등록(networks/hooks.ts:283·297, NETWORK_TABLE='networks').
--   UPDATE: 수정과 `deactivate_entities`/`restore_entity` 경로.
grant select, insert, update on table public.networks to authenticated;

-- users — 임직원·게스트 계정 원장.
--   SELECT: 로그인 직후 본인 조회와 임직원 명부(auth/employeeAuthService.ts:15).
--   UPDATE: 임직원 정보 수정과 퇴사 처리(management/hooks.ts:234·374). 판정은
--           users_update 정책이 맡는다 — 최신 정의(20260903180000)는
--           `is_admin() or (can_write_workspace('management') and not
--            is_guest_user_type(user_type))`이다. 즉 **본인(self) 절은 없고**
--           (20260708130000에서 제거), MANAGEMENT는 게스트 행을 만지지 못한다.
--           본인 약력·노트는 SECURITY DEFINER RPC `public.update_my_profile()`이 맡는다.
--   INSERT는 주지 않는다 — 계정 생성은 employee-create·guest-access-invite Edge
--   Function(service_role) 경로다.
grant select, update on table public.users to authenticated;

-- programs — PROJECT 워크스페이스 사업 원장(20260909150000에서 개명).
--   SELECT/INSERT: 사업 목록·생성(program/hooks.ts:134·161, config.tables.programs).
--   UPDATE: 상태 변경과 soft delete(program/programsPoolHooks.ts:354).
grant select, insert, update on table public.programs to authenticated;

-- ma_programs — M&A/PE 딜 원장. 같은 program 부품을 공유해 경로가 같다.
grant select, insert, update on table public.ma_programs to authenticated;

-- ma_buyers / ma_sellers — M&A 당사자 원장.
--   SELECT/INSERT: 당사자 목록·등록(mna/parties/hooks.ts:106·137, config.ts:82·94).
--   정책: 20260911224000이 기밀 딜 경계까지 반영해 다시 선언했다.
grant select, insert, update on table public.ma_buyers to authenticated;
grant select, insert, update on table public.ma_sellers to authenticated;

-- funds — FUND 워크스페이스 조합 원장.
--   SELECT/INSERT/UPDATE 모두 화면이 직접 호출한다(fund/hooks.ts:54·104·117·176).
grant select, insert, update on table public.funds to authenticated;

-- entity_contributions — 기여 로그(생성자·담당자·기여자 3축).
--   SELECT: 원장 상세의 기여 이력 패널이 직접 읽는다(master/entityHooks.ts:142,
--           networks/hooks.ts:418, fund/hooks.ts:134, mna/parties/hooks.ts:214,
--           networks/bulkUpload.ts:430). 비활성 원장 복구 RPC도 이 표를 읽는다.
--   INSERT: `entity_contributions_insert` 정책이 20260911224000에서 `to authenticated`로
--           선언되어 있고, `with check`가 `user_id is null or user_id =
--           current_app_user_id()`로 본인 명의만 허용한다. 행위자 칸은 BEFORE INSERT
--           트리거 `app.stamp_contribution_actor()`가 덮어쓴다. 정책이 authenticated를
--           대상으로 선언된 이상 테이블 권한이 없으면 그 정책은 닿을 수 없는 규칙이 된다.
--   UPDATE/DELETE 정책은 없으므로 부여하지 않는다(기여 로그는 고쳐 쓰지 않는다).
grant select, insert on table public.entity_contributions to authenticated;

-- guest_identities — 원장 행과 게스트 계정의 연결.
--   SELECT만 준다. 정책은 `guest_identities_select` 하나뿐이고(20260908180000),
--   `현재 사용자 존재 and not is_guest() and can_read_master_table(master_table)`로
--   "이 회사에 계정이 있다"는 사실 자체를 원장 읽기 권한에 묶는다.
--   화면도 읽기만 한다(admin/guestAccountHooks.ts:181). 계정 생성·연결은 ADMIN 경로가
--   맡고 자격증명은 public.guest_credentials에 있으며 그 표는 계속 잠겨 있다.
grant select on table public.guest_identities to authenticated;

-- audit_logs — 감사 로그. **SELECT만** 준다.
--   정책은 `audit_logs_select`(20260705120500) 하나뿐이고 조건이 `app.is_admin()`이다.
--   즉 권한을 열어도 일반 사용자·게스트에게는 한 줄도 보이지 않는다 — 이력 노출 경계는
--   계속 RLS가 정한다. ADMIN 화면이 이 표를 직접 읽는다(admin/hooks.ts:66).
--   쓰기 정책은 INSERT·UPDATE·DELETE 모두 없다. 적재는 SECURITY DEFINER RPC와
--   service_role 경로가 하므로 여기서 쓰기 권한을 주지 않는다(감사 로그는 위조 불가해야 한다).
grant select on table public.audit_logs to authenticated;

-- ── 사후 확인: 이 마이그레이션이 권한을 넓혔는가 ────────────────────────────
--
-- 절대값("DELETE가 없어야 한다")이 아니라 **전후 차이**를 본다. 레거시 자동 노출
-- 시절에 만들어진 기존 DB에는 이 원장들에 DELETE가 이미 남아 있을 수 있고,
-- 이 파일이 준 적 없는 권한 때문에 업그레이드가 멈춰서는 안 된다.
-- 기존 DELETE는 회수하지 않는다 — 레거시 ACL 정리는 이 마이그레이션 밖의 별도 과제다.
do $$
declare
  v_widened text;
  v_legacy  text;
begin
  select string_agg(format('%s(%s)', b.name, b.priv), ', ' order by b.name, b.priv)
    into v_widened
    from _acl_before b
   where b.had is false
     and has_table_privilege('authenticated', format('public.%I', b.name), b.priv);

  if v_widened is not null then
    raise exception
      '이 마이그레이션이 DELETE/TRUNCATE/REFERENCES/TRIGGER 권한을 새로 넓혔습니다(있어서는 안 되는 일입니다): %',
      v_widened
      using errcode = '42501';
  end if;

  -- DELETE는 회수 대상이 아니므로, 남아 있다면 드러내기만 하고 실패시키지 않는다.
  select string_agg(b.name, ', ' order by b.name)
    into v_legacy
    from _acl_before b
   where b.had is true
     and b.priv = 'DELETE';

  if v_legacy is not null then
    raise warning
      '이 원장들에 이전부터 DELETE 권한이 있습니다(회수하지 않았습니다 — 별도 ACL 감사 대상): %',
      v_legacy;
  end if;
end $$;

drop table _acl_before;
