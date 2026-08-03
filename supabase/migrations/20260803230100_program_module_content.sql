-- =====================================================================
-- [사업 모듈] 커스텀 활동 → 글쓰기·URL첨부·파일첨부 3종 분리 (2/2: 원장)
-- 선행: 20260803230000_module_type_split_enum.sql (POST/LINK/FILE enum 값)
--
-- 범위:
--   (1) 글쓰기 원장 — custom_activities 계열을 program_posts 계열로 개명하고 본문 컬럼을 단다.
--       새 테이블을 만들지 않는 이유: 기존 커스텀 활동 행이 이미 모듈 인스턴스에 매여 있고,
--       AC의 하위 테이블 4종(activity_minutes/action_items/activity_attachments/
--       activity_attendees)이 이 원장을 FK로 물고 있다. 새 원장으로 옮기면 그 연결이 끊기거나
--       같은 사실이 두 벌로 남는다. 개명은 행을 잃지 않고 이름만 실제 역할에 맞춘다.
--   (2) URL첨부 원장 — program_links 계열 3벌 신규.
--   (3) 파일첨부 — 신규 원장 없이 public.attachments에 program_module_id 한 컬럼만 더한다.
--       "여기 올리면 자료관리에도 보인다"가 요구사항이므로 파일은 사업 자료(target_type='program',
--       target_id=사업id)와 **같은 행**이어야 한다. 별도 원장을 두고 복제하면 두 목록이 언젠가
--       어긋나고, 어느 쪽이 진짜인지 판정할 근거가 없어진다. 모듈은 이 컬럼으로 자기 파일만 고른다.
--   (4) 구 CUSTOM_ACTIVITY 모듈 인스턴스를 POST로 이관.
--
-- 물리 삭제 금지 원칙에 따라 구 컬럼(activity_type/session_source_id)과 AC 하위 4종은
--   드롭하지 않는다. 신규 글에는 쓰지 않으며 기존 행의 사실만 보존한다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (각 원장은 자기 워크스페이스 소유)
--   - 데이터 등급: Internal (사업 운영 기록. 게스트 비공개)
--   - 접근 주체: 내부 사용자만. 외부 스타트업/전문가/게스트에 정책 미부여 → default deny
--   - Scope 기준: program 단건 — AC는 app.can_access_program(), M&A·PROJECT는
--     app.can_access_ws_program(ws, program_id)
--   - 감사 로그: 파일 다운로드는 기존 material-download Edge Function이 access_logs를
--     적재하는 경로를 그대로 탄다(본 마이그레이션은 새 다운로드 경로를 만들지 않는다).
--     URL·글 본문은 개인정보 원본·Export 경로가 아니므로 별도 적재 대상이 아니다.
--   - 운영 영향: custom_activities 계열 개명 — 참조처는 마이그레이션과 워크스페이스 config
--     3곳뿐이며 프론트는 같은 커밋에서 함께 바뀐다. 정책·인덱스·트리거는 새 이름으로 재생성한다.
-- 근거: 20260705150400_ac_ops.sql, 20260705150500_ac_rls.sql,
--       20260720140000_ma_program_schema.sql, 20260720150000_project_program_schema.sql,
--       20260705120300_support_tables.sql, 20260721170000_program_created_by_default.sql
-- =====================================================================

-- (1) 글쓰기 원장: 개명 -------------------------------------------------------
alter table if exists public.custom_activities         rename to program_posts;
alter table if exists public.ma_custom_activities      rename to ma_program_posts;
alter table if exists public.project_custom_activities rename to project_program_posts;

-- 인덱스·트리거도 새 이름으로 맞춘다(개명 자체는 무해하지만 옛 이름이 남으면 다음 사람이
-- 원장을 찾을 때 두 이름 사이에서 헤맨다).
alter index if exists public.idx_custom_activities_program         rename to idx_program_posts_program;
alter index if exists public.idx_ma_custom_activities_program      rename to idx_ma_program_posts_program;
alter index if exists public.idx_ma_custom_activities_module       rename to idx_ma_program_posts_module;
alter index if exists public.idx_project_custom_activities_program rename to idx_project_program_posts_program;
alter index if exists public.idx_project_custom_activities_module  rename to idx_project_program_posts_module;

-- ALTER TRIGGER에는 IF EXISTS가 없어 카탈로그를 먼저 확인한다(재실행 안전성).
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('program_posts',         'trg_custom_activities_updated_at',         'trg_program_posts_updated_at'),
      ('ma_program_posts',      'trg_ma_custom_activities_updated_at',      'trg_ma_program_posts_updated_at'),
      ('project_program_posts', 'trg_project_custom_activities_updated_at', 'trg_project_program_posts_updated_at')
    ) as t(tbl, old_name, new_name)
  loop
    if exists (
      select 1 from pg_trigger tg
        join pg_class c on c.oid = tg.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = spec.tbl and tg.tgname = spec.old_name
    ) then
      execute format('alter trigger %I on public.%I rename to %I',
        spec.old_name, spec.tbl, spec.new_name);
    end if;
  end loop;
end $$;

-- (1-2) 글쓰기 원장: 본문·작성자·소프트 삭제 컬럼 ------------------------------
do $$
declare t text;
begin
  foreach t in array array['program_posts','ma_program_posts','project_program_posts'] loop
    execute format('alter table public.%I add column if not exists body text', t);
    execute format(
      'alter table public.%I add column if not exists created_by uuid references public.users(id)', t);
    execute format(
      'alter table public.%I alter column created_by set default app.current_app_user_id()', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format(
      'create index if not exists %I on public.%I (program_module_id)', 'idx_' || t || '_module', t);
  end loop;
end $$;

comment on column public.program_posts.body is
  '글 본문(리치텍스트 HTML). 게시판·회의록과 동일한 TipTap 에디터로 작성한다';
comment on column public.program_posts.activity_type is
  '구 커스텀 활동의 자유 분류. 2026-08-03 글쓰기 모듈 전환 이후 신규 글에는 쓰지 않는다(기존 행 보존용)';

-- (2) URL첨부 원장 ------------------------------------------------------------
-- url CHECK: 링크 버튼은 사용자가 넣은 주소를 그대로 열므로 javascript:·data: 스킴이
-- 저장되면 그 자체가 XSS 경로가 된다. 화면 검증만으로는 API 직접 호출을 막지 못하므로
-- 저장 단계에서 http/https로 못박는다.
create table if not exists public.program_links (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs(id) on delete cascade,
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  label             text not null,
  url               text not null,
  description       text,
  sort_order        integer not null default 0,
  created_by        uuid references public.users(id) default app.current_app_user_id(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint program_links_url_scheme check (url ~* '^https?://')
);

create table if not exists public.ma_program_links (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.ma_programs(id) on delete cascade,
  program_module_id uuid not null references public.ma_program_modules(id) on delete cascade,
  label             text not null,
  url               text not null,
  description       text,
  sort_order        integer not null default 0,
  created_by        uuid references public.users(id) default app.current_app_user_id(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint ma_program_links_url_scheme check (url ~* '^https?://')
);

create table if not exists public.project_program_links (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.project_programs(id) on delete cascade,
  program_module_id uuid not null references public.project_program_modules(id) on delete cascade,
  label             text not null,
  url               text not null,
  description       text,
  sort_order        integer not null default 0,
  created_by        uuid references public.users(id) default app.current_app_user_id(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint project_program_links_url_scheme check (url ~* '^https?://')
);

do $$
declare t text;
begin
  foreach t in array array['program_links','ma_program_links','project_program_links'] loop
    execute format(
      'create index if not exists %I on public.%I (program_module_id, sort_order)',
      'idx_' || t || '_module', t);
    execute format(
      'create index if not exists %I on public.%I (program_id)', 'idx_' || t || '_program', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.set_updated_at()',
      'trg_' || t || '_updated_at', t);
  end loop;
end $$;

comment on table public.program_links is
  'URL첨부 모듈의 링크 목록(AC). 모듈 카드를 누르면 이 행들이 링크 버튼 모달로 열린다';

-- (3) 파일첨부: 사업 자료(attachments)에 모듈 귀속 표시 ------------------------
-- FK를 걸지 않는 이유: 부모가 워크스페이스별로 셋(program_modules / ma_program_modules /
-- project_program_modules)이라 단일 FK로 가리킬 수 없다. attachments는 target_id도 FK 없이
-- 다형으로 쓰는 테이블이므로 같은 규약을 따른다. 모듈이 지워져도 파일 자체는 사업 자료로 남는다.
alter table public.attachments add column if not exists program_module_id uuid;

create index if not exists idx_attachments_program_module
  on public.attachments (program_module_id)
  where program_module_id is not null;

comment on column public.attachments.program_module_id is
  '파일첨부 모듈이 올린 파일의 귀속 모듈 인스턴스. 값이 있어도 target_type/target_id는
   사업(program)이므로 사업 상세의 자료 관리 패널에 같은 행이 그대로 보인다.
   부모 원장이 워크스페이스별로 나뉘어 있어 FK는 걸지 않는다';

-- (4) 구 CUSTOM_ACTIVITY 인스턴스 → POST 이관 ---------------------------------
update public.program_modules         set module_type = 'POST' where module_type = 'CUSTOM_ACTIVITY';
update public.ma_program_modules      set module_type = 'POST' where module_type = 'CUSTOM_ACTIVITY';
update public.project_program_modules set module_type = 'POST' where module_type = 'CUSTOM_ACTIVITY';

-- (5) RLS ---------------------------------------------------------------------
alter table public.program_posts         enable row level security;
alter table public.ma_program_posts      enable row level security;
alter table public.project_program_posts enable row level security;
alter table public.program_links         enable row level security;
alter table public.ma_program_links      enable row level security;
alter table public.project_program_links enable row level security;

-- 개명 전 이름으로 붙어 있던 정책을 걷어 낸다(정책은 테이블을 따라오되 이름은 옛것이라,
-- 남겨 두면 다음 마이그레이션이 같은 테이블에 두 벌의 판정을 얹게 된다).
drop policy if exists custom_activities_ac_select         on public.program_posts;
drop policy if exists custom_activities_ac_insert         on public.program_posts;
drop policy if exists custom_activities_ac_update         on public.program_posts;
drop policy if exists ma_custom_activities_select         on public.ma_program_posts;
drop policy if exists ma_custom_activities_insert         on public.ma_program_posts;
drop policy if exists ma_custom_activities_update         on public.ma_program_posts;
drop policy if exists project_custom_activities_select    on public.project_program_posts;
drop policy if exists project_custom_activities_insert    on public.project_program_posts;
drop policy if exists project_custom_activities_update    on public.project_program_posts;

-- AC는 전용 헬퍼 app.can_access_program(), M&A·PROJECT는 워크스페이스 키로 파라미터화된
-- app.can_access_ws_program()을 쓴다(각 워크스페이스의 기존 하위 테이블 정책과 동일한 형태).
do $$
declare
  spec record;
  sel_expr text;
  wr_expr  text;
begin
  for spec in
    select * from (values
      ('program_posts',         'ac',      'program_posts_ac'),
      ('program_links',         'ac',      'program_links_ac'),
      ('ma_program_posts',      'mna',     'ma_program_posts'),
      ('ma_program_links',      'mna',     'ma_program_links'),
      ('project_program_posts', 'project', 'project_program_posts'),
      ('project_program_links', 'project', 'project_program_links')
    ) as t(tbl, ws, pol)
  loop
    if spec.ws = 'ac' then
      sel_expr := 'app.can_read_workspace(''ac'') and app.can_access_program(program_id)';
      wr_expr  := 'app.can_write_workspace(''ac'') and app.can_access_program(program_id)';
    else
      sel_expr := format(
        'app.can_read_workspace(%L) and app.can_access_ws_program(%L, program_id)', spec.ws, spec.ws);
      wr_expr := format(
        'app.can_write_workspace(%L) and app.can_access_ws_program(%L, program_id)', spec.ws, spec.ws);
    end if;

    execute format('drop policy if exists %I on public.%I', spec.pol || '_select', spec.tbl);
    execute format('create policy %I on public.%I for select using (%s)',
      spec.pol || '_select', spec.tbl, sel_expr);

    execute format('drop policy if exists %I on public.%I', spec.pol || '_insert', spec.tbl);
    execute format('create policy %I on public.%I for insert with check (%s)',
      spec.pol || '_insert', spec.tbl, wr_expr);

    execute format('drop policy if exists %I on public.%I', spec.pol || '_update', spec.tbl);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)',
      spec.pol || '_update', spec.tbl, wr_expr, wr_expr);
    -- DELETE 정책은 만들지 않는다(deleted_at 기반 soft delete).
  end loop;
end $$;
