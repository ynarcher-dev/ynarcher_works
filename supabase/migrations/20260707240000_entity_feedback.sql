-- =====================================================================
-- [Phase 6] 피드백(레코드 단위 댓글형) 데이터 계층
-- - 상세페이지 우측 '피드백' 패널의 게시판 댓글형 스레드.
-- - target_type/target_id로 네트워크 레코드를 다형 참조(자료 관리 attachments와 동일 규약).
-- - 작성자명 비정규화(author_name): users RLS(본인/admin만 조회)에 막히지 않도록 서버 스탬프.
-- - 소프트 삭제(deleted_at)만 허용, 물리 삭제 금지. 작성자 또는 admin만 삭제/수정.
-- 근거: 20260707150000_networks_contributions.sql(스탬프/RLS 패턴),
--       20260705120300_support_tables.sql(attachments 다형 규약), 20260705120200_rls_helpers.sql
-- =====================================================================

create table if not exists public.entity_feedback (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null,                      -- 'expert'|'investor'|'global_network'|...(다형)
  target_id    uuid not null,
  author_id    uuid references public.users(id),   -- 작성자(actor)
  author_name  text,                               -- 작성자명 비정규화(users RLS 우회 표시용, 트리거 스탬프)
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_entity_feedback_target
  on public.entity_feedback (target_type, target_id, created_at);

alter table public.entity_feedback enable row level security;

-- 조회: networks 읽기 권한자. 작성: networks 쓰기 권한자.
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (app.can_read_workspace('networks'));

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert
  with check (app.can_write_workspace('networks'));

-- 수정/삭제(소프트): 작성자 본인 또는 admin만.
drop policy if exists entity_feedback_update on public.entity_feedback;
create policy entity_feedback_update on public.entity_feedback for update
  using (app.is_admin() or author_id = app.current_app_user_id())
  with check (app.is_admin() or author_id = app.current_app_user_id());

-- updated_at 트리거 ------------------------------------------------------
drop trigger if exists trg_entity_feedback_updated_at on public.entity_feedback;
create trigger trg_entity_feedback_updated_at
  before update on public.entity_feedback
  for each row execute function app.set_updated_at();

-- 작성자 자동 스탬프(클라이언트가 안 넘겨도 서버가 현재 앱 유저로 채운다) ----------
create or replace function app.stamp_feedback_author()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.author_id is null then
    NEW.author_id := app.current_app_user_id();
  end if;
  -- 이름 비정규화: users RLS(본인/admin만 조회)에 막히지 않도록 여기서 채운다(SECURITY DEFINER).
  if NEW.author_name is null and NEW.author_id is not null then
    select u.name into NEW.author_name from public.users u where u.id = NEW.author_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_entity_feedback_author on public.entity_feedback;
create trigger trg_entity_feedback_author
  before insert on public.entity_feedback
  for each row execute function app.stamp_feedback_author();

comment on table public.entity_feedback is '네트워크 레코드 단위 피드백(댓글형 스레드). target_type/target_id 다형 참조, 소프트 삭제';
