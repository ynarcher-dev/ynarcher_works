-- =====================================================================
-- 수정 사유(변동 이력 코멘트) — update_entity RPC + 사업 원장 트리거 통합
--
-- 왜 필요한가
--   변동 이력의 마지막 열은 이미 `source`(수기/업로드)와 `note`를 이어 붙여 보여 준다.
--   그런데 note를 채우는 경로가 비활성화·이관·병합·업로드뿐이라, 일반 수정은 34건이
--   전부 "수기"로만 쌓여 무엇이 왜 바뀌었는지 읽을 수 없었다. 수정에도 사유를 붙인다.
--
-- 왜 RPC여야 하는가
--   사유는 원장 컬럼이 아니라 기여 로그의 note로만 남고, 트리거는 사유를 알 수 없다.
--   클라이언트는 트랜잭션 GUC(app.contribution_ctx)를 직접 세팅할 수 없으므로,
--   비활성화(deactivate_entity)와 같은 방식으로 컨텍스트를 실어 주는 함수를 경유한다.
--   SECURITY INVOKER인 이유도 동일하다 — 쓰기 권한은 각 원장의 기존 RLS가 그대로 판정한다.
--   DEFINER로 만들면 11종+4종 원장의 정책을 함수 안에 복제해야 하고 그 복제본이 곧 구멍이 된다.
--
-- 사업 원장 3종을 함께 통합하는 이유
--   AC·M&A·PROJECT는 20260721140000의 app.log_program_contribution()을 쓰는데, 이 함수는
--   컨텍스트를 아예 읽지 않아 note를 넘겨도 버려진다. 또 app.has_contribution_trigger()는
--   'log_entity_contribution이 붙어 있는가'로 대상 원장을 판정하므로 사업 원장은 RPC의
--   허용 목록에도 들어오지 않는다. 두 기록 함수를 하나로 합쳐 둘 다 해소한다
--   (log_entity_contribution은 deleted_at·merged_into_id를 jsonb 경유로 보므로 컬럼 구성이
--   다른 사업 원장에 그대로 붙어도 안전하다).
--
-- 소유 워크스페이스: 공통(networks · startup · ac/mna/project) · 데이터 등급: Internal
-- 접근 주체: 내부 사용자(임직원) · Scope: 각 원장의 기존 워크스페이스 쓰기 권한
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260721160000(컨텍스트 규약·카탈로그 판정), 20260721140000(사업 원장 트리거)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 사업 원장 3종의 기록 트리거를 공용 함수로 교체
--     다형 키(program/ma_program/project_program)는 종전과 동일하게 인자로 넘긴다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_programs_contribution on public.programs;
create trigger trg_programs_contribution
  after insert or update on public.programs
  for each row execute function app.log_entity_contribution('program');

drop trigger if exists trg_ma_programs_contribution on public.ma_programs;
create trigger trg_ma_programs_contribution
  after insert or update on public.ma_programs
  for each row execute function app.log_entity_contribution('ma_program');

drop trigger if exists trg_project_programs_contribution on public.project_programs;
create trigger trg_project_programs_contribution
  after insert or update on public.project_programs
  for each row execute function app.log_entity_contribution('project_program');

-- 더 이상 어느 트리거도 참조하지 않는다. 남겨 두면 '어느 쪽이 진짜 기록자인가'가 흐려진다.
drop function if exists app.log_program_contribution();

-- ---------------------------------------------------------------------
-- (2) 수정 저장 — 사유를 필수로 받는 원장 UPDATE
--
--   대상 판정은 손으로 나열하지 않고 app.has_contribution_trigger()에 위임한다.
--   여기서 p_table은 물리 테이블명이다(사업 원장의 다형 키 'program'과 구분: 다형 키는
--   트리거 인자로만 쓰이고, 테이블명은 카탈로그 판정과 UPDATE 대상 모두에 쓰인다).
--
--   컬럼은 넘어온 키만 SET한다 — jsonb_populate_record를 통째로 쓰면 빠진 컬럼이 NULL로
--   덮여 원장이 지워진다(app.insert_entity_row와 같은 이유). 시스템 컬럼은 거절한다:
--   조용히 무시하면 '보냈는데 반영되지 않은' 저장이 되고, 통과시키면 작성자·생성시각을
--   클라이언트가 갈아 끼울 수 있다. 비활성화는 사유 규약이 다른 전용 RPC의 몫이다.
-- ---------------------------------------------------------------------
create or replace function public.update_entity(
  p_table  text,
  p_id     uuid,
  p_values jsonb,
  p_note   text
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_cols text;
  v_set  text;
  v_rows integer;
begin
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'empty_values' using errcode = '22023';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if p_values ?| array['id', 'created_at', 'created_by', 'deleted_at', 'merged_into_id'] then
    raise exception 'protected_column' using errcode = '22023';
  end if;

  perform set_config('app.contribution_ctx',
                     jsonb_build_object('note', btrim(p_note))::text,
                     true);

  select string_agg(format('%I', k), ', ' order by k),
         string_agg(format('%I = r.%I', k, k), ', ' order by k)
    into v_cols, v_set
    from jsonb_object_keys(p_values) as k;

  execute format(
    'update public.%I t set %s from (select %s from jsonb_populate_record(null::public.%I, $1)) r where t.id = $2',
    p_table, v_set, v_cols, p_table
  ) using p_values, p_id;
  get diagnostics v_rows = row_count;

  -- 0행이면 대상이 없거나 RLS가 막은 것이다. 둘을 구분해 알려주지 않는다.
  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
end $$;

comment on function public.update_entity(text, uuid, jsonb, text) is
  '수정 저장(사유 필수): 사유를 트랜잭션 컨텍스트에 실어 원장을 UPDATE한다. 원장 변경과 사유 기록이 한 트랜잭션. SECURITY INVOKER — 쓰기 권한은 각 원장 RLS가 판정한다.';

revoke all on function public.update_entity(text, uuid, jsonb, text) from public;
grant execute on function public.update_entity(text, uuid, jsonb, text) to authenticated;
