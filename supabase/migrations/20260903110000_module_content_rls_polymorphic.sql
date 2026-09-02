-- =====================================================================
-- [사업 공용] 정형 운영 모듈 내용물 원장 RLS — 'ac' 하드코딩 제거
-- 선행: 20260903100000_program_module_ledger_unify.sql (모듈·명부 원장 통합)
--
-- 배경:
--   20260705150500_ac_rls.sql은 AC 원장 40여 종의 정책을 한 루프로 찍어내며 워크스페이스를
--   'ac' 리터럴로 박았다. 모듈 원장이 통합된 지금 이 원장들에는 M&A·PROJECT 사업의 행도
--   들어오므로, 리터럴을 그대로 두면 M&A 평가 결과가 AC 권한자에게 열린다.
--
-- 어떻게 워크스페이스를 아는가:
--   행마다 소유 워크스페이스를 새로 저장하지 않는다. **뿌리까지 거슬러 올라가 묻는다.**
--   · program_id를 가진 원장 → app.program_ws(program_id)가 세 사업 원장 중 어디인지 답한다
--   · program_module_id만 가진 원장 → app.module_ws(program_module_id)가 답한다
--   · 둘 다 없는 하위 원장 → 부모를 EXISTS로 타고 올라가 같은 질문을 반복한다
--   컬럼을 더하지 않는 이유는 하나다 — 같은 사실을 두 곳에 적으면 언젠가 어긋나고,
--   어긋났을 때 어느 쪽이 권한을 정하는지 정할 근거가 없다.
--
-- 왜 부모의 정책에 기대지 않고 식을 펼치는가:
--   `exists (select 1 from 부모 where id = fk)` 한 줄만 쓰면 부모의 **SELECT** 정책이
--   적용된다. 읽기에는 맞지만 쓰기에는 틀리다 — 읽기만 가능한 사용자가 자식 행을 넣을 수
--   있게 된다. 그래서 읽기·쓰기 각각의 게이트를 뿌리까지 펼쳐 생성한다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (행마다 뿌리가 답한다)
--   - 데이터 등급: Internal (평가·멘토링·매칭 기록. 개인정보 포함 — 마스킹은 화면 책임)
--   - 접근 주체: 내부 사용자. 게스트 정책은 기존 이름 그대로 살아 있다(본 파일은 손대지 않는다)
--   - Scope 기준: app.can_read/write_workspace(ws) + app.can_access_ws_program(ws, program_id)
--   - 신규 SECURITY DEFINER: app.program_ws / app.module_ws / app.module_program.
--     DEFINER인 이유는 정책 안에서 사업·모듈 원장을 읽어야 하는데 INVOKER면 (a) 그 원장의
--     정책이 재귀하고 (b) 아직 판정 전인 사용자가 다른 워크스페이스 원장 읽기 권한을 갖고
--     있어야 한다. 셋 다 인자로 받은 id의 **소속만** 돌려주며 행 내용을 노출하지 않는다.
--   - 감사 로그: 신규 Export·다운로드 경로 없음.
--   - 운영 영향: 정책 교체만으로 기존 AC 행의 접근 결과는 동일하다(program_ws가 'ac'를 답한다).
-- 근거: 20260705150500_ac_rls.sql, 20260721130000_program_entity_key_split.sql,
--       20260716170000_recruitment_form_customization.sql, 20260803230100_program_module_content.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 뿌리를 묻는 헬퍼
-- ---------------------------------------------------------------------
create or replace function app.program_ws(p_program_id uuid)
returns text
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case
    when p_program_id is null then null
    when exists (select 1 from public.programs         where id = p_program_id) then 'ac'
    when exists (select 1 from public.ma_programs      where id = p_program_id) then 'mna'
    when exists (select 1 from public.project_programs where id = p_program_id) then 'project'
  end;
$fn$;

grant execute on function app.program_ws(uuid) to authenticated;

comment on function app.program_ws(uuid) is
  '사업 id → 소유 워크스페이스 키(ac/mna/project). 세 사업 원장이 물리적으로 분리되어 있어 id만으로는 알 수 없는 것을 답한다. 소속만 반환하며 행 내용을 노출하지 않는다.';

create or replace function app.module_ws(p_module_id uuid)
returns text
language sql
stable
security definer
set search_path = app, public
as $fn$
  select app.entity_key_workspace(m.entity_key)
    from public.program_modules m
   where m.id = p_module_id;
$fn$;

grant execute on function app.module_ws(uuid) to authenticated;

comment on function app.module_ws(uuid) is
  '모듈 id → 소유 워크스페이스 키. 통합된 program_modules.entity_key가 근거다.';

create or replace function app.module_program(p_module_id uuid)
returns uuid
language sql
stable
security definer
set search_path = app, public
as $fn$
  select m.program_id from public.program_modules m where m.id = p_module_id;
$fn$;

grant execute on function app.module_program(uuid) to authenticated;

comment on function app.module_program(uuid) is
  '모듈 id → 소속 사업 id. 모듈에만 매달린 하위 원장이 사업 스코프를 되찾는 경로.';

-- ---------------------------------------------------------------------
-- (2) 정책 생성 — 뿌리까지의 경로를 표에 적고, 식은 재귀로 펼친다
--     경로를 손으로 적는 이유: FK가 여러 개인 표(evaluation_assignments는 폼·평가자·대상을
--     동시에 문다)에서 **어느 것이 소유 경로인가**는 카탈로그가 답할 수 없는 업무 판단이다.
-- ---------------------------------------------------------------------
do $$
declare
  -- (table, kind, a, b)
  --   kind='program' : a=사업 id 컬럼
  --   kind='module'  : a=모듈 id 컬럼
  --   kind='parent'  : a=부모 테이블, b=부모를 가리키는 FK 컬럼
  anchors  text[][] := array[
    -- 모집 —------------------------------------------------------------
    array['application_forms',           'program', 'program_id',        ''],
    array['application_submissions',     'program', 'program_id',        ''],
    array['application_form_fields',     'parent',  'application_forms', 'form_id'],
    array['application_answers',         'parent',  'application_submissions', 'submission_id'],
    -- 평가 엔진 —--------------------------------------------------------
    array['evaluation_forms',            'module',  'program_module_id', ''],
    array['evaluation_criteria',         'parent',  'evaluation_forms',  'form_id'],
    array['evaluation_targets',          'parent',  'evaluation_forms',  'form_id'],
    array['evaluation_assignments',      'parent',  'evaluation_forms',  'form_id'],
    array['evaluation_submissions',      'parent',  'evaluation_forms',  'form_id'],
    array['evaluation_answers',          'parent',  'evaluation_submissions', 'submission_id'],
    -- 서면·현장 평가 —---------------------------------------------------
    array['document_review_rounds',      'module',  'program_module_id', ''],
    array['document_review_snapshots',   'parent',  'document_review_rounds', 'round_id'],
    array['onsite_eval_sessions',        'module',  'program_module_id', ''],
    array['onsite_eval_presentations',   'parent',  'onsite_eval_sessions', 'session_id'],
    array['selection_results',           'module',  'program_module_id', ''],
    -- OT·출석 —----------------------------------------------------------
    array['orientation_sessions',        'module',  'program_module_id', ''],
    array['session_attendees',           'parent',  'orientation_sessions', 'session_id'],
    array['session_materials',           'parent',  'orientation_sessions', 'session_id'],
    array['attendance_logs',             'parent',  'session_attendees', 'session_attendee_id'],
    -- 멘토링 —------------------------------------------------------------
    array['mentoring_relationships',     'module',  'program_module_id', ''],
    array['mentoring_sessions',          'parent',  'mentoring_relationships', 'relationship_id'],
    array['mentoring_logs',              'parent',  'mentoring_sessions', 'mentoring_session_id'],
    array['mentor_satisfaction_records', 'parent',  'mentoring_sessions', 'mentoring_session_id'],
    array['mentor_feedback_records',     'parent',  'mentoring_sessions', 'mentoring_session_id'],
    -- 비즈니스 매칭 —-----------------------------------------------------
    array['matching_events',             'module',  'program_module_id', ''],
    array['matching_tables',             'parent',  'matching_events',   'matching_event_id'],
    array['matching_slots',              'parent',  'matching_events',   'matching_event_id'],
    array['matching_bookings',           'parent',  'matching_slots',    'slot_id'],
    array['counseling_logs',             'parent',  'matching_bookings', 'booking_id'],
    -- 데모데이 —----------------------------------------------------------
    array['demoday_sessions',            'module',  'program_module_id', ''],
    array['demoday_presentations',       'parent',  'demoday_sessions',  'demoday_session_id'],
    array['demoday_interests',           'parent',  'demoday_sessions',  'demoday_session_id'],
    array['follow_up_meetings',          'parent',  'demoday_interests', 'demoday_interest_id'],
    -- 일정·성과 —---------------------------------------------------------
    array['program_timeline_items',      'program', 'program_id',        ''],
    array['timeline_conflicts',          'program', 'program_id',        ''],
    array['module_kpi_snapshots',        'program', 'program_id',        ''],
    array['outcome_records',             'program', 'program_id',        ''],
    array['export_jobs',                 'program', 'program_id',        ''],
    -- 글쓰기 하위(구 커스텀 활동 부속) —-----------------------------------
    array['activity_minutes',            'parent',  'program_posts',     'custom_activity_id'],
    array['action_items',                'parent',  'program_posts',     'custom_activity_id'],
    array['activity_attachments',        'parent',  'program_posts',     'custom_activity_id'],
    array['activity_attendees',          'parent',  'program_posts',     'custom_activity_id']
  ];
  i        int;
  t        text;
  sel_expr text;
  wr_expr  text;
begin
  -- 경로 표를 먼저 세운다(재귀 전개 함수가 이 표를 읽는다).
  create temp table rls_spec (tbl text primary key, kind text, a text, b text) on commit drop;
  for i in 1 .. array_length(anchors, 1) loop
    insert into pg_temp.rls_spec (tbl, kind, a, b)
    values (anchors[i][1], anchors[i][2], anchors[i][3], nullif(anchors[i][4], ''));
  end loop;

  -- 지정한 별칭 기준으로 그 테이블의 게이트 식을 만든다(부모는 재귀).
  -- 임시 함수로 두어 정책 문자열을 만드는 동안에만 쓰고 마지막에 지운다.
  -- EXECUTE로 감싸는 이유: 함수 본문이 그 자체로 달러 인용 문자열이라, DO 블록 안에
  -- 날것으로 두면 바깥 plpgsql 파서가 본문을 훑게 된다. 문자열로 넘기면 그럴 일이 없다.
  execute $ddl$
  create or replace function pg_temp.ws_gate(p_table text, p_alias text, p_mode text)
  returns text
  language plpgsql
  as $g$
  declare
    kind   text;
    a      text;
    b      text;
    ws     text;
    palias text;
  begin
    select spec.kind, spec.a, spec.b into kind, a, b
      from pg_temp.rls_spec spec where spec.tbl = p_table;

    if kind is null then
      raise exception '경로가 정의되지 않은 원장입니다: %', p_table;
    end if;

    if kind = 'program' then
      ws := format('app.program_ws(%I.%I)', p_alias, a);
      return format(
        'app.can_%s_workspace(%s) and app.can_access_ws_program(%s, %I.%I)',
        p_mode, ws, ws, p_alias, a);
    elsif kind = 'module' then
      ws := format('app.module_ws(%I.%I)', p_alias, a);
      return format(
        'app.can_%s_workspace(%s) and app.can_access_ws_program(%s, app.module_program(%I.%I))',
        p_mode, ws, ws, p_alias, a);
    else
      palias := 'p_' || replace(a, '.', '_') || '_' || length(p_alias)::text;
      return format(
        'exists (select 1 from public.%I %I where %I.id = %I.%I and %s)',
        a, palias, palias, p_alias, b, pg_temp.ws_gate(a, palias, p_mode));
    end if;
  end;
  $g$;
  $ddl$;

  for i in 1 .. array_length(anchors, 1) loop
    t := anchors[i][1];
    if to_regclass('public.' || t) is null then
      raise exception '없는 원장에 정책을 만들려 했습니다: %', t;
    end if;

    sel_expr := pg_temp.ws_gate(t, t, 'read');
    wr_expr  := pg_temp.ws_gate(t, t, 'write');

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_ac_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_ac_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_ac_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_update', t);

    execute format('create policy %I on public.%I for select using (%s)', t || '_ws_select', t, sel_expr);
    execute format('create policy %I on public.%I for insert with check (%s)', t || '_ws_insert', t, wr_expr);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)',
      t || '_ws_update', t, wr_expr, wr_expr);
  end loop;

  drop function pg_temp.ws_gate(text, text, text);
end $$;
