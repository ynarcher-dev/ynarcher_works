-- 게스트 명부 행을 그 사업에서 **실제로 뺀다** — 차단(BLOCKED)과 다른 축이다(2026-09-09).
--
-- 종전에는 담당자가 할 수 있는 일이 열기(`ACTIVE`)와 닫기(`BLOCKED`) 둘뿐이었다. 그래서 잘못
-- 담은 줄이 '차단됨'으로 명부에 영원히 남았다 — 끄기(`enabled=false`)가 오생성 정리 수단이
-- 아니어서 모듈 인스턴스에 하드 딜리트를 열었던 것과 **같은 상황이고 같은 답**이다(2026-09-02).
-- 잘못 만든 배치물은 '껐다'가 아니라 '없다'여야 목록이 사실을 말한다.
--
-- **지우는 것은 그릇이지 업무 기록이 아니다.** 이 행이 지는 것은 "이 사업에 이 대상을 담았다"는
-- 배치이고, 담당자가 만든 것을 같은 담당자가 거두는 일이다. 물리 삭제 금지 원칙과 충돌하지
-- 않는 이유가 그것이며, 밖에서 들어온 기록(지원서·질문·자료)은 **지우지 않고 그대로 남는다** —
-- 그 기록이 누구 것인지는 여전히 `users` 행이 답한다(사용자 지정 2026-09-09: 막지 말고 건수만
-- 밝힐 것). 다만 명부에 없는 사람의 지원서가 남으므로, 그 사실을 삭제창이 미리 말한다.
--
-- **계정은 지우지 않는다.** `users`를 가리키는 FK가 131개이고 그중 CASCADE는 7개뿐이라, 게스트가
-- 무엇 하나라도 남기면 DELETE 자체가 막힌다. 뚫는다 해도 그 기록이 누구 것인지 답할 수 없게
-- 된다(3_2 §1.7이 ADMIN에 삭제를 두지 않은 근거 그대로). 마지막 사업에서 빠져 참여가 0건이 된
-- 계정은 ADMIN이 찾아 정지한다 — 그 판단은 사람이 한다(다시 초대될 사람을 자동으로 재우지 않는다).
--
-- **문이 사라지면 토큰도 죽인다.** 지우기만 하고 `session_version`을 올리지 않으면 이미 발급된
-- 토큰이 그 사업을 계속 연다 — 닫기가 토큰을 무효화하는 것과 같은 이유이며, 빼기는 닫기보다
-- 더 강한 조치이므로 더 약하게 처리해서는 안 된다.
--
-- 딸려 지워지는 것은 `guest_invitations` 한 종류다(FK가 CASCADE). 자격증명은 2026-09-05에
-- `guest_credentials`로 옮겨졌고 계정의 신원은 `guest_identities`가 지므로, 초대 레코드가
-- 사라져도 계정과 비밀번호는 그대로다.
--
-- 보안 게이트: 신규 RPC 2종(SECURITY DEFINER). DEFINER인 이유는 명부에 DELETE 정책을 만들지
-- 않기 위해서다 — 정책을 열면 담당자가 PostgREST로 직접 DELETE를 쏠 수 있어 감사 로그와 토큰
-- 무효화를 건너뛰게 된다(모듈 하드 딜리트에서 `DELETE` 정책을 만들지 않은 근거와 같다).
-- 두 함수 모두 자체 인가하며(`app.is_program_manager`, 닫기와 같은 게이트), 동적 SQL·사용자
-- 입력 실행이 없고 `search_path`가 고정이다. 익명 실행은 회수한다.

begin;

-- ── 1. 감사 액션 하나를 연다 ────────────────────────────────────────────────
-- `create or replace`다(drop 아님) — 드롭·재생성하면 ACL과 주석이 조용히 초기값으로 돌아간다.
create or replace function app.log_guest_access(
  p_target_user_id uuid, p_action text, p_after text, p_data jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'app', 'public'
as $function$
begin
  if p_action not in (
    'GUEST_ACCESS_OPEN',
    'GUEST_ACCESS_CLOSE',
    'GUEST_ACCESS_REOPEN',
    'GUEST_ACCESS_REMOVE',
    'GUEST_ACCESS_WINDOW',
    'GUEST_PASSWORD_RESET'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, action, changed_workspace, after_permission, after_data, reason)
  values
    (app.current_app_user_id(), p_target_user_id, p_action, 'guest', p_after, p_data, p_reason);
end;
$function$;

-- ── 2. 미리보기 — 무엇이 남는지 삭제 전에 센다 ──────────────────────────────
-- 세는 것은 **그 사람이 그 사업에서 남긴 것**뿐이다. 사업으로 좁힐 수 없는 축(다른 원장에
-- 남긴 댓글 등)은 세지 않는다 — 이 사업과 무관한 건수를 함께 세면 경고가 사실보다 커지고,
-- 사실보다 큰 경고는 곧 아무도 읽지 않는 경고가 된다.
create or replace function public.program_participant_removal_preview(p_participant_ids uuid[])
returns table(kind text, label text, n bigint)
language plpgsql
stable
security definer
set search_path to 'app', 'public'
as $function$
declare
  r record;
begin
  if app.current_app_user_id() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return;
  end if;

  -- 미리보기도 담당자만 본다 — 건수 자체가 그 사업의 사실이다.
  for r in
    select distinct pp.program_id
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 명부를 볼 수 있습니다.' using errcode = '42501';
    end if;
  end loop;

  return query
  with target as (
    select pp.user_id, pp.program_id, pp.entity_key
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
       and pp.user_id is not null
  ),
  counted as (
    select '지원서'::text as label,
           count(*)::bigint as n,
           'application'::text as kind
      from public.application_submissions s
      join target t on t.user_id = s.applicant_user_id and t.program_id = s.program_id
     where s.deleted_at is null
    union all
    select 'Q&A 질문', count(*)::bigint, 'question'
      from public.program_questions q
      join target t on t.user_id = q.created_by
                   and t.program_id = q.program_id
                   and t.entity_key = q.entity_key
     where q.deleted_at is null
    union all
    select '올린 자료', count(*)::bigint, 'attachment'
      from public.attachments a
      join public.program_modules m on m.id = a.program_module_id
      join target t on t.user_id = a.uploaded_by
                   and t.program_id = m.program_id
                   and t.entity_key = m.entity_key
     where a.deleted_at is null
  )
  select c.kind, c.label, c.n from counted c where c.n > 0;
end;
$function$;

comment on function public.program_participant_removal_preview(uuid[]) is
  '명부 행을 뺐을 때 남는 기록의 건수(지원서·질문·자료). 삭제창이 미리 밝히는 용도이며 담당자 전용.';

-- ── 3. 명부 행을 뺀다 ───────────────────────────────────────────────────────
create or replace function public.remove_program_participants(
  p_participant_ids uuid[], p_reason text default null)
returns integer
language plpgsql
security definer
set search_path to 'app', 'public'
as $function$
declare
  v_uid   uuid := app.current_app_user_id();
  r       record;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return 0;
  end if;

  for r in
    select pp.id, pp.program_id, pp.user_id, pp.master_table, pp.master_id, pp.login_status
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    -- 닫기와 같은 게이트다. 담은 사람이 거둘 수 있어야 하므로 더 좁히지 않는다.
    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 명부에서 뺄 수 있습니다.' using errcode = '42501';
    end if;

    -- 문이 사라졌는데 발급된 토큰이 살아 있으면 그 사업이 계속 열려 있다.
    -- 토큰은 계정 단위라 이 사람의 다른 사업 세션도 함께 끊긴다 — 잘게 자를 수 없다.
    if r.user_id is not null then
      update public.users
         set session_version = session_version + 1
       where id = r.user_id
         and app.is_guest_user_type(user_type);
    end if;

    -- 행이 사라지므로 감사 로그가 유일한 흔적이다. 지우기 전에 남긴다.
    perform app.log_guest_access(
      r.user_id,
      'GUEST_ACCESS_REMOVE',
      'guest:removed',
      jsonb_build_object(
        'participant_id', r.id,
        'program_id',     r.program_id,
        'master_table',   r.master_table,
        'master_id',      r.master_id,
        'login_status',   r.login_status
      ),
      p_reason
    );

    delete from public.program_participants where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

comment on function public.remove_program_participants(uuid[], text) is
  '게스트 명부 행을 그 사업에서 물리적으로 뺀다(담당자 전용). 계정·비밀번호·다른 사업의 줄은 그대로이며, 지원서·질문·자료 등 밖에서 들어온 기록도 지우지 않는다.';

-- 익명 실행은 회수한다 — 담당자 전용 DEFINER 함수라 `anon`이 부를 자리가 없다.
revoke all on function public.program_participant_removal_preview(uuid[]) from public, anon;
revoke all on function public.remove_program_participants(uuid[], text) from public, anon;
grant execute on function public.program_participant_removal_preview(uuid[]) to authenticated;
grant execute on function public.remove_program_participants(uuid[], text) to authenticated;

commit;
