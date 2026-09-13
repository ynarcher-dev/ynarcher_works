-- =====================================================================
-- GUEST 계정 엄격 일괄 생성 — public.create_guest_accounts(p_rows jsonb)
--
-- 목록 붙여넣기 한 번으로 여러 GUEST 계정을 만드는 서버 경로다. 단건 경로
-- (create_guest_account / issue_guest_account)와 **의도적으로 다른 규칙**을 가진다.
--
--   · 단건 경로는 멱등이다 — 같은 이메일·같은 이름이면 기존 계정을 돌려준다.
--   · 이 경로는 엄격하다 — 이미 쓰이는 이메일·연락처는 **행 실패**이며 기존 계정을
--     조용히 돌려주지 않는다. 일괄 입력에서 "만들었습니다"가 실제로는 남의 계정
--     재사용이면 담당자가 그 사실을 알 방법이 없기 때문이다.
--
-- 그래서 단건 함수 본문을 재사용하지 않는다(그 함수의 계약이 멱등 반환이다).
--
-- 결과 계약(반환 jsonb):
--   { "total": n, "created": n, "failed": n,
--     "rows": [ { "index": 0,                       -- 입력 배열의 0-기반 위치(항상 고정)
--                 "key": "<입력 key 또는 null>",     -- 호출자가 준 식별자를 그대로 되돌린다
--                 "status": "CREATED" | "FAILED",
--                 "user_id": uuid | null,
--                 "user_type": "temporary_guest" | "external_startup" | "external_expert" | null,
--                 "master_table": text | null, "master_id": text | null,
--                 "errors": [ { "field": "...", "code": "...", "message": "..." } ] } ] }
--
--   행 단위로 독립이다 — 유효한 행은 다른 행이 실패해도 커밋된다(부분 성공).
--
-- 실패 사유(code)는 칸(field)과 함께 돌려준다:
--   row          : ROW_NOT_OBJECT
--   name         : NAME_REQUIRED, NAME_TOO_LONG
--   email        : EMAIL_REQUIRED, EMAIL_INVALID, EMAIL_DUPLICATE_IN_BATCH,
--                  EMAIL_TAKEN_INTERNAL, EMAIL_TAKEN_GUEST
--   phone        : PHONE_REQUIRED, PHONE_INVALID, PHONE_DUPLICATE_IN_BATCH, PHONE_TAKEN_GUEST
--   key          : KEY_DUPLICATE_IN_BATCH
--   master_table : MASTER_PAIR_REQUIRED, MASTER_TABLE_UNKNOWN, MASTER_FORBIDDEN
--   master_id    : MASTER_ID_INVALID, MASTER_NOT_FOUND
--   row/email/phone : DB_CONFLICT, DB_ERROR (DB가 막은 경우 — 아래 '동시성' 문단)
--
-- message는 **항상 이 함수가 쓴 고정 문구**다. DB 예외의 원본 메시지는 밖으로 내보내지
-- 않는다 — 인덱스·컬럼 이름과 호출자가 볼 수 없는 계정의 값이 그대로 담기기 때문이며,
-- 진단은 raise log로 서버 로그에만 남긴다. 아는 충돌(이메일·연락처 유일 인덱스)은 원본
-- 문구 없이도 칸별 코드로 갈라 준다.
--
-- 배치 안 중복은 **먼저 온 행을 살리지 않는다.** 같은 이메일(또는 연락처)을 가진 행이
-- 둘 이상이면 그 행 전부가 실패한다 — 어느 쪽이 진짜인지 서버가 고를 근거가 없고,
-- 임의로 첫 행을 살리면 담당자가 오입력을 발견하지 못한 채 계정 하나만 생긴다.
--
-- 동시성: 검사만으로는 두 요청 사이의 틈을 막지 못하므로 마지막 판정은 **이미 있는 유일
-- 인덱스**가 한다. 이 파일은 인덱스를 새로 세우지 않고 그 둘에 기댄다.
--   · 이메일 — public.uq_users_email_live (20260911225000): 활성 users 전체에서 하나.
--   · 연락처 — public.uq_users_guest_phone (20260912141404): 활성 GUEST 계정에서 하나.
-- 함수의 사전 검사는 이 둘과 **같은 범위·같은 식**으로 묻고, 인덱스가 막은 경우에는
-- unique_violation을 받아 그 행만 칸별 사유로 접는다.
--
-- 삭제 정책: 새 DELETE 정책을 만들지 않는다. 이 파일은 계정을 만들기만 한다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md §2) 답변:
--   · 소유 워크스페이스: guest. 원장 연결 판정만 대상 원장(startup/networks/mna)에 위임한다.
--   · 데이터 등급: Personal(이름·이메일·연락처) + 연결 사실은 Restricted(M&A는 기밀).
--   · 접근 주체: 내부 사용자만. 게스트·미인증은 전면 차단(42501).
--   · Scope: 생성은 global(내부 전원, 2026-09-12 사용자 확정), 원장 연결은 그 원장의 읽기 권한.
--   · 감사 로그: 생성 1건마다 audit_logs에 GUEST_ACCOUNT_ISSUE를 남긴다(source=batch).
--     실패 행은 아무것도 만들지 않으므로 적재하지 않는다.
--   · 운영 영향: 새 표·새 인덱스·새 정책이 없다. 기존 단건 경로(create_guest_account /
--     issue_guest_account)의 동작도 그대로 두며, 이 파일은 새 RPC 하나만 더한다.
--   · SECURITY DEFINER 신설: public.create_guest_accounts(jsonb),
--     app.guest_batch_error(text,text,text)는 DEFINER가 아닌 순수 조립 함수이며
--     실행 권한을 아무 앱 롤에도 주지 않는다(DEFINER 소유자 권한으로만 불린다).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- (1) 실패 사유 한 칸을 만드는 내부 조립 함수
--
--     본문에서 jsonb_build_array(jsonb_build_object(...))를 스무 번 되풀이하지 않기
--     위한 것뿐이다. 데이터를 읽지 않으므로 DEFINER가 아니고, 앱 롤에는 열지 않는다.
-- ---------------------------------------------------------------------
create or replace function app.guest_batch_error(
  p_field   text,
  p_code    text,
  p_message text
)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select jsonb_build_array(
    jsonb_build_object('field', p_field, 'code', p_code, 'message', p_message)
  );
$fn$;

revoke all on function app.guest_batch_error(text, text, text)
  from public, anon, authenticated, service_role;

comment on function app.guest_batch_error(text, text, text) is
  '일괄 생성 결과의 실패 사유 한 칸(길이 1 배열). 호출자는 public.create_guest_accounts 하나이며 앱 롤에는 실행 권한을 주지 않는다.';

-- ---------------------------------------------------------------------
-- (2) 엄격 일괄 생성 RPC
--
--     동시성의 마지막 판정은 이미 있는 유일 인덱스 둘이 진다(파일 머리말 참조).
--     인덱스를 새로 세우지 않으며, 아래 사전 검사는 그 둘과 같은 범위·같은 식으로 묻는다.
-- ---------------------------------------------------------------------
create or replace function public.create_guest_accounts(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_max        constant integer := 200;
  v_actor      uuid    := app.current_app_user_id();
  v_parsed     jsonb;
  v_results    jsonb   := '[]'::jsonb;
  v_created    integer := 0;
  v_failed     integer := 0;
  v_iter       record;
  v_row        jsonb;
  v_errors     jsonb;
  v_idx        integer;
  v_key        text;
  v_name       text;
  v_email      text;
  v_email_key  text;
  v_phone      text;
  v_phone_key  text;
  v_master_tbl text;
  v_master_txt text;
  v_master_id  uuid;
  v_user_type  text;
  v_company    uuid;
  v_new        uuid;
  v_state      text;
  v_msg        text;
  v_constraint text;
begin
  -- 호출 자체의 인가. 화면에서 감추는 것은 인가가 아니므로 여기서 막는다.
  if v_actor is null or app.is_guest() then
    raise exception '내부 사용자만 GUEST 계정을 생성할 수 있습니다.' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '입력은 행 배열(jsonb array)이어야 합니다.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception '생성할 행을 하나 이상 넣어야 합니다.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > v_max then
    raise exception '한 번에 처리할 수 있는 행은 최대 %건입니다.', v_max using errcode = '22023';
  end if;

  -- ① 입력을 한 번만 훑어 정규화하고, 배치 안 중복을 행마다 표시한다.
  --    중복 표시는 창(window)으로 센다 — 같은 키를 가진 행 전부에 같은 답이 붙어야 하며
  --    어느 하나를 승자로 고르지 않는다.
  with raw as (
    select (t.ord - 1)::integer as idx,
           case when jsonb_typeof(t.elem) = 'object' then t.elem else null end as obj
      from jsonb_array_elements(p_rows) with ordinality as t(elem, ord)
  ),
  norm as (
    select r.idx,
           r.obj is not null                                          as is_object,
           nullif(btrim(coalesce(r.obj ->> 'key', '')), '')            as key,
           nullif(btrim(coalesce(r.obj ->> 'name', '')), '')           as name,
           nullif(btrim(coalesce(r.obj ->> 'email', '')), '')          as email,
           nullif(btrim(coalesce(r.obj ->> 'phone', '')), '')          as phone,
           nullif(btrim(coalesce(r.obj ->> 'master_table', '')), '')   as master_table,
           nullif(btrim(coalesce(r.obj ->> 'master_id', '')), '')      as master_id
      from raw r
  ),
  keyed as (
    select n.*,
           app.norm_email(n.email) as email_key,
           app.norm_phone(n.phone) as phone_key
      from norm n
  ),
  flagged as (
    select k.*,
           (k.email_key is not null and count(*) over (partition by k.email_key) > 1) as dup_email,
           (k.phone_key is not null and count(*) over (partition by k.phone_key) > 1) as dup_phone,
           (k.key       is not null and count(*) over (partition by k.key)       > 1) as dup_key
      from keyed k
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'idx',          f.idx,
               'is_object',    f.is_object,
               'key',          f.key,
               'name',         f.name,
               'email',        f.email,
               'email_key',    f.email_key,
               'phone',        f.phone,
               'phone_key',    f.phone_key,
               'master_table', f.master_table,
               'master_id',    f.master_id,
               'dup_email',    f.dup_email,
               'dup_phone',    f.dup_phone,
               'dup_key',      f.dup_key
             ) order by f.idx
           ),
           '[]'::jsonb
         )
    into v_parsed
    from flagged f;

  -- ② 행마다 독립적으로 판정하고 만든다.
  for v_iter in
    select e.elem from jsonb_array_elements(v_parsed) as e(elem)
     order by (e.elem ->> 'idx')::integer
  loop
    v_row        := v_iter.elem;
    v_errors     := '[]'::jsonb;
    v_new        := null;
    v_user_type  := null;
    v_company    := null;
    v_master_id  := null;
    v_idx        := (v_row ->> 'idx')::integer;
    v_key        := v_row ->> 'key';
    v_name       := v_row ->> 'name';
    v_email      := v_row ->> 'email';
    v_email_key  := v_row ->> 'email_key';
    v_phone      := v_row ->> 'phone';
    v_phone_key  := v_row ->> 'phone_key';
    v_master_tbl := v_row ->> 'master_table';
    v_master_txt := v_row ->> 'master_id';

    -- ②-1 입력 자체의 문제. 칸마다 모아서 한 번에 돌려준다(한 칸 고치고 다시 올리는
    --      왕복을 만들지 않는다).
    if not coalesce((v_row ->> 'is_object')::boolean, false) then
      v_errors := v_errors || app.guest_batch_error(
        'row', 'ROW_NOT_OBJECT', '행은 name·email·phone을 가진 객체여야 합니다.');
    else
      if v_name is null then
        v_errors := v_errors || app.guest_batch_error(
          'name', 'NAME_REQUIRED', '이름을 입력해야 합니다.');
      elsif length(v_name) > 100 then
        v_errors := v_errors || app.guest_batch_error(
          'name', 'NAME_TOO_LONG', '이름은 100자를 넘을 수 없습니다.');
      end if;

      if v_email is null then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_REQUIRED', '이메일을 입력해야 합니다(이메일이 로그인 ID입니다).');
      -- 형식 검사는 admin_update_guest_contact(20260913130000)와 같은 식을 쓴다 —
      -- 같은 계정 원장의 같은 칸이므로 창구마다 다른 기준을 두지 않는다.
      elsif length(v_email) > 254
         or v_email_key !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_INVALID', '이메일 형식이 올바르지 않습니다.');
      elsif coalesce((v_row ->> 'dup_email')::boolean, false) then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_DUPLICATE_IN_BATCH',
          '같은 이메일이 입력 안에 두 번 이상 있습니다. 해당 행 전부를 만들지 않습니다.');
      end if;

      if v_phone is null then
        v_errors := v_errors || app.guest_batch_error(
          'phone', 'PHONE_REQUIRED', '연락처를 입력해야 합니다(연락처가 초기 비밀번호입니다).');
      elsif v_phone_key is null or length(v_phone_key) < 9 or length(v_phone_key) > 15 then
        v_errors := v_errors || app.guest_batch_error(
          'phone', 'PHONE_INVALID', '연락처는 숫자 9~15자리여야 합니다.');
      elsif coalesce((v_row ->> 'dup_phone')::boolean, false) then
        v_errors := v_errors || app.guest_batch_error(
          'phone', 'PHONE_DUPLICATE_IN_BATCH',
          '같은 연락처가 입력 안에 두 번 이상 있습니다. 해당 행 전부를 만들지 않습니다.');
      end if;

      -- 호출자 식별자가 겹치면 결과를 입력 행에 되짚을 수 없다. index는 항상 고유하므로
      -- 결과 자체는 쓸 수 있지만, key로 짝을 맞추는 화면이 잘못 붙이는 것을 막는다.
      if coalesce((v_row ->> 'dup_key')::boolean, false) then
        v_errors := v_errors || app.guest_batch_error(
          'key', 'KEY_DUPLICATE_IN_BATCH', '같은 key가 입력 안에 두 번 이상 있습니다.');
      end if;

      if (v_master_tbl is null) <> (v_master_txt is null) then
        v_errors := v_errors || app.guest_batch_error(
          'master_table', 'MASTER_PAIR_REQUIRED',
          '원장을 연결하려면 master_table과 master_id를 함께 지정해야 합니다.');
      elsif v_master_tbl is not null then
        if v_master_tbl not in ('startups', 'networks', 'ma_sellers', 'ma_buyers') then
          v_errors := v_errors || app.guest_batch_error(
            'master_table', 'MASTER_TABLE_UNKNOWN', '지원하지 않는 원장입니다.');
        elsif v_master_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_errors := v_errors || app.guest_batch_error(
            'master_id', 'MASTER_ID_INVALID', 'master_id가 uuid 형식이 아닙니다.');
        end if;
      end if;
    end if;

    -- ②-2 DB가 답해야 하는 문제 + 삽입. 한 행의 실패가 다른 행을 되돌리지 않도록
    --      행마다 예외 블록(=savepoint)을 둔다.
    if v_errors = '[]'::jsonb then
      begin
        if v_master_tbl is not null then
          v_master_id := v_master_txt::uuid;

          -- 원장 연결은 **그 원장 행을 읽을 수 있는 사람만** 한다. M&A는 존재 자체가
          -- 기밀이라 '없음'과 '권한 없음'을 갈라 답하지 않는다(can_read_ma_party가 둘을
          -- 같은 false로 돌려준다 — 여기서 되살리면 이메일만으로 매각 검토를 알 수 있다).
          if not app.can_read_master_table(v_master_tbl)
             or (v_master_tbl = 'ma_sellers' and not app.can_read_ma_party('ma_seller', v_master_id))
             or (v_master_tbl = 'ma_buyers'  and not app.can_read_ma_party('ma_buyer',  v_master_id)) then
            v_errors := v_errors || app.guest_batch_error(
              'master_table', 'MASTER_FORBIDDEN', '이 원장 대상에 계정을 연결할 권한이 없습니다.');

          -- 흡수된 행(merged_into_id)은 고를 수 없다 — 화면의 원장 선택창과 같은 기준이며,
          -- 인격을 비켜 간 행에 붙이면 그 계정이 어느 정본에 속하는지 답할 수 없다.
          -- can_read_ma_party는 살아 있는지만 보고 병합은 보지 않으므로 M&A도 여기서
          -- 따로 확인한다. **권한 판정 뒤에 오는 순서**라 못 읽는 사람에게는 여전히
          -- FORBIDDEN 하나만 가고 병합 여부도 새지 않는다.
          elsif v_master_tbl = 'startups' and not exists (
            select 1 from public.startups s
             where s.id = v_master_id and s.deleted_at is null and s.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          elsif v_master_tbl = 'networks' and not exists (
            select 1 from public.networks n
             where n.id = v_master_id and n.deleted_at is null and n.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          elsif v_master_tbl = 'ma_sellers' and not exists (
            select 1 from public.ma_sellers x
             where x.id = v_master_id and x.deleted_at is null and x.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          elsif v_master_tbl = 'ma_buyers' and not exists (
            select 1 from public.ma_buyers x
             where x.id = v_master_id and x.deleted_at is null and x.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          end if;

          -- 유형을 늘리지 않는다 — 무엇인지는 guest_identities.master_table이 답한다
          -- (2026-09-08 확정). company_id는 startups(id) FK라 그 인격만 채운다.
          if v_master_tbl = 'networks' then
            v_user_type := 'external_expert';
          else
            v_user_type := 'external_startup';
          end if;
          if v_master_tbl = 'startups' then
            v_company := v_master_id;
          end if;
        else
          v_user_type := 'temporary_guest';
        end if;

        -- 이메일은 활성 계정 전체에서 하나다. **정지 계정도 자리를 지킨다**(is_active를
        -- 보지 않는다) — 정지는 잠시 막은 상태이고 계정은 살아 있다. 재운 계정(deleted_at)
        -- 만 자리를 비켜 주며, 이 기준이 uq_users_email_live와 같다. 식도 같은 모양으로
        -- 적어 그 인덱스를 탄다.
        if v_errors = '[]'::jsonb then
          if exists (
            select 1 from public.users u
             where u.deleted_at is null
               and lower(btrim(u.email)) = v_email_key
               and not app.is_guest_user_type(u.user_type)
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_INTERNAL',
              '이 이메일은 내부 임직원 계정입니다. GUEST 계정은 다른 주소로 만드십시오.');
          elsif exists (
            select 1 from public.users u
             where u.deleted_at is null
               and lower(btrim(u.email)) = v_email_key
               and app.is_guest_user_type(u.user_type)
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_GUEST',
              '이 이메일을 쓰는 GUEST 계정이 이미 있습니다(정지된 계정도 포함). 기존 계정을 이 경로로 재사용하지 않습니다.');
          end if;

          if exists (
            select 1 from public.users u
             where u.deleted_at is null
               and app.is_guest_user_type(u.user_type)
               and app.norm_phone(u.phone) = v_phone_key
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'phone', 'PHONE_TAKEN_GUEST',
              '이 연락처를 쓰는 GUEST 계정이 이미 있습니다(정지된 계정도 포함). 연락처가 초기 비밀번호이므로 나눠 쓸 수 없습니다.');
          end if;
        end if;

        if v_errors = '[]'::jsonb then
          insert into public.users (user_type, name, email, phone, company_id)
          values (v_user_type::public.user_type, v_name, v_email, v_phone, v_company)
          returning id into v_new;

          insert into public.workspace_permissions
            (user_id, workspace_key, permission_level, scope_type, scope_id)
          values (v_new, 'guest', 'write', 'self', null);

          -- 자격증명 자리를 비워 둔 채 함께 만든다. 행이 없으면 로그인 경로가
          -- "초기 상태"와 "계정 없음"을 구분하지 못한다.
          insert into public.guest_credentials (user_id) values (v_new);

          if v_master_tbl is not null then
            insert into public.guest_identities (master_table, master_id, user_id, created_by)
            values (v_master_tbl, v_master_id, v_new, v_actor);
          end if;

          perform app.log_guest_access(
            v_new,
            'GUEST_ACCOUNT_ISSUE',
            'guest:account',
            jsonb_build_object(
              'person_source', 'manual',
              'source',        'batch',
              'batch_index',   v_idx,
              'batch_key',     v_key,
              'master_table',  v_master_tbl,
              'master_id',     v_master_id
            ),
            null
          );
        end if;
      exception
        -- 인가 실패는 행 사유로 접지 않는다 — 전체 호출이 멈춰야 하는 사실이다.
        when insufficient_privilege then
          raise;
        when unique_violation then
          get stacked diagnostics
            v_constraint = constraint_name,
            v_msg        = message_text;
          v_new := null;
          -- 사전 검사를 통과한 뒤에도 인덱스가 막았다면 같은 키를 다른 요청이 방금 만든
          -- 것이다(검사와 삽입 사이의 틈). 어느 인덱스가 막았는지는 constraint_name이
          -- 답하고, 그 값이 비는 드문 경우에는 메시지 문구로 되짚는다.
          if coalesce(v_constraint, '') = 'uq_users_email_live'
             or position('uq_users_email_live' in coalesce(v_msg, '')) > 0 then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_GUEST', '방금 다른 요청이 이 이메일로 계정을 만들었습니다.');
          elsif coalesce(v_constraint, '') = 'uq_users_guest_phone'
             or position('uq_users_guest_phone' in coalesce(v_msg, '')) > 0 then
            v_errors := v_errors || app.guest_batch_error(
              'phone', 'PHONE_TAKEN_GUEST', '방금 다른 요청이 이 연락처로 계정을 만들었습니다.');
          else
            -- 어느 값이 부딪혔는지 모르는 중복은 **문구를 그대로 돌려주지 않는다.**
            -- 원본 메시지에는 인덱스·컬럼 이름과 호출자가 볼 수 없는 계정의 값이
            -- 그대로 담긴다(숨은 계정의 존재를 되짚는 통로가 된다). 진단은 서버
            -- 로그로만 남기고 화면에는 담당자가 할 수 있는 일만 말한다.
            raise log 'create_guest_accounts 중복 거부: index=% constraint=% message=%',
              v_idx, v_constraint, v_msg;
            v_errors := v_errors || app.guest_batch_error(
              'row', 'DB_CONFLICT',
              '이미 있는 값과 부딪혀 만들지 못했습니다. 입력을 확인한 뒤 다시 시도하십시오.');
          end if;
        when others then
          get stacked diagnostics
            v_state = returned_sqlstate,
            v_msg   = message_text;
          v_new := null;
          -- 같은 이유로 원본 메시지·SQLSTATE를 밖으로 내보내지 않는다.
          raise log 'create_guest_accounts 행 실패: index=% sqlstate=% message=%',
            v_idx, v_state, v_msg;
          v_errors := v_errors || app.guest_batch_error(
            'row', 'DB_ERROR', '이 행을 만들지 못했습니다. 담당자에게 문의하십시오.');
      end;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'index',        v_idx,
        'key',          v_key,
        'status',       (case when v_new is not null then 'CREATED' else 'FAILED' end)::text,
        'user_id',      v_new,
        'user_type',    case when v_new is not null then v_user_type end,
        'master_table', v_master_tbl,
        'master_id',    v_master_txt,
        'errors',       v_errors
      )
    );

    if v_new is not null then
      v_created := v_created + 1;
    else
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total',   jsonb_array_length(p_rows),
    'created', v_created,
    'failed',  v_failed,
    'rows',    v_results
  );
end;
$fn$;

revoke all on function public.create_guest_accounts(jsonb)
  from public, anon, service_role;
grant execute on function public.create_guest_accounts(jsonb)
  to authenticated;

comment on function public.create_guest_accounts(jsonb) is
  'GUEST 계정 엄격 일괄 생성. 내부 사용자만 호출하며, 행마다 독립적으로 만들고 이미 쓰이는 이메일·연락처(정지 계정 포함)는 기존 계정을 재사용하지 않고 그 행만 실패시킨다. 배치 안 중복은 관련 행 전부를 실패시킨다. 원장 연결은 그 원장을 읽을 수 있는 사람만 할 수 있고 M&A는 존재를 답하지 않는다. 결과는 입력 index/key·status·user_id·칸별 사유를 담은 jsonb.';

commit;
