-- =====================================================================
-- ADMIN 등록자(created_by) 강제 교체 RPC
--
-- 배경: 등록자는 권한 축이 아니다(어느 원장의 RLS도 created_by 로 쓰기를 허용하지 않는다).
--       다만 '내 ~ 관리' 목록의 소속과 최초 등록 책임 표기가 등록자를 따라가므로,
--       퇴사·조직 이동·오등록을 정리할 관리자 경로가 필요하다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: admin (대상 원장은 networks/startup/ac/mna/project/fund 전역)
--   · 데이터 등급: Internal (교체 값은 내부 임직원 FK. 개인정보 원본/다운로드/Export 없음)
--   · 접근 주체: 최고 관리자(super_admin)만. 외부 게스트는 admin 권한이 없어 호출 불가
--   · Scope: global (관리자 전용 오버라이드)
--   · 감사 로그: 대상. audit_logs 에 CREATOR_CHANGE 로 변경 전/후를 적재하고,
--     원장 변동 이력(entity_contributions)에도 트리거가 사유(note)와 함께 남긴다
--   · 운영 영향: 교체 즉시 해당 레코드가 이전 등록자의 '내 ~ 관리' 목록에서 빠지고
--     새 등록자 목록에 나타난다. 권한 변화는 없다(등록자는 권한을 주지 않는다)
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블 없음 → RLS 활성화/정책 분리 해당 없음(기존 원장 정책을 그대로 탄다)
--   · 물리 삭제 없음. DELETE 정책 추가 없음
--   · 권한 판정은 app.is_admin() 헬퍼 경유(auth.jwt() 직접 파싱 없음)
--   · 교체 RPC 는 SECURITY INVOKER — DEFINER 로 만들면 각 원장의 RLS 를 우회하게 되어
--     정책을 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다(CLAUDE.md 확정 원칙).
--     관리자는 is_admin() 단축으로 각 원장 UPDATE 정책을 이미 통과하므로 INVOKER 로 충분하다.
--   · audit_logs 는 INSERT 정책이 없는 append-only 표라 기록만 SECURITY DEFINER 헬퍼로 분리한다.
--     이 헬퍼는 감사 로그만 쓰고 업무 원장에는 손대지 않으며, 내부에서 is_admin() 을 먼저 확인한다
--   · SECURITY DEFINER 헬퍼는 set search_path = app, public 고정
--   · GRANT EXECUTE 는 authenticated 로 제한(revoke all from public 선행)
--
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705190000_admin_permission_rpc.sql(관리자 RPC + 감사 로그 패턴),
--       20260721160000_entity_contribution_trigger_networks.sql(app.has_contribution_trigger),
--       20260705120200_rls_helpers.sql(app.is_admin)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 관리자 액션 감사 로그 기록 헬퍼
--     audit_logs 는 SELECT 정책만 있는 append-only 표다. 관리자 RPC 가 증적을 남기려면
--     기록 경로가 DEFINER 여야 하므로, '감사 로그만 쓰는' 최소 표면으로 분리해 둔다.
-- ---------------------------------------------------------------------
create or replace function app.log_admin_audit(
  p_action text,
  p_before jsonb,
  p_after  jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_user_id, action, before_data, after_data, reason)
  values (app.current_app_user_id(), p_action, p_before, p_after, nullif(p_reason, ''));
end;
$$;

revoke all on function app.log_admin_audit(text, jsonb, jsonb, text) from public;
grant execute on function app.log_admin_audit(text, jsonb, jsonb, text) to authenticated;

comment on function app.log_admin_audit(text, jsonb, jsonb, text) is
  '관리자 액션 감사 로그 기록 전용 헬퍼. audit_logs 는 INSERT 정책이 없어 DEFINER 가 필요하지만, 표면을 로그 적재 하나로 좁혀 업무 원장에는 접근하지 않는다.';

-- ---------------------------------------------------------------------
-- (2) 등록자 강제 교체
--     허용 원장은 손으로 나열하지 않고 app.has_contribution_trigger() 로 판정한다
--     (변동 이력 트리거가 붙은 원장 = 이 RPC 가 다룰 수 있는 원장).
-- ---------------------------------------------------------------------
create or replace function public.set_entity_creator(
  p_table   text,
  p_id      uuid,
  p_user_id uuid,
  p_reason  text default null
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_before uuid;
  v_rows   integer;
begin
  if not app.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  -- 변동 이력 트리거가 있어도 created_by 가 없는 원장이 생길 수 있으므로 카탈로그로 확인한다.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = p_table and column_name = 'created_by'
  ) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_user_id is null then
    raise exception 'creator_required' using errcode = '23514';
  end if;
  -- 비활성/삭제 계정으로는 교체할 수 없다(목록 소속이 사라진 사람에게 붙는 것을 막는다).
  if not exists (
    select 1 from public.users u
     where u.id = p_user_id and u.is_active and u.deleted_at is null
  ) then
    raise exception 'invalid_user' using errcode = '23503';
  end if;

  execute format('select created_by from public.%I where id = $1', p_table)
    into v_before using p_id;

  -- 사유는 트리거가 알 수 없는 정보라 트랜잭션 GUC 로 실어 보낸다(기여 로그 note).
  perform set_config(
    'app.contribution_ctx',
    jsonb_build_object(
      'action', 'edited',
      'source', 'manual',
      'note', coalesce(nullif(p_reason, ''), '관리자 등록자 교체')
    )::text,
    true
  );

  execute format('update public.%I set created_by = $1 where id = $2', p_table)
    using p_user_id, p_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- 대상이 없거나(잘못된 id) 이 원장에 대한 쓰기가 RLS 로 막힌 경우.
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;

  perform app.log_admin_audit(
    'CREATOR_CHANGE',
    jsonb_build_object('entity_table', p_table, 'entity_id', p_id, 'created_by', v_before),
    jsonb_build_object('entity_table', p_table, 'entity_id', p_id, 'created_by', p_user_id),
    p_reason
  );
end;
$$;

revoke all on function public.set_entity_creator(text, uuid, uuid, text) from public;
grant execute on function public.set_entity_creator(text, uuid, uuid, text) to authenticated;

comment on function public.set_entity_creator(text, uuid, uuid, text) is
  '관리자 전용 등록자(created_by) 교체. 허용 원장은 app.has_contribution_trigger() 가 카탈로그에서 판정하고, 변경은 audit_logs(CREATOR_CHANGE)와 원장 변동 이력에 함께 남는다. SECURITY INVOKER — 쓰기 가능 여부는 각 원장 RLS 가 판정한다.';
