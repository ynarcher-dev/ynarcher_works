-- =====================================================================
-- 모듈 링크 공유 — 로그인 없이 모듈 하나만 여는 단독 주소
--
-- 왜 별도 축인가
--   공유 범위(visibility)가 답하는 것은 '로그인한 사람 중 누가 보는가'이고, 이 축이 답하는
--   것은 '로그인 없는 바깥에 문을 여는가'다. 두 축은 서로를 전제하지 않는다 — 모집을 여는
--   시점에는 참가자 명부가 비어 있어 GUEST에 보여 줄 대상 자체가 없으므로
--   INTERNAL_ONLY + 링크 켜짐이 정상 운영 조합이다. 한 셀렉트에 묶으면 이 조합을
--   표현할 수 없고, 실제로 그래서 구 PUBLIC 값이 동작 없는 이름으로 남았다(20260902120000).
--
-- 무엇을 세우는가
--   (1) app.ws_module_row() — 사업 3종의 모듈 원장을 한 창구로 읽는 헬퍼(INVOKER: RLS 유지)
--   (2) app.module_public_linkable() — 링크를 켤 수 있는 템플릿 판정(DB가 최종 강제)
--   (3) public.program_module_public_links — 링크 원장(모듈 1:1)
--   (4) set_module_public_link / rotate_module_public_link — 쓰기 RPC(둘 다 INVOKER)
--
-- 왜 다형(entity_key) 한 테이블인가
--   모듈 원장이 워크스페이스별로 물리 분리(program_modules / ma_program_modules /
--   project_program_modules)되어 있으므로 FK를 걸 수 없다. 그럼에도 테이블을 셋으로 나누지
--   않는 이유는 **익명 해석 경로가 토큰 하나로 시작하기 때문**이다 — 세 테이블이면 공개
--   함수가 토큰을 세 번 찾아야 하고, 그중 하나를 빠뜨리는 날 조용히 닫히거나 조용히 열린다.
--   토큰은 전역 유니크여야 하며, 그 유니크 인덱스가 한 곳에 있어야 그 약속이 강제된다.
--   대신 다형 키는 원장별로 분리한다(program / ma_program / project_program) — 값을 공유하면
--   RLS가 소유 워크스페이스를 판정할 수 없다(CLAUDE.md 사업 공용 모듈 규칙).
--
-- FK가 없는 대가는 '고아 링크'다. 이는 실패 방향이 안전하다 — 링크가 가리키는 모듈이 없으면
-- 공개 해석이 비어 즉시 닫힌다(fail closed). 조용히 열리는 경로가 아니다.
--
-- 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §7.2, §9, §10
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac / mna / project (행마다 entity_key가 답한다). 데이터 등급 Internal
--     (링크 메타 자체에 개인정보가 없다 — 무엇이 열리는지는 모듈 본문이 정하며 그 판정은
--     공개 Edge Function이 한다).
--   · 접근 주체: 내부 사용자(설정·조회)만. **익명 정책을 만들지 않는다** — 외부 열람은 전량
--     Edge Function이 service_role로 중개한다. 정책 표현식이 곧 공개 범위가 되면 조인 한 줄이
--     늘 때마다 노출면이 조용히 넓어지고, 그것이 모집(20260716170000)이 익명 정책을 두지 않은
--     이유이기도 하다. 같은 방식을 그대로 따른다.
--   · Scope: program → module. 링크 원장의 정책은 스스로 사업 접근을 판정하지 않고
--     **모듈이 보이는가**로 위임한다(app.ws_module_row가 INVOKER라 모듈 RLS가 그대로 걸린다)
--     — 판정을 복제하면 모듈 정책을 고치는 날 링크 정책만 옛 규칙으로 남는다.
--   · RLS: 생성 즉시 활성화. SELECT / INSERT / UPDATE 정책 분리. **DELETE 정책 없음**
--     (링크를 내리는 것은 status 변경이고, 모듈이 사라지면 고아가 되어 자동으로 닫힌다).
--   · SECURITY DEFINER 신규 없음. RPC 2종은 모두 SECURITY INVOKER다 — DEFINER로 만들면
--     각 원장의 RLS를 우회하게 되어 정책을 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이
--     된다(CLAUDE.md 기여 로그 RPC와 같은 근거). 쓰기 허용 여부는 아래 정책이 최종 판정한다.
--   · GRANT EXECUTE는 authenticated 한정. 테이블 권한은 anon에서 전량 회수한다.
--   · 감사 로그: 링크 메타 변경은 개인정보 조회·다운로드·권한 변경이 아니라 대상 밖이다.
--     파일 다운로드는 공개 함수가 기존 access_logs 경로를 그대로 쓴다(별건, 함수 배포 시).
--   · 물리 삭제 없음. 시드·더미 데이터 없음.
-- 근거: 20260721130000_program_entity_key_split.sql(entity_key_workspace),
--       20260720130000_ws_program_scope_helper.sql, 20260716170000_recruitment_form_customization.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 사업 3종 모듈 원장의 단일 읽기 창구
--     SECURITY INVOKER(기본)로 둔다 — 호출자의 모듈 RLS를 그대로 태워야
--     "모듈이 보이면 링크도 만질 수 있다"는 위임이 성립한다.
-- ---------------------------------------------------------------------
create or replace function app.ws_module_row(p_entity_key text, p_module_id uuid)
returns table (program_id uuid, module_type text, enabled boolean, status text)
language sql
stable
set search_path = app, public
as $$
  select m.program_id, m.module_type::text, m.enabled, m.status::text
    from public.program_modules m
   where p_entity_key = 'program' and m.id = p_module_id
  union all
  select m.program_id, m.module_type::text, m.enabled, m.status::text
    from public.ma_program_modules m
   where p_entity_key = 'ma_program' and m.id = p_module_id
  union all
  select m.program_id, m.module_type::text, m.enabled, m.status::text
    from public.project_program_modules m
   where p_entity_key = 'project_program' and m.id = p_module_id;
$$;

grant execute on function app.ws_module_row(text, uuid) to authenticated;

comment on function app.ws_module_row(text, uuid) is
  '다형 키로 사업 3종 모듈 원장 1행을 읽는 단일 창구. SECURITY INVOKER이므로 각 원장의 RLS가 그대로 적용된다.';

-- ---------------------------------------------------------------------
-- (2) 링크를 켤 수 있는 템플릿
--     기준은 '이 화면이 보는 사람이 누구인지 알아야 성립하는가'다.
--     모집은 신원을 신청자가 폼에 적어 스스로 밝히므로 미리 확인할 이유가 없고,
--     글쓰기·URL첨부·파일첨부는 누가 읽든 같은 화면이라 물을 대상이 없다.
--     평가·멘토링·매칭·OT는 채점·예약·출석이 특정 사람에 매여 불가하다.
-- ---------------------------------------------------------------------
create or replace function app.module_public_linkable(p_module_type text)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select p_module_type in ('RECRUITMENT', 'POST', 'LINK', 'FILE');
$$;

grant execute on function app.module_public_linkable(text) to authenticated;

comment on function app.module_public_linkable(text) is
  '링크 공유를 켤 수 있는 모듈 템플릿 판정(모집·글쓰기·URL첨부·파일첨부). 화면의 MODULE_META와 같은 목록을 DB가 최종 강제한다.';

-- ---------------------------------------------------------------------
-- (3) 링크 원장
-- ---------------------------------------------------------------------
create table if not exists public.program_module_public_links (
  id                uuid primary key default gen_random_uuid(),
  -- 소유 원장(program / ma_program / project_program). RLS가 워크스페이스를 판정하는 근거.
  entity_key        text not null,
  program_module_id uuid not null,
  -- 추측 불가능한 랜덤. 최초 1회 발급 후 고정하며 교체는 명시적 재발급뿐이다.
  token             text not null,
  -- 공개 상태: PRIVATE(주소는 있으나 닫힘) | OPEN(열림) | CLOSED(담당자가 마감)
  status            text not null default 'PRIVATE',
  -- 공개 기간. NULL이면 모듈 기간(settings의 시작·종료일)을 상속한다 — 같은 사실을 두 번
  -- 받으면 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가 없다.
  open_at           timestamptz,
  close_at          timestamptz,
  -- 외부 열람자에게 보일 문의 창구. 담당자 개인 연락처를 원장에서 자동으로 끌어오지 않는다
  -- (사내 연락처를 바깥에 내보내는 것은 개인정보 제공이다).
  contact           text,
  -- 열린 횟수만 답한다. 로그인이 없으므로 누가 봤는지는 원리적으로 알 수 없다.
  view_count        integer not null default 0,
  last_viewed_at    timestamptz,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default timezone('utc'::text, now()),
  updated_at        timestamptz not null default timezone('utc'::text, now()),
  constraint pmpl_entity_key_check
    check (entity_key in ('program', 'ma_program', 'project_program')),
  constraint pmpl_status_check
    check (status in ('PRIVATE', 'OPEN', 'CLOSED')),
  constraint pmpl_window_check
    check (open_at is null or close_at is null or close_at > open_at)
);

-- 모듈당 1건.
create unique index if not exists uq_pmpl_module
  on public.program_module_public_links (entity_key, program_module_id);
-- 토큰은 전역 유니크 — 익명 해석이 토큰 하나로 시작하므로 이 약속이 한 곳에서 강제되어야 한다.
create unique index if not exists uq_pmpl_token
  on public.program_module_public_links (token);

comment on table public.program_module_public_links is
  '모듈 공개 링크(모듈 1:1). 로그인 없는 외부 노출 축 — 공유 범위(visibility)와 독립이다.';
comment on column public.program_module_public_links.entity_key is
  '소유 원장: program(AC) | ma_program(M&A) | project_program(PROJECT). RLS 워크스페이스 판정 근거.';
comment on column public.program_module_public_links.token is
  '공개 주소(/p/:token) 토큰. 최초 1회 발급 후 고정 — 껐다 켜도 같은 주소가 돌아온다. 교체는 재발급 RPC만.';
comment on column public.program_module_public_links.view_count is
  '열린 횟수. 누가 봤는지는 로그인이 없어 알 수 없다.';

alter table public.program_module_public_links enable row level security;

-- 권한: 익명에게는 테이블 자체를 닫는다(외부 경로는 Edge Function이 service_role로 중개).
revoke all on table public.program_module_public_links from anon;
grant select, insert, update on table public.program_module_public_links to authenticated;

-- --- 정책 3종 -------------------------------------------------------
-- 판정은 스스로 하지 않고 '모듈이 보이는가'로 위임한다. ws_module_row가 INVOKER이므로
-- 모듈 원장의 RLS(사업 접근 판정 포함)가 그대로 걸린다.
drop policy if exists pmpl_select on public.program_module_public_links;
create policy pmpl_select on public.program_module_public_links for select
  using (
    app.can_read_workspace(app.entity_key_workspace(entity_key))
    and exists (select 1 from app.ws_module_row(entity_key, program_module_id))
  );

drop policy if exists pmpl_insert on public.program_module_public_links;
create policy pmpl_insert on public.program_module_public_links for insert
  with check (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and exists (
      select 1 from app.ws_module_row(entity_key, program_module_id) r
       where app.module_public_linkable(r.module_type)
    )
  );

drop policy if exists pmpl_update on public.program_module_public_links;
create policy pmpl_update on public.program_module_public_links for update
  using (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and exists (select 1 from app.ws_module_row(entity_key, program_module_id))
  )
  with check (
    app.can_write_workspace(app.entity_key_workspace(entity_key))
    and exists (
      select 1 from app.ws_module_row(entity_key, program_module_id) r
       where app.module_public_linkable(r.module_type)
    )
  );

-- DELETE 정책은 만들지 않는다(물리 삭제 금지). 링크를 내리는 것은 status 변경이다.

-- ---------------------------------------------------------------------
-- (4) 쓰기 RPC — 둘 다 SECURITY INVOKER. 인가는 위 정책이 최종 판정한다.
-- ---------------------------------------------------------------------

-- 토큰 생성: pgcrypto에 의존하지 않고 기존 모집 토큰과 같은 방식을 쓴다(uuid 2개의 hex).
create or replace function app.new_public_link_token()
returns text
language sql
volatile
set search_path = app, public
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create or replace function public.set_module_public_link(
  p_entity_key text,
  p_module_id  uuid,
  p_status     text,
  p_open_at    timestamptz default null,
  p_close_at   timestamptz default null,
  p_contact    text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_type   text;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'PRIVATE');
  v_row    public.program_module_public_links%rowtype;
begin
  if p_entity_key not in ('program', 'ma_program', 'project_program') then
    raise exception '원장 키가 올바르지 않습니다: %', p_entity_key;
  end if;
  if v_status not in ('PRIVATE', 'OPEN', 'CLOSED') then
    raise exception '공개 상태 값이 올바르지 않습니다: %', v_status;
  end if;
  if p_open_at is not null and p_close_at is not null and p_close_at <= p_open_at then
    raise exception '공개 마감은 공개 시작 이후여야 합니다.';
  end if;

  -- 모듈이 보이지 않으면(없거나 접근 불가) 여기서 끝난다 — RLS가 이미 답을 냈다.
  select r.module_type into v_type
    from app.ws_module_row(p_entity_key, p_module_id) r;
  if v_type is null then
    raise exception '모듈을 찾을 수 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;
  if not app.module_public_linkable(v_type) then
    raise exception '이 템플릿은 링크 공유를 켤 수 없습니다: %', v_type;
  end if;

  insert into public.program_module_public_links
    (entity_key, program_module_id, token, status, open_at, close_at, contact, created_by)
  values
    (p_entity_key, p_module_id, app.new_public_link_token(), v_status,
     p_open_at, p_close_at, nullif(btrim(p_contact), ''), app.current_app_user_id())
  on conflict (entity_key, program_module_id) do update set
    -- 토큰은 건드리지 않는다. 껐다 켜도 같은 주소가 돌아와야 이미 배포한 공고문이 살아 있다.
    status     = excluded.status,
    open_at    = excluded.open_at,
    close_at   = excluded.close_at,
    contact    = excluded.contact,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'token', v_row.token, 'status', v_row.status,
    'open_at', v_row.open_at, 'close_at', v_row.close_at, 'contact', v_row.contact
  );
end;
$$;

revoke all on function public.set_module_public_link(text, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.set_module_public_link(text, uuid, text, timestamptz, timestamptz, text) to authenticated;

comment on function public.set_module_public_link(text, uuid, text, timestamptz, timestamptz, text) is
  '모듈 공개 링크 생성/수정(최초 호출 시 토큰 1회 발급, 이후 고정). SECURITY INVOKER — 인가는 링크 원장 RLS가 판정한다.';

create or replace function public.rotate_module_public_link(
  p_entity_key text,
  p_module_id  uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_token text;
begin
  update public.program_module_public_links
     set token = app.new_public_link_token(), updated_at = now()
   where entity_key = p_entity_key and program_module_id = p_module_id
  returning token into v_token;

  if v_token is null then
    raise exception '재발급할 링크를 찾을 수 없거나 권한이 없습니다.' using errcode = '42501';
  end if;
  return jsonb_build_object('token', v_token);
end;
$$;

revoke all on function public.rotate_module_public_link(text, uuid) from public, anon;
grant execute on function public.rotate_module_public_link(text, uuid) to authenticated;

comment on function public.rotate_module_public_link(text, uuid) is
  '공개 주소 재발급. 옛 주소는 즉시 죽고 되살릴 수 없다 — 유출 대응 전용.';

-- 열린 횟수 증가. PostgREST로는 `view_count = view_count + 1`을 표현할 수 없어 함수로 둔다.
-- SECURITY INVOKER다 — 부르는 쪽이 service_role(공개 Edge Function)이라 RLS를 우회할 필요가
-- 없고, DEFINER로 만들 이유도 없다. 실행 권한은 service_role에만 준다.
create or replace function public.bump_module_public_link_view(p_link_id uuid)
returns void
language sql
security invoker
set search_path = app, public
as $$
  update public.program_module_public_links
     set view_count = view_count + 1, last_viewed_at = now()
   where id = p_link_id;
$$;

revoke all on function public.bump_module_public_link_view(uuid) from public, anon, authenticated;
grant execute on function public.bump_module_public_link_view(uuid) to service_role;

comment on function public.bump_module_public_link_view(uuid) is
  '공개 링크 조회수 +1. 공개 Edge Function(service_role) 전용 — 누가 봤는지는 로그인이 없어 알 수 없고 횟수만 센다.';
