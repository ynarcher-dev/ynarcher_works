-- =====================================================================
-- [MANAGEMENT] 거래처 원장 — 코드·상호·구분·등록번호·계좌·증빙 서류를 한 행에 담는다
--
-- 기획: docs/docs_planning/3_7_4_management_partners.md
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=management(재무 축) / 등급=Restricted(계좌) + Personal(개인 거래처의
--   생년월일·신분증 사본) / 접근=management 읽기·쓰기 권한자(외부 게스트 전면 차단)
--   Scope=global / 신규 테이블 1종 + Storage 버킷 1종.
--   - 생성 즉시 RLS 활성화, SELECT/INSERT/UPDATE 정책 분리. DELETE 정책 없음(soft delete).
--   - 권한 판정은 app.can_read_workspace/can_write_workspace 헬퍼만 경유한다.
--   - SECURITY DEFINER 트리거 함수 2종은 search_path 고정. 사용자 권한을 넓히지 않는다
--     (서버가 정하는 값을 채우고 고정할 뿐이라 함수 내부 권한 검사가 필요한 경로가 아니다 —
--      행을 넣을 수 있는지는 INSERT 정책이 이미 판정한 뒤에 트리거가 돈다).
--   - 감사 로그: 서류(사업자등록증·신분증·통장사본) 열람은 기존 log_sensitive_access RPC로
--     access_logs에 적재한다(화면이 서명 URL을 받기 전에 호출하고, 실패하면 열지 않는다).
--     잔여 위험은 아래 §5에 적는다.
--
-- 왜 새 원장인가:
--   `public.vendors`(NETWORKS 외주/거래 마스터)는 "누구와 일하는가"를 담는 네트워크 원장이라
--   계좌·증빙이 없고 판정 키도 networks다. 여기서 필요한 것은 "누구에게 얼마를 어느 계좌로
--   지급하는가"이며 접근 주체가 경영지원 한 무리로 좁다. 같은 표에 계좌·신분증 사본을 얹으면
--   networks 읽기 권한자 전원에게 그 값이 열린다 — 이름이 비슷하다고 합치지 않는다.
--
-- 담당자 원장을 두지 않는다:
--   행마다 담당을 나누는 원장이 아니라 경영지원이 함께 보는 한 벌이므로, 3축 규칙(담당자 원장에
--   행이 있으면 그 사람들, 비어 있으면 공동관리)의 후자 — management 쓰기 권한자 공동관리다.
-- =====================================================================

-- 1) 원장 --------------------------------------------------------------------
-- 거래처 코드는 두 조각(접두어 2글자 + 일련번호 5자리)으로 저장하고 표시값은 생성 열이 만든다.
-- 한 칸에 문자열로 담으면 "같은 접두어의 다음 번호"를 셀 때마다 문자열을 잘라야 하고, 잘라 센
-- 값은 정렬도 사전순이라 99999 다음이 무엇인지 원장이 답하지 못한다.
create table if not exists public.trade_partners (
  id              uuid primary key default gen_random_uuid(),
  code_prefix     text not null,
  code_seq        integer not null,
  code            text generated always as (code_prefix || lpad(code_seq::text, 5, '0')) stored,
  name            text not null,
  partner_type    text not null,
  -- 법인은 사업자등록번호 10자리, 개인은 생년월일 8자리. 숫자만 담고 하이픈은 화면이 붙인다
  -- (표기를 저장하면 '123-45-67890'과 '1234567890'이 다른 값이 되어 중복을 셀 수 없다).
  registration_no text,
  -- 금융기관 코드 3자리(표준값). 은행 이름을 담지 않는 이유는 이름이 바뀌기 때문이다
  -- (KEB하나은행 → 하나은행). 이름표는 화면(partners/config.ts)이 갖는다.
  bank_code       text,
  account_no      text,
  account_holder  text,
  -- 증빙 서류 2종. 각각 오브젝트 키 + 표시용 원본 파일명 한 쌍이다(파일명을 키에서 되짚지
  -- 않는다 — 한글 파일명은 키로 안전화하는 순간 되돌릴 수 없다).
  license_path    text,
  license_name    text,
  bankbook_path   text,
  bankbook_name   text,
  -- 거래 중단(is_active)과 오등록 정리(deleted_at)는 다른 축이다. 자산 원장과 같은 규칙 —
  -- 거래가 끝난 거래처는 목록에 남아 과거 지급 내역을 설명해야 한다.
  is_active       boolean not null default true,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint trade_partners_code_prefix_chk check (code_prefix ~ '^[A-Z]{2}$'),
  constraint trade_partners_code_seq_chk    check (code_seq between 1 and 99999),
  constraint trade_partners_name_chk        check (btrim(name) <> ''),
  constraint trade_partners_type_chk        check (partner_type in ('CORPORATE', 'INDIVIDUAL')),
  -- 등록번호의 자릿수는 구분이 정한다. 구분을 바꾸면서 번호를 그대로 두면 여기서 걸린다
  -- (법인 10자리를 단 채 개인으로 옮긴 행은 생년월일 칸에 사업자번호가 든 행이 된다).
  constraint trade_partners_registration_no_chk check (
    registration_no is null
    or (partner_type = 'CORPORATE'  and registration_no ~ '^[0-9]{10}$')
    or (partner_type = 'INDIVIDUAL' and registration_no ~ '^[0-9]{8}$')
  ),
  constraint trade_partners_bank_code_chk check (bank_code is null or bank_code ~ '^[0-9]{3}$'),
  constraint trade_partners_account_no_chk
    check (account_no is null or account_no ~ '^[0-9][0-9-]{4,29}$'),
  -- 계좌 세 값은 함께 있거나 함께 없다. 은행만 적힌 행은 이체에 쓸 수 없으므로 "계좌를 아직
  -- 모른다"와 구분되지 않는다 — 반쯤 적힌 계좌는 없는 계좌보다 나쁘다(있다고 착각하게 한다).
  constraint trade_partners_account_set_chk check (
    (bank_code is null and account_no is null and account_holder is null)
    or (
      bank_code is not null
      and account_no is not null
      and btrim(coalesce(account_holder, '')) <> ''
    )
  ),
  -- 서류는 키와 파일명이 한 쌍이다. 한쪽만 남으면 목록에 이름 없는 파일이나 열 수 없는 이름이 뜬다.
  constraint trade_partners_license_pair_chk  check ((license_path is null) = (license_name is null)),
  constraint trade_partners_bankbook_pair_chk check ((bankbook_path is null) = (bankbook_name is null))
);

comment on table public.trade_partners is
  'MANAGEMENT 거래처 원장(코드·상호·구분·등록번호·계좌·증빙). 지급 상대의 단일 원천이며 NETWORKS vendors(외주 네트워크 마스터)와는 다른 축이다.';
comment on column public.trade_partners.code is
  '표시용 거래처 코드(접두어 2글자 + 일련번호 5자리). 생성 열이라 직접 쓰지 않는다.';
comment on column public.trade_partners.registration_no is
  '법인=사업자등록번호 10자리, 개인=생년월일 8자리. 숫자만 저장하고 표기는 화면이 만든다.';
comment on column public.trade_partners.bank_code is
  '금융기관 코드 3자리(표준값). 은행 이름표는 apps/works/src/features/management/partners/config.ts가 갖는다.';
comment on column public.trade_partners.license_path is
  'partner-docs 버킷의 오브젝트 키(법인=사업자등록증, 개인=신분증). 교체·삭제 시 키만 갈고 오브젝트는 보존한다.';
comment on column public.trade_partners.is_active is
  '거래 사용 여부. 오등록 정리(deleted_at)와 다른 축이며, 중단해도 과거 지급 내역을 설명할 수 있게 목록에 남는다.';

-- 코드는 원장 전체에서 유일하다. 비활성·삭제 행도 코드를 계속 점유한다 — 한 번 쓴 번호를
-- 다시 내주면 옛 전표가 가리키는 거래처가 어느 날 다른 회사가 된다.
create unique index if not exists trade_partners_code_uniq
  on public.trade_partners (code);

create index if not exists trade_partners_name_idx
  on public.trade_partners (name)
  where deleted_at is null;

-- 같은 번호를 가진 거래처를 찾는 조회(등록 시 중복 확인)용.
create index if not exists trade_partners_registration_no_idx
  on public.trade_partners (registration_no)
  where deleted_at is null and registration_no is not null;

-- 2) 트리거 ------------------------------------------------------------------
drop trigger if exists trg_trade_partners_updated_at on public.trade_partners;
create trigger trg_trade_partners_updated_at
  before update on public.trade_partners
  for each row execute function app.set_updated_at();

-- 코드 채번 + 생성자 스탬프. 둘 다 "서버가 정하는 값"이라 한 트리거에 둔다.
--
-- 다음 번호를 세는 동안 접두어 단위로 잠근다. 잠그지 않으면 두 사람이 동시에 등록할 때 같은
-- 번호를 읽어 한쪽이 유니크 위반으로 튕기고, 사용자에게는 저장 실패로만 보인다.
-- 세는 대상에서 비활성·삭제 행을 빼지 않는다(위 유니크 인덱스와 같은 이유 — 번호는 재사용하지 않는다).
create or replace function app.stamp_trade_partner_insert()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  NEW.code_prefix := upper(btrim(coalesce(NEW.code_prefix, '')));
  if NEW.code_prefix !~ '^[A-Z]{2}$' then
    raise exception '거래처 코드 접두어는 영문 2글자입니다.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('trade_partner_code:' || NEW.code_prefix));

  select coalesce(max(p.code_seq), 0) + 1
    into NEW.code_seq
    from public.trade_partners p
   where p.code_prefix = NEW.code_prefix;

  if NEW.code_seq > 99999 then
    raise exception '접두어 %의 코드가 모두 소진되었습니다. 다른 접두어를 쓰세요.', NEW.code_prefix
      using errcode = '23514';
  end if;

  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_trade_partners_stamp on public.trade_partners;
create trigger trg_trade_partners_stamp
  before insert on public.trade_partners
  for each row execute function app.stamp_trade_partner_insert();

-- 코드는 발급 후 바뀌지 않는다. 전표·정산이 이 값으로 거래처를 가리키므로, 고치면 과거 기록이
-- 가리키던 상대가 조용히 달라진다. 말없이 되돌리지 않고 막는다 — 화면은 애초에 보내지 않으므로
-- 여기 걸리는 것은 화면 밖 경로뿐이고, 그때는 무엇이 거부됐는지 드러나야 한다.
create or replace function app.freeze_trade_partner_code()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.code_prefix is distinct from OLD.code_prefix
     or NEW.code_seq is distinct from OLD.code_seq then
    raise exception '거래처 코드는 변경할 수 없습니다.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_trade_partners_freeze_code on public.trade_partners;
create trigger trg_trade_partners_freeze_code
  before update on public.trade_partners
  for each row execute function app.freeze_trade_partner_code();

-- 3) RLS ---------------------------------------------------------------------
alter table public.trade_partners enable row level security;

-- 조회를 내부 사용자 전체로 열지 않는다. 계좌번호와 개인 거래처의 생년월일이 한 행에 있어,
-- 지금 이 원장을 읽을 이유가 있는 사람은 지급을 준비하는 경영지원뿐이다.
-- OFFICE 전사 조회 목록은 노출 범위를 따로 정한 뒤(마스킹 포함) 그때 넓힌다.
drop policy if exists trade_partners_select on public.trade_partners;
create policy trade_partners_select on public.trade_partners for select
  using (app.can_read_workspace('management'));

drop policy if exists trade_partners_insert on public.trade_partners;
create policy trade_partners_insert on public.trade_partners for insert
  with check (app.can_write_workspace('management'));

drop policy if exists trade_partners_update on public.trade_partners;
create policy trade_partners_update on public.trade_partners for update
  using (app.can_write_workspace('management'))
  with check (app.can_write_workspace('management'));

-- DELETE 정책 없음(soft delete: deleted_at).

-- 4) Storage — 거래처 증빙 서류(비공개) ---------------------------------------
insert into storage.buckets (id, name, public)
values ('partner-docs', 'partner-docs', false)
on conflict (id) do nothing;

-- 원장과 같은 게이트를 쓴다. 원장은 못 보는데 통장사본은 열리는(또는 그 반대) 상태를 만들지 않는다.
drop policy if exists partner_doc_objects_select on storage.objects;
create policy partner_doc_objects_select on storage.objects for select
  using (bucket_id = 'partner-docs' and app.can_read_workspace('management'));

drop policy if exists partner_doc_objects_insert on storage.objects;
create policy partner_doc_objects_insert on storage.objects for insert
  with check (bucket_id = 'partner-docs' and app.can_write_workspace('management'));

drop policy if exists partner_doc_objects_update on storage.objects;
create policy partner_doc_objects_update on storage.objects for update
  using (bucket_id = 'partner-docs' and app.can_write_workspace('management'))
  with check (bucket_id = 'partner-docs' and app.can_write_workspace('management'));

-- 5) 잔여 위험(다음 사람을 위해 적어 둔다) ------------------------------------
-- 서류 열람은 화면이 log_sensitive_access RPC로 access_logs를 남긴 뒤에만 서명 URL을 만든다.
-- 다만 서명 자체는 클라이언트가 하므로(위 SELECT 정책), 화면을 거치지 않고 직접 서명하면
-- 로그 없이 파일을 열 수 있다. 자료(attachments)처럼 완전히 막으려면 SELECT 정책을 걷고
-- material-download 식 Edge Function을 하나 더 세워야 한다 — 접근 주체가 management
-- 권한자로 이미 좁아 지금은 여기까지로 두되, 이 원장을 OFFICE 전사 목록으로 넓히는 날에는
-- 그 작업이 선행 조건이다.
