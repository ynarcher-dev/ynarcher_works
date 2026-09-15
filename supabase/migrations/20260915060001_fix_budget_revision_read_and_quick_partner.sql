-- 예산 변경 이력은 클라이언트가 쓰지 않지만, 원 품의를 읽을 수 있는 사용자는
-- RLS 정책을 통과해 그 변경 이력도 읽어야 한다. ACL 전수 정리에서 SELECT까지
-- 회수되어 PostgREST가 정책 평가 전에 42501(HTTP 403)로 멈추던 드리프트를 바로잡는다.
do $$
begin
  if not exists (
    select 1
      from pg_class c
     where c.oid = 'public.approval_budget_revisions'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'approval_budget_revisions must have RLS enabled before granting SELECT';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'approval_budget_revisions'
       and cmd = 'SELECT'
  ) then
    raise exception 'approval_budget_revisions needs a SELECT policy before granting SELECT';
  end if;
end;
$$;

revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.approval_budget_revisions from authenticated;
grant select on table public.approval_budget_revisions to authenticated;

-- trade_partners.code_prefix는 20260903220000에서 제거되고 code는 YN- 고정 생성 열로
-- 바뀌었다. 즉석 등록 RPC만 옛 열을 계속 INSERT해 모든 호출이 42703(HTTP 400)으로
-- 실패했으므로, 현재 표 계약(code_seq는 BEFORE INSERT 트리거가 다시 채움)에 맞춘다.
create or replace function public.register_trade_partner_quick(
  p_name            text,
  p_partner_type    text,
  p_registration_no text,
  p_bank_code       text,
  p_account_no      text,
  p_account_holder  text
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid uuid := app.current_app_user_id();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not app.is_internal_user() then
    raise exception 'internal users only' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception '거래처명을 입력하세요.' using errcode = '22023';
  end if;

  insert into public.trade_partners
    (code_seq, name, partner_type, registration_no,
     bank_code, account_no, account_holder, is_active)
  values (1, btrim(p_name), coalesce(nullif(btrim(p_partner_type), ''), 'CORPORATE'),
          nullif(btrim(coalesce(p_registration_no, '')), ''),
          nullif(btrim(coalesce(p_bank_code, '')), ''),
          nullif(btrim(coalesce(p_account_no, '')), ''),
          nullif(btrim(coalesce(p_account_holder, '')), ''),
          true)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_trade_partner_quick(text, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.register_trade_partner_quick(text, text, text, text, text, text)
  to authenticated;
