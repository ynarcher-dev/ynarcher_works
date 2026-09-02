-- =====================================================================
-- ADMIN 모듈 관리 — 템플릿 카탈로그를 원장으로 모은다
--
-- 무엇이 문제였나
--   "어떤 템플릿이 있고 어디에 어떤 순서로 서는가"를 네 곳이 나눠 답하고 있었다:
--   module_type enum / features/program/config.ts의 MODULE_TYPES 순서 /
--   워크스페이스별 allowedModuleTypes / detail/moduleMeta.ts의 MODULE_META.
--   그래서 "M&A에도 멘토링을 열까", "이 템플릿은 이제 쓰지 말자" 같은 **운영 판단마다
--   코드 수정과 배포**가 필요했다 — 판단의 주체(ADMIN)와 판단이 사는 곳(코드)이 어긋나 있었다.
--
-- 무엇이 원장으로 오고 무엇이 코드에 남는가
--   기준은 하나 — **화면 구현이 있어야만 성립하는가**. 아이콘·진입 탭·라벨·배정 방식 정책은
--   코드에 남고, 배치(분류·순서·사용 여부·워크스페이스 노출·공유 상한)만 원장으로 온다.
--   ADMIN은 **있는 것을 배치할 뿐 없는 것을 만들지 않는다** — 멘토링 화면이 없는데 멘토링
--   템플릿을 켤 수는 없다. 그래서 행은 마이그레이션이 심고 ADMIN은 값만 고친다.
--
-- 관통 규칙: 카탈로그와 노출 상한은 기존 인스턴스에 다르게 작용한다
--   · 카탈로그(is_active·workspaces)를 끄면 **새로 못 만들 뿐 진행 중인 인스턴스는 그대로**다.
--     끄는 것은 "앞으로 이 종류는 쓰지 않는다"는 선언이지 "지금까지 한 일을 없던 것으로
--     한다"가 아니다. 진행 중인 사업의 멘토링이 카탈로그 정리 한 번에 멈추면 담당자는 자기
--     사업이 왜 망가졌는지 알 방법이 없다.
--   · 노출 상한(allow_guest·allow_public_link)을 내리면 **이미 열린 것도 즉시 닫힌다**.
--     그러지 않으면 그 설정에 아무 뜻이 없다. 단 판정 시점에만 막고 저장값·토큰은 보존해
--     되돌리면 복구된다(게스트 차단·사업 종료 처리와 같은 규칙).
--
-- 근거 기획: docs/docs_planning/3_2_1_admin_module_registry.md
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: admin(쓰기). 읽기는 내부 사용자 전원 — 모듈 추가 마법사와 모듈
--     세팅 창이 선택지를 그리려면 읽어야 한다. 데이터 등급 Internal(배치 정보뿐, 개인정보 없음).
--   · 접근 주체: 내부 사용자만. **게스트는 이 원장을 읽지 않는다** — 게스트에게 필요한 것은
--     자기에게 열린 모듈 목록이지 템플릿 카탈로그가 아니다.
--   · Scope: global. 신규 테이블 1종 → RLS 즉시 활성 + SELECT/INSERT/UPDATE 정책 분리 +
--     **DELETE 정책 없음**(템플릿을 지우는 개념이 없다 — is_active를 내릴 뿐이며, 코드가 심은
--     행을 지우면 기존 인스턴스가 가리킬 곳을 잃는다).
--   · 신규 SECURITY DEFINER 없음. 판정 헬퍼 4종과 쓰기 RPC는 전부 SECURITY INVOKER다.
--     기존 app.guest_module_ids()(DEFINER)만 재정의하며 조건이 좁아지기만 한다.
--   · 트리거 1종 신설(app.enforce_module_template) — 세 모듈 원장에 붙어 카탈로그·상한을
--     강제한다. RPC에 넣지 않은 이유는 쓰기 경로가 셋(AC·M&A·PROJECT RPC)이고 임포터·
--     PostgREST 직접 쓰기도 있어, 한 곳에 두지 않으면 언젠가 한 경로만 규칙 밖에 남기 때문이다.
--   · GRANT EXECUTE는 authenticated 한정. 시드에 개인정보·시크릿 없음. 물리 삭제 없음.
--   · 파생 효과: guest_module_ids()가 allow_guest만큼 좁아진다. 시드가 전 템플릿
--     allow_guest=true라 **적용 직후 게스트 노출은 한 건도 바뀌지 않는다**.
-- 근거: 20260720200000_office_boards.sql(같은 모양의 ADMIN 원장), 20260902130000
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 템플릿 원장
-- ---------------------------------------------------------------------
create table if not exists public.module_templates (
  -- module_type enum 값과 1:1. 대리 키를 두지 않는다 — 이 문자열이 이미 전역 유일하고
  -- 코드·원장·화면이 모두 이 값으로 서로를 가리킨다. uuid를 얹으면 조인만 한 겹 는다.
  key               text primary key,
  -- 분류. 라벨과 분류 자체의 순서는 코드가 갖는다(화면의 섹션 제목이기도 하다).
  category          text not null,
  sort_order        integer not null default 0,
  -- 카탈로그: 지금 새로 배치할 수 있는 종류인가.
  is_active         boolean not null default true,
  -- 카탈로그: 어느 워크스페이스의 목록에 서는가. 정규화하지 않은 이유는 값이 셋 고정이고
  -- 물을 질문이 "이 워크스페이스에 서는가" 하나뿐이기 때문이다.
  workspaces        text[] not null default '{}',
  -- 상한: 공유 범위를 WORKS+GUEST까지 올릴 수 있는가.
  allow_guest       boolean not null default false,
  -- 상한: 로그인 없는 공개 링크를 열 수 있는가.
  allow_public_link boolean not null default false,
  created_at        timestamptz not null default timezone('utc'::text, now()),
  updated_at        timestamptz not null default timezone('utc'::text, now()),
  constraint module_templates_category_check
    check (category in ('BASE', 'INTAKE', 'OPERATION', 'OUTCOME')),
  constraint module_templates_workspaces_check
    check (workspaces <@ array['ac', 'mna', 'project'])
);

create index if not exists idx_module_templates_order
  on public.module_templates (category, sort_order, key);

comment on table public.module_templates is
  '사업 운영 모듈의 템플릿 카탈로그. 행은 마이그레이션이 심고 ADMIN은 배치 값만 고친다.';
comment on column public.module_templates.is_active is
  '카탈로그: 새로 배치 가능한가. 끄면 기존 인스턴스는 그대로 동작하고 신규 생성만 막힌다.';
comment on column public.module_templates.allow_guest is
  '상한: GUEST 공개 가능한가. 내리면 이미 GUEST_ONLY인 인스턴스도 즉시 닫힌다(저장값은 보존).';
comment on column public.module_templates.allow_public_link is
  '상한: 로그인 없는 공개 링크 가능한가. 내리면 열려 있던 링크도 즉시 닫힌다(주소는 보존).';

alter table public.module_templates enable row level security;

revoke all on table public.module_templates from anon;
grant select, insert, update on table public.module_templates to authenticated;

-- 읽기: 내부 사용자 전원(선택지를 그리려면 읽어야 한다). 게스트는 제외한다.
drop policy if exists module_templates_select on public.module_templates;
create policy module_templates_select on public.module_templates for select
  using (app.current_app_user_id() is not null and not app.is_guest());

-- 쓰기: ADMIN만.
drop policy if exists module_templates_insert on public.module_templates;
create policy module_templates_insert on public.module_templates for insert
  with check (app.is_admin());

drop policy if exists module_templates_update on public.module_templates;
create policy module_templates_update on public.module_templates for update
  using (app.is_admin()) with check (app.is_admin());

-- DELETE 정책은 만들지 않는다.

-- ---------------------------------------------------------------------
-- (2) 시드 — 현행 동작을 그대로 옮긴다
--     `do nothing`이 핵심이다: 다시 실행해도 ADMIN이 바꿔 둔 배치를 덮지 않는다.
--     시드는 '처음 한 번의 초기값'이지 '정답'이 아니다.
--
--     allow_guest는 전부 true — 지금까지 공유 범위는 템플릿을 가리지 않고 올릴 수 있었고,
--     이 기능을 켠 직후 담당자 화면은 어제와 똑같아야 한다.
--     allow_public_link는 전부 false — 링크 공유는 아직 운영에 나간 적이 없으므로 지킬
--     기존 동작이 없고, 밖으로 나가는 것은 ADMIN이 명시적으로 열기 전까지 닫혀 있어야 한다.
-- ---------------------------------------------------------------------
insert into public.module_templates
  (key, category, sort_order, is_active, workspaces, allow_guest, allow_public_link)
values
  ('POST',              'BASE',      10, true, array['ac','mna','project'], true, false),
  ('LINK',              'BASE',      20, true, array['ac','mna','project'], true, false),
  ('FILE',              'BASE',      30, true, array['ac','mna','project'], true, false),
  ('RECRUITMENT',       'INTAKE',    10, true, array['ac'],                 true, false),
  ('DOC_REVIEW',        'INTAKE',    20, true, array['ac'],                 true, false),
  ('ONSITE_EVAL',       'INTAKE',    30, true, array['ac'],                 true, false),
  ('ORIENTATION',       'OPERATION', 10, true, array['ac'],                 true, false),
  ('MENTORING',         'OPERATION', 20, true, array['ac'],                 true, false),
  ('BUSINESS_MATCHING', 'OPERATION', 30, true, array['ac'],                 true, false),
  ('DEMO_DAY',          'OPERATION', 40, true, array['ac'],                 true, false),
  ('OUTCOMES',          'OUTCOME',   10, true, array['ac'],                 true, false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- (3) 판정 헬퍼 — 전부 SECURITY INVOKER
--     DEFINER로 만들 이유가 없다. 내부 사용자는 원장을 읽을 수 있고, 게스트 판정 함수와
--     공개 링크 경로는 각각 DEFINER·service_role 안에서 부르므로 그 문맥의 권한을 따른다.
-- ---------------------------------------------------------------------

-- 카탈로그: 이 워크스페이스에서 새로 배치할 수 있는 템플릿인가.
create or replace function app.module_template_available(p_key text, p_ws text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1 from public.module_templates t
     where t.key = p_key and t.is_active and p_ws = any(t.workspaces)
  );
$$;

-- 상한: 공유 범위를 GUEST까지 올릴 수 있는가.
create or replace function app.module_template_allows_guest(p_key text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1 from public.module_templates t where t.key = p_key and t.allow_guest
  );
$$;

-- 상한: 로그인 없는 링크를 열 수 있는가.
-- 20260902130000에서 하드코딩 목록으로 세웠던 것을 원장 조회로 갈아끼운다 — 판정하는
-- 함수는 그대로 하나이고 그 함수가 답을 얻는 곳만 코드에서 원장으로 옮겼다.
create or replace function app.module_public_linkable(p_module_type text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1 from public.module_templates t
     where t.key = p_module_type and t.is_active and t.allow_public_link
  );
$$;

grant execute on function app.module_template_available(text, text) to authenticated;
grant execute on function app.module_template_allows_guest(text) to authenticated;
grant execute on function app.module_public_linkable(text) to authenticated;

comment on function app.module_public_linkable(text) is
  '링크 공유를 켤 수 있는 템플릿인가(module_templates.allow_public_link). 화면의 MODULE_META와 같은 답을 DB가 최종 강제한다.';

-- ---------------------------------------------------------------------
-- (4) 강제 — 세 모듈 원장에 붙는 트리거
--     RPC 안이 아니라 트리거로 둔 이유: 쓰기 경로가 셋(AC·M&A·PROJECT RPC)이고 임포터·
--     PostgREST 직접 쓰기도 있다. 한 곳에 두지 않으면 언젠가 한 경로만 규칙 밖에 남는다.
-- ---------------------------------------------------------------------
create or replace function app.enforce_module_template()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_ws  text := tg_argv[0];
  v_key text := new.module_type::text;
begin
  -- 카탈로그는 **생성 시점에만** 본다. 이미 배치된 인스턴스의 수정·운영은 건드리지 않는다.
  if tg_op = 'INSERT' and not app.module_template_available(v_key, v_ws) then
    raise exception '이 템플릿은 현재 워크스페이스에서 사용할 수 없습니다: %', v_key
      using errcode = '42501';
  end if;

  -- 상한은 **값을 올리려 할 때** 본다. 이미 GUEST_ONLY인 행을 그대로 둔 채 기간만 고치는
  -- 수정까지 막으면, 상한이 노출을 닫는 것을 넘어 편집까지 가로막게 된다. 기존 행의 노출은
  -- app.guest_module_ids()가 이미 닫으므로 여기서 또 막을 이유가 없다.
  --
  -- 분기를 중첩한 이유는 OLD 때문이다 — SQL의 OR는 단축 평가가 보장되지 않으므로
  -- `tg_op = 'INSERT' or old.visibility ...`로 쓰면 INSERT에서 미할당 OLD를 건드릴 수 있다.
  if new.visibility = 'GUEST_ONLY' and not app.module_template_allows_guest(v_key) then
    if tg_op = 'INSERT' then
      raise exception '이 템플릿은 GUEST 공개가 허용되어 있지 않습니다: %', v_key
        using errcode = '42501';
    elsif old.visibility is distinct from new.visibility then
      raise exception '이 템플릿은 GUEST 공개가 허용되어 있지 않습니다: %', v_key
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function app.enforce_module_template() is
  '모듈 원장 쓰기에 템플릿 카탈로그·상한을 강제한다. 카탈로그는 생성 시점만, 상한은 값을 올릴 때만 본다.';

do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('program_modules',         'ac'),
      ('ma_program_modules',      'mna'),
      ('project_program_modules', 'project')
    ) as t(tbl, ws)
  loop
    execute format('drop trigger if exists trg_enforce_module_template on public.%I', spec.tbl);
    execute format(
      'create trigger trg_enforce_module_template before insert or update on public.%I
         for each row execute function app.enforce_module_template(%L)', spec.tbl, spec.ws);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (5) 게스트 노출에 상한을 더한다
--     시드가 전 템플릿 allow_guest=true라 적용 직후 결과 집합은 변하지 않는다.
-- ---------------------------------------------------------------------
create or replace function app.guest_module_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select m.id
    from public.program_modules m
   where m.program_id in (select app.guest_program_ids())
     and m.visibility = 'GUEST_ONLY'
     and m.enabled
     and m.status <> 'CANCELLED'
     and app.module_template_allows_guest(m.module_type::text);
$$;

comment on function app.guest_module_ids() is
  '게스트에게 공개된 모듈(공유 범위 WORKS+GUEST + 켜짐 + 취소 아님 + 템플릿 상한 허용).
   게스트 메뉴 구성과 일정·슬롯·세션·글·링크·파일 노출의 단일 기준.';

-- ---------------------------------------------------------------------
-- (6) 링크 공유 스위치를 ADMIN 전용으로 (10-C)
--     밖으로 문을 여는 결정은 되돌릴 수 없는 쪽이다 — 이미 내려간 파일은 회수하지 못한다.
--     담당자 전원이 상시 쥐고 있을 손잡이가 아니다. 다만 **읽기는 열어 둔다**: 감추면
--     담당자가 자기 모듈이 밖에 열려 있다는 사실 자체를 모르게 되는데, 그것은 권한을
--     좁히는 것이 아니라 정보를 숨기는 것이다.
-- ---------------------------------------------------------------------
drop policy if exists pmpl_insert on public.program_module_public_links;
create policy pmpl_insert on public.program_module_public_links for insert
  with check (
    app.is_admin()
    and exists (
      select 1 from app.ws_module_row(entity_key, program_module_id) r
       where app.module_public_linkable(r.module_type)
    )
  );

drop policy if exists pmpl_update on public.program_module_public_links;
create policy pmpl_update on public.program_module_public_links for update
  using (
    app.is_admin()
    and exists (select 1 from app.ws_module_row(entity_key, program_module_id))
  )
  with check (
    app.is_admin()
    and exists (
      select 1 from app.ws_module_row(entity_key, program_module_id) r
       where app.module_public_linkable(r.module_type)
    )
  );

-- SELECT 정책은 그대로 둔다(사업 담당자는 상태·주소를 읽는다).
--
-- set_module_public_link / rotate_module_public_link(20260902130000)에 is_admin 가드를
-- 따로 넣지 않는다 — 두 함수는 SECURITY INVOKER라 위 정책이 그대로 인가를 판정하며,
-- 거부 시 코드도 42501로 같다. 함수 안에 조건을 복제하면 정책을 고치는 날 복제본만
-- 옛 규칙으로 남고, 그 복제본이 곧 권한 구멍이 된다.

-- ---------------------------------------------------------------------
-- (7) ADMIN 저장 RPC — 여러 행을 한 번에, 원자적으로
--     순서 이동은 이웃 행의 sort_order를 함께 바꾸므로 부분 반영되면 순서가 깨진다.
--     **행을 만들지 않는다** — 없는 키는 거부한다. ADMIN은 있는 것을 배치할 뿐이다.
-- ---------------------------------------------------------------------
create or replace function public.set_module_templates(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_row   jsonb;
  v_key   text;
  v_count integer := 0;
begin
  if not app.is_admin() then
    raise exception '모듈 카탈로그를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '저장할 목록이 올바르지 않습니다.';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_key := v_row->>'key';
    if not exists (select 1 from public.module_templates where key = v_key) then
      raise exception '없는 템플릿입니다: %', v_key;
    end if;

    update public.module_templates set
      category          = coalesce(v_row->>'category', category),
      sort_order        = coalesce((v_row->>'sort_order')::integer, sort_order),
      is_active         = coalesce((v_row->>'is_active')::boolean, is_active),
      workspaces        = coalesce(
                            (select array_agg(value::text)
                               from jsonb_array_elements_text(v_row->'workspaces') as value),
                            case when v_row ? 'workspaces' then '{}'::text[] else workspaces end),
      allow_guest       = coalesce((v_row->>'allow_guest')::boolean, allow_guest),
      allow_public_link = coalesce((v_row->>'allow_public_link')::boolean, allow_public_link),
      updated_at        = now()
    where key = v_key;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.set_module_templates(jsonb) from public, anon;
grant execute on function public.set_module_templates(jsonb) to authenticated;

comment on function public.set_module_templates(jsonb) is
  '모듈 템플릿 배치 저장(ADMIN 전용). 여러 행을 한 트랜잭션에 반영한다 — 순서 이동이 이웃 행을 함께 바꾸므로 부분 저장은 순서를 깨뜨린다.';
