-- =====================================================================
-- [외부 포털 확장 5/N] 명부 행이 사람을 들고 있으면 그 계정을 연다
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §5
--
-- 20260908170000이 원장 행 : 계정을 1:N으로 푼 뒤, "이 회사"만으로는 어느 계정을
-- 여는지 정해지지 않는다. 정하는 자리를 **명부**로 둔다(2026-09-08 사용자 확정) —
-- 명부 행이 처음부터 "어느 회사의 누구"를 들고, 개방은 그 값을 쓴다.
--
-- 종전에는 개방이 언제나 원장에서 이름·이메일·연락처를 꺼냈다. program_participants
-- .user_id가 이미 있었고 개방이 그것을 보존하기는 했지만(coalesce), 초대 레코드와
-- 감사 로그는 원장에서 꺼낸 계정을 썼으므로 미리 정해 둔 계정과 어긋났다.
--
-- **M&A에는 원장에서 꺼내는 길이 없다.** [2026-09-08 정정 — 아래 근거를 다시 적는다.
-- 최초 작성 시 "ma_buyers에는 연락 칸이 아예 없다"고 적었으나 사실이 아니다. 두 원장 모두
-- contact_name·contact_email을 갖는다(바이어는 20260907140000이 더했다). 결론은 그대로이나
-- 이유가 다르므로 틀린 근거를 남겨 두지 않는다.]
--
--   (1) issue_guest_account가 원장을 두 값으로 잠그고 있다 — p_master_table이
--       'startups'·'networks'가 아니면 첫머리에서 22023으로 멈춘다. M&A를 여는 일은
--       이 허용 목록과 guest_identities·program_participants의 CHECK를 함께 여는 일이다.
--   (2) 두 M&A 원장에는 **전화번호 칸이 없다.** 초기 비밀번호가 연락처이므로, 원장에서
--       꺼내는 경로만으로는 새 계정의 자격증명을 만들 수 없다.
--
-- 사람 인자(p_name·p_email·p_phone)를 받게 된 지금은 발급 창구에서 세 값을 직접 넣을 수
-- 있으므로 (2)는 막지 않는다. 그래서 M&A 명부는 사람을 정한 줄만 열 수 있고, 그 판정은
-- issue_guest_account가 사유와 함께 답한다.
--
-- 폴백을 남기는 이유:
--   이 마이그레이션 시점의 명부 행은 전부 user_id가 비어 있다(사람을 고르는 화면이
--   아직 없다). 폴백을 없애면 그 줄들이 전부 열리지 않는다. 즉 **지금은 동작이
--   바뀌지 않고**, 화면이 user_id를 채우기 시작하면 그 줄부터 새 길로 간다.
--
-- 함께 고친 것 하나:
--   폴백의 원장 이메일 조회가 case의 else로 networks를 답하고 있었다. 원장이 둘일
--   때는 맞았지만 M&A가 들어오면 ma_sellers의 이메일을 networks에서 찾게 된다.
--   when을 명시해 모르는 원장은 null로 떨어뜨린다 — 그러면 v_had가 거짓이 되고
--   issue_guest_account가 사유를 말한다(조용히 남의 원장을 뒤지지 않는다).
--
-- **함수 본문은 20260908190000에서 그대로 떠 왔고 두 곳만 바뀐다**(루프의 select에
-- user_id 추가, 계정 확보 블록). 손으로 옮겨 적지 않은 이유는 setof 반환에
-- return next 구조이고 본문이 130줄이기 때문이다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest / ac·mna(사업 담당자 판정)
--   - 데이터 등급: Internal
--   - 접근 주체: 그 사업의 담당자(PM·MEMBER). 함수 첫머리 판정 무변경.
--   - Scope 기준: 무변경 — app.is_program_manager(program_id) 그대로.
--   - 감사 로그: 무변경(GUEST_ACCESS_OPEN payload의 값이 정확해진다).
--   - 운영 영향: 지금은 동작이 바뀌지 않는다(명부 행의 user_id가 전부 비어 있다).
--     **user_id는 명부에 담을 때만 채운다** — 개방이 채우는 값(coalesce)이 아니라
--     담당자가 고른 값이어야 이 분기에 뜻이 생긴다.
--   - SECURITY DEFINER 신설: 없음. 종전대로 INVOKER다.
-- =====================================================================

create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table(participant_id uuid, program_code text, target_name text,
              email text, phone text, account_is_new boolean)
language plpgsql as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  r           record;
  v_prog      jsonb;
  v_code      text;
  v_status    text;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_company   uuid;
  v_account   uuid;
  v_table     text;
  v_had       boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return;
  end if;

  for r in
    select pp.id, pp.program_id, pp.master_table, pp.master_id, pp.login_status, pp.user_id
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    v_prog   := app.program_row(r.program_id);
    v_code   := v_prog ->> 'code';
    v_status := v_prog ->> 'status';

    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    if v_status in ('FINISHED', 'CANCELLED') then
      raise exception '종료·취소된 사업은 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;
    if r.master_id is null or r.master_table is null then
      raise exception '원장에 연결되지 않은 참가자는 로그인 대상이 아닙니다.' using errcode = '22023';
    end if;

    -- 계정을 확보하고, 그 계정이 **이미 있었는지**(v_had)를 함께 정한다. 그 값이 담당자에게
    -- 나가는 안내를 가른다 — 있었으면 "기존 비밀번호로 들어오세요", 없었으면 초기
    -- 비밀번호(연락처)를 안내한다. 발급은 멱등이라 사후에는 구분되지 않으므로 여기서 본다.
    --
    -- 길이 둘로 갈린다: 명부 행이 사람을 들고 있으면 그 계정, 아니면 원장 연락처.
    if r.user_id is not null then
      -- 명부 행이 이미 사람을 들고 있다. 그 계정을 연다 — 원장을 다시 보지 않는다.
      --
      -- 한 원장 행에 계정이 여럿일 수 있게 된 뒤로(20260908170000), "이 회사"만으로는
      -- 어느 계정을 여는지 정해지지 않는다. 정하는 자리는 명부이며 여기서는 그 값을 쓴다.
      -- 원장을 다시 보면 담당자가 고른 사람과 다른 계정이 열릴 수 있다.
      v_account := r.user_id;
      v_had     := true;
    else
      -- 옛 행(사람이 정해지기 전에 담긴 줄)과 원장 연락처로 여는 경로.
      --
      -- M&A 원장에는 이 길이 없다 — issue_guest_account가 원장을 startups·networks
      -- 두 값으로 잠그고 있고, 두 M&A 원장에는 전화번호 칸이 없어(초기 비밀번호가
      -- 연락처다) 원장에서 꺼내는 경로만으로는 자격증명을 만들 수 없다. 그래서 M&A
      -- 명부는 사람을 정한 줄만 열 수 있다(그 판정은 issue_guest_account가 사유와
      -- 함께 답한다).
      select exists (
        select 1
          from public.users u
         where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
           and u.deleted_at is null
           and lower(u.email) = lower(
                 case when r.master_table = 'startups'
                      then (select nullif(s.contact ->> 'email', '') from public.startups s where s.id = r.master_id)
                      when r.master_table = 'networks'
                      then (select nullif(n.email, '') from public.networks n where n.id = r.master_id)
                 end)
      ) into v_had;

      -- 계정 확보. 원장에 값이 모자라면 여기서 사유와 함께 멈춘다.
      v_account := public.issue_guest_account(r.master_table, r.master_id);
    end if;

    select u.name, u.email, u.phone, u.company_id
      into v_name, v_email, v_phone, v_company
      from public.users u
     where u.id = v_account;

    -- 초대 레코드는 명부 행당 1건. 사업코드는 로그인 요소가 아니라 안내·식별용으로 남는다.
    update public.guest_invitations
       set business_code     = v_code,
           name              = v_name,
           email             = v_email,
           phone             = v_phone,
           company_id        = v_company,
           app_user_id       = v_account,
           target_type       = 'PROGRAM',
           target_id         = r.program_id,
           invite_expires_at = now() + interval '1 year',
           otp_hash          = null,
           otp_expires_at    = null,
           otp_attempts      = 0
     where guest_invitations.participant_id = r.id;

    if not found then
      insert into public.guest_invitations
        (business_code, name, email, phone, invited_user_type, company_id,
         app_user_id, target_type, target_id, participant_id, created_by, invite_expires_at)
      select v_code, v_name, v_email, v_phone, u.user_type, v_company,
             v_account, 'PROGRAM', r.program_id, r.id, v_uid, now() + interval '1 year'
        from public.users u where u.id = v_account;
    end if;

    -- 이 사업에 아직 기간이 없으면 기본값(사업 종료일 + 14일)을 채운다. 원장이 둘이라
    -- 테이블 이름을 판정해 동적으로 쓴다. INVOKER라 여기서도 사업 원장의 RLS가 걸리며,
    -- 바로 위에서 담당자임을 확인했으므로 통과한다.
    v_table := case app.program_ws(r.program_id)
                 when 'ac'  then 'programs'
                 when 'mna' then 'ma_programs'
               end;
    if v_table is not null and (v_prog ->> 'guest_access_ends_at') is null then
      execute format(
        'update public.%I set guest_access_ends_at = $2, updated_at = now()'
        || ' where id = $1 and guest_access_ends_at is null', v_table)
        using r.program_id, app.default_access_end(r.program_id);
    end if;

    update public.program_participants pp
       set user_id         = coalesce(pp.user_id, v_account),
           login_status    = case when pp.login_status = 'ACTIVE' then 'ACTIVE'::public.participant_login_status
                                  else 'INVITED'::public.participant_login_status end,
           invited_at      = coalesce(pp.invited_at, now()),
           login_opened_by = v_uid,
           login_opened_at = now(),
           updated_at      = now()
     where pp.id = r.id;

    perform app.log_guest_access(
      v_account,
      'GUEST_ACCESS_OPEN',
      'guest:login',
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id,
                         'master_table', r.master_table, 'master_id', r.master_id,
                         'account_is_new', not v_had),
      null
    );

    participant_id := r.id;
    program_code   := v_code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    account_is_new := not v_had;
    return next;
  end loop;
end;
$fn$;
