-- =====================================================================
-- [Phase 15 / 대용량 업로드 Phase 2] 기여 이력 + 업로드 배치 데이터 계층
-- - 네트워크 마스터를 '공동 관리'(단일 작성자 없음)로 다루기 위한 기여 로그(append-only).
--   같은 인물 병합 시 복제하지 않고 이 로그에 이력을 축적한다(상세페이지 연혁·기여자 표시의 원천).
-- - 대용량 업로드 배치 이력(파일 해시로 '동일 파일 재업로드' 경고).
-- - 파괴적 작업(비활성/병합) 판정 헬퍼 `app.is_entity_contributor`를 함께 제공한다.
--   실제 트리거 가드는 앱이 생성/이동/병합 시 기여를 기록하도록 배선한 뒤 후속 슬라이스에서 켠다
--   (지금 켜면 기존 flow가 기여 미기록으로 잠길 수 있어 분리).
-- 근거: 20260706170000_networks_org_masters.sql(RLS 패턴), 20260705120200_rls_helpers.sql(헬퍼)
-- =====================================================================

-- 업로드 배치 이력 ------------------------------------------------------
create table if not exists public.upload_batches (
  id             uuid primary key default gen_random_uuid(),
  uploaded_by    uuid references public.users(id),
  filename       text,
  content_hash   text,                               -- 파일 콘텐츠 해시(동일 파일 재업로드 경고)
  total_rows     integer not null default 0,
  inserted_count integer not null default 0,
  merged_count   integer not null default 0,
  skipped_count  integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_upload_batches_hash    on public.upload_batches (content_hash);
create index if not exists idx_upload_batches_created on public.upload_batches (created_at desc);

alter table public.upload_batches enable row level security;

drop policy if exists upload_batches_select on public.upload_batches;
create policy upload_batches_select on public.upload_batches for select
  using (app.can_read_workspace('networks'));

drop policy if exists upload_batches_insert on public.upload_batches;
create policy upload_batches_insert on public.upload_batches for insert
  with check (app.can_write_workspace('networks'));

-- 기여 이력(append-only) ------------------------------------------------
-- entity_table+entity_id로 9종 네트워크 레코드를 다형 참조한다(FK는 걸지 않음: 다형).
create table if not exists public.entity_contributions (
  id           uuid primary key default gen_random_uuid(),
  entity_table text not null,                        -- experts|van|investors|corporates|institutions|universities|vendors|etc|others
  entity_id    uuid not null,
  user_id      uuid references public.users(id),     -- 기여자(actor)
  user_name    text,                                 -- 기여자명 비정규화(users RLS 우회 표시용, 트리거 스탬프)
  action       text not null default 'created',      -- created|merged|enriched|edited
  source       text not null default 'manual',       -- manual|upload
  batch_id     uuid references public.upload_batches(id),
  note         text,
  created_at   timestamptz not null default now(),
  constraint entity_contributions_action_chk check (action in ('created','merged','enriched','edited')),
  constraint entity_contributions_source_chk check (source in ('manual','upload'))
);
create index if not exists idx_entity_contrib_entity on public.entity_contributions (entity_table, entity_id, created_at);
create index if not exists idx_entity_contrib_user   on public.entity_contributions (user_id);

alter table public.entity_contributions enable row level security;

-- 조회: networks 읽기 권한자. 기록: networks 쓰기 권한자. update/delete 정책 없음 → append-only(Default Deny).
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select
  using (app.can_read_workspace('networks'));

drop policy if exists entity_contributions_insert on public.entity_contributions;
create policy entity_contributions_insert on public.entity_contributions for insert
  with check (app.can_write_workspace('networks'));

-- 기여자/업로더 자동 스탬프(클라이언트가 안 넘겨도 서버가 현재 앱 유저로 채운다) ----
create or replace function app.stamp_contribution_actor()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.user_id is null then
    NEW.user_id := app.current_app_user_id();
  end if;
  -- 이름 비정규화: users RLS(본인/admin만 조회)에 막히지 않도록 여기서 채운다(SECURITY DEFINER).
  if NEW.user_name is null and NEW.user_id is not null then
    select u.name into NEW.user_name from public.users u where u.id = NEW.user_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_entity_contrib_actor on public.entity_contributions;
create trigger trg_entity_contrib_actor
  before insert on public.entity_contributions
  for each row execute function app.stamp_contribution_actor();

create or replace function app.stamp_batch_uploader()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.uploaded_by is null then
    NEW.uploaded_by := app.current_app_user_id();
  end if;
  return NEW;
end $$;

drop trigger if exists trg_upload_batch_uploader on public.upload_batches;
create trigger trg_upload_batch_uploader
  before insert on public.upload_batches
  for each row execute function app.stamp_batch_uploader();

-- [헬퍼] 특정 레코드의 기여자(또는 admin) 여부 -------------------------------
-- 파괴적 작업(비활성/병합) 가드용. 기여 기록이 전혀 없는 레코드(레거시/작성자 미상)는
-- 잠금을 피하기 위해 공용 허용으로 폴백한다.
create or replace function app.is_entity_contributor(p_table text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or not exists (
        select 1 from public.entity_contributions c
        where c.entity_table = p_table and c.entity_id = p_id
      )
      or exists (
        select 1 from public.entity_contributions c
        where c.entity_table = p_table and c.entity_id = p_id
          and c.user_id = app.current_app_user_id()
      );
$$;

-- 백필: 기존 레코드의 created_by를 최초 'created' 기여로 이관(중복 방지) ---------
do $$
declare t text;
begin
  foreach t in array array['experts','van','investors','corporates','institutions','universities','vendors','etc','others']
  loop
    execute format($ins$
      insert into public.entity_contributions (entity_table, entity_id, user_id, user_name, action, source, created_at)
      select %1$L, s.id, s.created_by, u.name, 'created', 'manual', s.created_at
      from public.%1$I s
      left join public.users u on u.id = s.created_by
      where s.created_by is not null
        and not exists (
          select 1 from public.entity_contributions c
          where c.entity_table = %1$L and c.entity_id = s.id
        );
    $ins$, t);
  end loop;
end $$;

comment on table public.entity_contributions is '네트워크 마스터 공동 관리용 기여 로그(append-only). 상세페이지 연혁·기여자 표시, 병합 이력의 원천';
comment on table public.upload_batches is '대용량 업로드 배치 이력(파일 해시로 동일 파일 재업로드 경고)';
