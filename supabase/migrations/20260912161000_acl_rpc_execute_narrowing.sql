-- =====================================================================
-- RPC 실행 권한 좁히기 — PUBLIC에 열린 네 함수를 authenticated로 한정합니다
--
-- 재생된 DB에서 이 넷은 EXECUTE가 `PUBLIC, postgres, authenticated`로 부여되어 있어
-- **anon도 호출할 수 있었습니다.**
--
--   public.set_program_staffing(uuid, jsonb, jsonb)
--   public.set_ma_program_staffing(uuid, jsonb, jsonb)
--   public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb,
--                               timestamptz, timestamptz)
--   public.network_entity_metrics()
--
-- 앞의 셋은 담당자 배정과 모집 공고를 바꾸는 쓰기 함수이고, 넷째는 NETWORKS 집계를 냅니다.
-- 넷 모두 SECURITY DEFINER이므로 소유자 권한으로 돌며, **그래서 EXECUTE가 유일한 바깥
-- 경계입니다.**
--
-- 지금 새는 자리는 아닙니다 — 넷 다 본문 첫머리에서 스스로 인가를 확인합니다
-- (app.is_admin() 또는 can_write_workspace + can_access_program, 집계 함수는
-- can_read_workspace('networks')를 where 절에 걸어 권한이 없으면 0행을 냅니다).
-- 그러나 PUBLIC 부여에는 근거가 없고, 자체 검사 한 겹만 남기는 것보다 바깥 문을 먼저
-- 닫아 두는 편이 낫습니다. **본문의 검사는 그대로 둡니다** — 이 파일은 문만 좁힙니다.
--
-- 회수해도 되는지 확인한 것
--   · anon 호출자: apps/guest는 RPC를 한 건도 부르지 않습니다(전수 확인).
--   · 서버 호출자: Edge Function이 부르는 RPC 8개에 이 넷은 없습니다.
--   · 화면 호출자: 모두 apps/works(로그인 뒤 authenticated)입니다 —
--     features/program/hooks.ts:194, features/bulk/bulkAssign.tsx:234(config.rpcs.setStaffing),
--     features/program/recruitment/recruitmentHooks.ts:200(set_application_form).
--   · 내부 호출자: SECURITY DEFINER 함수 안에서 부르는 경로는 소유자(postgres) 권한으로
--     도므로 PUBLIC 회수와 무관합니다.
--
-- 그래서 PUBLIC과 레거시 프로젝트에 직접 부여된 anon 권한을 함께 회수합니다.
-- authenticated는 환경별 기본값에 의존하지 않도록 명시적으로 다시 부여합니다.
--
-- 대상에 넣지 않은 것: proacl이 비어 있어 PUBLIC이 EXECUTE를 갖는 함수 넷
-- (assign_entity_code, enforce_module_assignee_in_pool, enforce_ma_module_assignee_in_pool,
--  gen_entity_code). 앞의 셋은 트리거 함수라 직접 호출로 할 수 있는 일이 없고, gen_entity_code는
--  값만 만들어 돌려줍니다. 함께 건드리면 이번 범위가 넓어지므로 별도 과제로 남깁니다.
-- =====================================================================

-- ── 대상이 실제로 그 모습인지 먼저 확인합니다 ──────────────────────────
--
-- 시그니처가 바뀌었거나 PUBLIC 부여가 이미 없다면, 조용히 지나가는 대신 무엇이 다른지
-- 말하고 멈춥니다. "아무것도 안 했는데 성공"이 가장 나쁜 결과입니다.
do $$
declare
  v_missing text;
begin
  select string_agg(t.sig, ', ' order by t.sig)
    into v_missing
    from (values
      ('public.set_program_staffing(uuid,jsonb,jsonb)'),
      ('public.set_ma_program_staffing(uuid,jsonb,jsonb)'),
      ('public.set_application_form(uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz)'),
      ('public.network_entity_metrics()')
    ) as t(sig)
   where to_regprocedure(t.sig) is null;

  if v_missing is not null then
    raise exception '대상 함수를 찾지 못했습니다(시그니처가 바뀌었습니까?): %', v_missing
      using errcode = '42883';
  end if;
end $$;

-- ── 회수: PUBLIC 및 레거시 anon 직접 부여 ───────────────────────────────
revoke execute on function
  public.set_program_staffing(uuid, jsonb, jsonb),
  public.set_ma_program_staffing(uuid, jsonb, jsonb),
  public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb,
                              timestamptz, timestamptz),
  public.network_entity_metrics()
from public, anon;

grant execute on function
  public.set_program_staffing(uuid, jsonb, jsonb),
  public.set_ma_program_staffing(uuid, jsonb, jsonb),
  public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb,
                              timestamptz, timestamptz),
  public.network_entity_metrics()
to authenticated;

-- ── 사후 확인 ───────────────────────────────────────────────────────────
do $$
declare
  v_bad text;
  v_lost text;
begin
  -- (1) anon이 더는 부를 수 없어야 합니다.
  select string_agg(t.sig, ', ' order by t.sig)
    into v_bad
    from (values
      ('public.set_program_staffing(uuid,jsonb,jsonb)'),
      ('public.set_ma_program_staffing(uuid,jsonb,jsonb)'),
      ('public.set_application_form(uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz)'),
      ('public.network_entity_metrics()')
    ) as t(sig)
   where has_function_privilege('anon', to_regprocedure(t.sig), 'EXECUTE');

  if v_bad is not null then
    raise exception 'anon이 아직 실행할 수 있습니다: %', v_bad using errcode = '42501';
  end if;

  -- (2) authenticated는 그대로 부를 수 있어야 합니다 — 화면을 끄는 것이 목적이 아닙니다.
  select string_agg(t.sig, ', ' order by t.sig)
    into v_lost
    from (values
      ('public.set_program_staffing(uuid,jsonb,jsonb)'),
      ('public.set_ma_program_staffing(uuid,jsonb,jsonb)'),
      ('public.set_application_form(uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz)'),
      ('public.network_entity_metrics()')
    ) as t(sig)
   where not has_function_privilege('authenticated', to_regprocedure(t.sig), 'EXECUTE');

  if v_lost is not null then
    raise exception
      'authenticated가 실행 권한을 잃었습니다(의도한 결과가 아닙니다): %', v_lost
      using errcode = '42501';
  end if;
end $$;
