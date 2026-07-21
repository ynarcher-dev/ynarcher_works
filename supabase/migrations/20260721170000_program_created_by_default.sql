-- =====================================================================
-- 사업 원장 3종 등록자(created_by) 자동 기록 + 기여 로그 기반 백필
--
-- 증상
--   AC·M&A·PROJECT 사업 목록의 '등록자'가 전부 '-'로 비어 있다.
--
-- 원인
--   programs / ma_programs / project_programs의 created_by에는 기본값이 없고,
--   등록 경로(useCreateProgram)도 값을 넣지 않는다. 그래서 모든 행이 NULL이다.
--   NETWORKS 13종은 2026-07-14(20260714130000)에 같은 문제를 기본값으로 해결했는데,
--   그때 사업 원장은 대상에 없었다. 이후 M&A·PROJECT 원장이 AC를 복제해 만들어지면서
--   빠진 구멍까지 그대로 복제됐다.
--
-- 표시만의 문제가 아니다
--   '내 사업' 스코프는 created_by 또는 담당자 원장으로 판정한다(programsPoolHooks).
--   등록자가 비어 있으면 '내가 등록했지만 담당자로 지정되지는 않은 사업'이 내 목록에서
--   사라진다. 사업명·등록자 검색에서 등록자 쪽도 항상 빈 결과가 된다.
--
-- 백필 — 이번에는 근사가 아니라 실제 등록자를 복원한다
--   20260714130000은 원 등록자 이력이 없어 현 운영자 계정으로 일괄 근사 귀속했다.
--   사업 원장은 사정이 낫다. 변동 이력(entity_contributions)에 최초 'created' 행위자가
--   남아 있어 그대로 되돌릴 수 있다. 다형 키는 원장별로 갈라져 있다(20260721130000).
--   기여 로그조차 없는 행은 건드리지 않고 NULL로 둔다 — 모르는 것을 아는 척하지 않는다.
--
-- 소유 워크스페이스: ac / mna / project · 데이터 등급: Internal
-- 접근 주체: 내부 사용자(임직원) · Scope: 워크스페이스 + 단건 사업
-- 보안: RLS/정책 변경 없음. 기본값은 auth.jwt() 직접 파싱이 아니라 app.current_app_user_id()
--       헬퍼를 경유하며, 세션이 없으면 NULL이 되어 등록 자체를 실패시키지 않는다.
--       NOT NULL 제약은 추가하지 않는다(기존 NULL 행과 백엔드 배치 경로 보호).
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260714130000_networks_created_by_default.sql(선례),
--       20260721130000_program_entity_key_split.sql(다형 키 분리)
-- =====================================================================

alter table public.programs
  alter column created_by set default app.current_app_user_id();
alter table public.ma_programs
  alter column created_by set default app.current_app_user_id();
alter table public.project_programs
  alter column created_by set default app.current_app_user_id();

-- 백필: 각 사업의 최초 'created' 기여 행위자를 등록자로 되돌린다.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('programs',         'program'),
      ('ma_programs',      'ma_program'),
      ('project_programs', 'project_program')
    ) as t(tbl, entity_key)
  loop
    execute format($sql$
      update public.%1$I p
         set created_by = c.user_id
        from (
          select distinct on (entity_id) entity_id, user_id
            from public.entity_contributions
           where entity_table = %2$L
             and action = 'created'
             and user_id is not null
           order by entity_id, created_at
        ) c
       where p.id = c.entity_id
         and p.created_by is null;
    $sql$, r.tbl, r.entity_key);
    raise notice '등록자 백필: % (%)', r.tbl, r.entity_key;
  end loop;
end $$;
