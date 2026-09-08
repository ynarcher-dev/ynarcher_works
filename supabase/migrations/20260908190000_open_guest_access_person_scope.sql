-- =====================================================================
-- [외부 포털 확장 3/N] 명부에서 여는 경로의 "기존 계정" 판정을 사람 단위로
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §5
--
-- 20260908170000이 원장 행 : 계정을 1:N으로 풀면서 남긴 하나를 여기서 닫는다.
--
--   open_program_guest_access의 v_had는 "계정이 이미 있었는가"를 답하고, 그 답이
--   담당자에게 나가는 안내를 가른다(초기 비밀번호 vs 기존 비밀번호). 종전 판정은
--   갈래가 둘이었다 — (1) 이 원장 행에 인격 매핑이 있는가, (2) 같은 이메일의 게스트
--   계정이 있는가.
--
--   원장 행 하나에 계정이 하나였을 때는 (1)이 곧 "이 사람"이었다. 1:N이 된 지금은
--   **같은 회사의 다른 담당자**가 계정을 가진 것만으로 참이 되어, 처음 들어오는
--   사람에게 초기 비밀번호 안내가 나가지 않는다. (1)을 걷고 (2)만 남긴다 —
--   이 경로는 원장 연락처로 발급하므로 그 이메일이 곧 이 사람이다.
--
-- **함수 본문은 20260907170000에서 그대로 떠 왔고 v_had 조회만 바뀐다.**
-- 손으로 옮겨 적지 않은 이유는 이 함수가 setof 반환에 return next 구조이고 본문이
-- 130줄이라, 옮겨 적다 한 줄이 어긋나면 그 자리는 호출 순간에만 드러나기 때문이다.
--
-- 알아 둘 파급 하나(고치지 않는다):
--   계정의 키가 사람이 되면서, **원장 이메일을 고치면 다음 개방에서 계정이 새로 선다.**
--   종전에는 인격 매핑이 원장 행으로 걸려 있어 이메일이 바뀌어도 같은 계정을 썼다.
--   지금은 다른 이메일 = 다른 사람이므로 이것이 정의상 맞는 동작이다(오타를 고친
--   경우에는 계정이 둘이 되지만, 옛 계정에 새 주소를 붙여도 로그인 ID는 바뀌지 않아
--   고친 뜻이 이루어지지 않는다 — 합치는 일은 사람이 판단할 몫이다).
--   발급 화면은 그 원장 행의 기존 계정을 목록으로 세우므로 눈으로 알아챌 수 있다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest / ac·mna(사업 담당자 판정)
--   - 데이터 등급: Internal (안내 문구를 가르는 boolean 하나)
--   - 접근 주체: 그 사업의 담당자(PM·MEMBER). 함수 첫머리 판정 무변경.
--   - Scope 기준: 무변경 — app.is_program_manager(program_id) 그대로.
--   - 감사 로그: 무변경(GUEST_ACCESS_OPEN payload의 account_is_new 값만 정확해진다).
--   - 운영 영향: 조회 한 개가 좁아질 뿐 쓰기·인가·반환 모양이 모두 같다.
--   - SECURITY DEFINER 신설: 없음. 이 함수는 종전대로 INVOKER다(사업 원장 RLS가
--     그대로 걸려야 담당자 판정이 성립한다).
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
    select pp.id, pp.program_id, pp.master_table, pp.master_id, pp.login_status
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

    -- 계정이 이미 있었는지를 발급 전에 본다(발급은 멱등이라 사후에는 구분되지 않는다).
    -- **이 사람에게** 있었는가를 묻는다 — 이 경로는 원장 연락처로 발급하므로 그 이메일이
    -- 곧 발급 대상이다. 있으면 "기존 비밀번호로 들어오세요", 없으면 초기 비밀번호(연락처)를
    -- 안내한다.
    --
    -- 2026-09-08에 인격 매핑 갈래를 걷었다. 원장 행 하나에 계정이 하나였을 때는 "이 원장
    -- 행에 계정이 있는가"가 곧 이 사람이었지만, 1:N이 된 뒤로는 **같은 회사의 다른
    -- 담당자**가 계정을 가진 것만으로 참이 되어 처음 들어오는 사람에게 초기 비밀번호
    -- 안내가 나가지 않는다.
    select exists (
      select 1
        from public.users u
       where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
         and u.deleted_at is null
         and lower(u.email) = lower(
               case when r.master_table = 'startups'
                    then (select nullif(s.contact ->> 'email', '') from public.startups s where s.id = r.master_id)
                    else (select nullif(n.email, '') from public.networks n where n.id = r.master_id)
               end)
    ) into v_had;

    -- 계정 확보. 원장에 값이 모자라면 여기서 사유와 함께 멈춘다.
    v_account := public.issue_guest_account(r.master_table, r.master_id);

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
