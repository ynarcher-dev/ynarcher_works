-- =====================================================================
-- 기여 로그를 DB 트리거로 이관 (2단계-A) — startups · global_networks
--
-- 배경
--   1단계(20260721140000)에서 사업 원장 3종을 트리거로 옮겼다. 남은 원장 중
--   startups와 global_networks는 대량 업로드 경로가 없어(업로드는 NETWORKS 9종 전용)
--   사업 3종과 같은 방식으로 그대로 옮길 수 있다. NETWORKS 9종은 업로드가
--   source='upload'·batch_id를 클라이언트에서 남기고 있어 별도 슬라이스로 분리한다.
--
--   여기서 메워지는 누락이 둘 있다.
--     - global_networks 수정(useUpdateGlobal)은 기록 호출이 아예 없어 변경 이력이 남지 않았다.
--     - startups·global의 비활성화는 '로그를 먼저 남기고 원장을 지우는' 2요청 구조라,
--       뒤가 실패하면 '비활성화했다는 기록만 있고 실제로는 살아 있는' 행이 만들어질 수 있었다.
--
-- 사유(note)를 트리거가 알 수 없다는 문제
--   비활성화 사유는 원장 컬럼이 아니라 entity_contributions.note에만 있다(20260707170000).
--   트리거는 UPDATE 문만 보므로 사유를 복원할 수 없다. 그래서 사유가 필요한 행위는
--   트랜잭션 로컬 GUC(app.contribution_ctx)로 컨텍스트를 실어 보내고, 트리거가 그것을 읽는다.
--   GUC를 원장 쓰기와 같은 트랜잭션에서 세팅해야 하므로 전용 RPC를 경유한다
--   (PostgREST는 요청 하나가 트랜잭션 하나라, 컨텍스트만 따로 세팅해 두는 방식은 성립하지 않는다).
--
-- RPC를 SECURITY INVOKER로 두는 이유 — 이 마이그레이션의 핵심 결정
--   deactivate_entity는 DEFINER가 아니다. DEFINER로 만들면 RLS를 우회하므로 원장별 쓰기 규칙
--   (startups의 담당자 잠금 startups_update, global_networks의 networks 쓰기 게이트)을 함수 안에
--   손으로 복제해야 하고, 그 복제본이 정책과 어긋나는 순간 그대로 권한 구멍이 된다.
--   INVOKER면 원장 UPDATE가 기존 정책으로 검사되고, 함수는 '사유를 컨텍스트에 실어 주는' 일만 한다.
--   권한 판정의 단일 원천이 정책에 그대로 남는다.
--   (로그 삽입만은 트리거가 DEFINER로 수행한다 — 원장 쓰기가 이미 정책을 통과한 뒤의 부산물이라
--    로그 정책이 막아 이력만 비는 편이 더 위험하기 때문. 1단계와 같은 판단이다.)
--
-- 소유 워크스페이스: startup / networks · 데이터 등급: Internal
-- 접근 주체: 내부 사용자(임직원) · Scope: 워크스페이스(networks 쓰기) + 행 단위(담당자)
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260721140000_program_contribution_trigger.sql(1단계),
--       20260707150000_networks_contributions.sql(로그 원장·행위자 스탬프),
--       20260714120000_startup_pool_lifecycle.sql(startups 담당자 잠금·승격 RPC)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 범용 기록 트리거 — 다형 키는 트리거 인자, 부가 정보는 트랜잭션 컨텍스트로 받는다
--
--     컨텍스트(app.contribution_ctx)는 jsonb이며 전부 선택 항목이다.
--       action  : 판정된 행위를 덮어쓴다(예: 업로드 보강 'enriched')
--       source  : 기본 'manual'
--       batch_id: 업로드 배치
--       note    : 사유·설명
--     세팅되지 않았으면 평범한 수동 조작으로 간주한다 — 즉 화면이 원장을 직접 고치는
--     기존 경로는 아무것도 바꾸지 않아도 그대로 기록된다.
-- ---------------------------------------------------------------------
create or replace function app.log_entity_contribution()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_key    text := TG_ARGV[0];
  v_raw    text := current_setting('app.contribution_ctx', true);
  v_ctx    jsonb := coalesce(nullif(v_raw, '')::jsonb, '{}'::jsonb);
  v_action text;
begin
  if TG_OP = 'INSERT' then
    v_action := 'created';

  -- 소프트 삭제 전환. 사유는 컨텍스트로만 들어온다(원장에 사유 컬럼이 없다).
  elsif OLD.deleted_at is null and NEW.deleted_at is not null then
    v_action := 'deactivated';

  -- 병합 지정. merged_into_id가 없는 원장(global_networks 등)에서도 안전하도록
  -- 컬럼 존재 여부를 jsonb 키로 확인한 뒤 비교한다.
  elsif (to_jsonb(NEW) ? 'merged_into_id')
    and to_jsonb(OLD)->>'merged_into_id' is null
    and to_jsonb(NEW)->>'merged_into_id' is not null then
    v_action := 'merged';

  -- updated_at은 BEFORE UPDATE 트리거가 매번 갱신하므로 비교에서 뺀다.
  -- 빼지 않으면 '아무것도 바뀌지 않은 저장'까지 전부 편집으로 쌓인다.
  elsif (to_jsonb(OLD) - 'updated_at') is distinct from (to_jsonb(NEW) - 'updated_at') then
    v_action := 'edited';

  else
    return NEW;
  end if;

  insert into public.entity_contributions (entity_table, entity_id, action, source, batch_id, note)
  values (
    v_key,
    NEW.id,
    coalesce(v_ctx->>'action', v_action),
    coalesce(v_ctx->>'source', 'manual'),
    nullif(v_ctx->>'batch_id', '')::uuid,
    nullif(v_ctx->>'note', '')
  );

  return NEW;
end $$;

comment on function app.log_entity_contribution() is
  '원장 AFTER INSERT/UPDATE: 변동 이력 자동 기록. 다형 키는 TG_ARGV[0], 사유·배치 등 부가 정보는 트랜잭션 GUC app.contribution_ctx(jsonb)로 받는다.';

drop trigger if exists trg_startups_contribution on public.startups;
create trigger trg_startups_contribution
  after insert or update on public.startups
  for each row execute function app.log_entity_contribution('startups');

drop trigger if exists trg_global_networks_contribution on public.global_networks;
create trigger trg_global_networks_contribution
  after insert or update on public.global_networks
  for each row execute function app.log_entity_contribution('global_networks');

-- ---------------------------------------------------------------------
-- (2) 사유를 동반한 비활성화 RPC
--     화이트리스트는 '트리거가 붙은 원장'과 정확히 일치시킨다. 트리거 없는 원장을 여기에
--     넣으면 사유는 사라지고 로그도 남지 않는 조용한 유실이 된다. NETWORKS 9종은
--     트리거를 붙이는 슬라이스에서 함께 추가한다.
-- ---------------------------------------------------------------------
create or replace function public.deactivate_entity(
  p_entity_key text,
  p_id         uuid,
  p_reason     text
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_rows integer;
begin
  if p_entity_key not in ('startups', 'global_networks') then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  perform set_config('app.contribution_ctx',
                     jsonb_build_object('note', btrim(p_reason))::text,
                     true);

  -- 이미 비활성인 행을 다시 건드리지 않는다(중복 로그 방지).
  execute format(
    'update public.%I set deleted_at = now() where id = $1 and deleted_at is null',
    p_entity_key
  ) using p_id;
  get diagnostics v_rows = row_count;

  -- 0행이면 대상이 없거나 RLS가 막은 것이다. 둘을 구분해 알려주지 않는다
  -- (존재 여부가 권한 없는 사용자에게 새어 나가지 않도록).
  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
end $$;

comment on function public.deactivate_entity(text, uuid, text) is
  '사유를 남기는 소프트 삭제. 사유를 트랜잭션 컨텍스트에 실어 기록 트리거가 note로 남기게 한다. SECURITY INVOKER — 원장 쓰기 권한은 각 원장의 RLS가 그대로 판정한다.';

revoke all on function public.deactivate_entity(text, uuid, text) from public;
grant execute on function public.deactivate_entity(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (3) 투자 승격 RPC에 컨텍스트 주입
--     등록/수정 폼은 원장을 직접 UPDATE한 뒤 이 RPC를 또 호출한다. 두 요청은 각자 다른
--     트랜잭션이므로 트리거는 '수정' 두 줄을 남기게 된다. 뒤의 한 줄이 무엇이었는지
--     알아볼 수 있도록 사유를 붙인다.
--     본문은 20260714120000의 정의를 그대로 옮기고 set_config 한 줄만 더했다.
-- ---------------------------------------------------------------------
create or replace function public.promote_to_invested(
  p_startup_id       uuid,
  p_lead_user_id     uuid,
  p_support_user_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid         uuid := app.current_app_user_id();
  v_is_invested boolean;
  v_support     uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_lead_user_id is null then
    raise exception 'lead_required' using errcode = '23514';
  end if;

  select (management_status = 'invested')
    into v_is_invested
    from public.startups
   where id = p_startup_id and deleted_at is null;
  if not found then
    raise exception 'startup_not_found' using errcode = 'P0002';
  end if;

  -- 호출자 권한: 이미 투자면 담당자/관리자만, 아니면 networks 쓰기 권한자
  if v_is_invested then
    if not (app.is_admin() or app.is_startup_manager(p_startup_id, v_uid)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not app.can_write_workspace('networks') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- 담당자 재구성: 기존 리드 해제 → 리드/지원 upsert (리드 1명 유니크 인덱스 준수)
  update public.startup_managers set is_lead = false where startup_id = p_startup_id;

  insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
    values (p_startup_id, p_lead_user_id, true, v_uid)
  on conflict (startup_id, user_id)
    do update set is_lead = true, assigned_by = v_uid;

  foreach v_support in array coalesce(p_support_user_ids, '{}'::uuid[])
  loop
    if v_support is not null and v_support <> p_lead_user_id then
      insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
        values (p_startup_id, v_support, false, v_uid)
      on conflict (startup_id, user_id)
        do update set is_lead = false, assigned_by = v_uid;
    end if;
  end loop;

  perform set_config('app.contribution_ctx',
                     jsonb_build_object('note', '투자 승격·담당자 지정')::text,
                     true);

  update public.startups
     set management_status = 'invested'
   where id = p_startup_id;
end;
$$;
revoke all on function public.promote_to_invested(uuid, uuid, uuid[]) from public;
grant execute on function public.promote_to_invested(uuid, uuid, uuid[]) to authenticated;
