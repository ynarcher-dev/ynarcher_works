-- =====================================================================
-- FUND 투자방식 기준정보 태그 (ADMIN 관리): investment_method_tags
-- - 포트폴리오 투자 건의 투자방식(investments.investment_method) 컬럼에 넣을 값을
--   ADMIN에서 태그로 관리(보통주/CPS/RCPS/CB/BW 등). 값 저장은 태그명 text(라운드·산업과 동일 패턴).
-- - 기존 스타트업 풀 태그 3종(20260710130000)·category_tags와 완전히 동일한 구조/정책:
--   · 열람 = 내부 사용자 전체, 쓰기(추가/수정/소프트삭제) = 관리자(app.is_admin())만.
--   · id/name/sort_order/created_by/created_at/updated_at/deleted_at + 미삭제 이름 유니크 + 정렬 인덱스.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · 신규 테이블 1종: RLS enable + Default Deny(정책 없는 동작은 거부) + select/insert/update 정책 명시.
--   · 신규 RPC/SECURITY DEFINER/Storage 정책 없음. 개인정보·다운로드·Export 영향 없음.
-- 근거: 20260710130000_startup_pool_tags.sql(동일 구조 원본), 3_5_workspace_fund.md §2.3(투자방식),
--       app.set_updated_at()/app.is_admin()/app.current_app_user_id() 헬퍼.
-- =====================================================================

create table if not exists public.investment_method_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists uq_investment_method_tags_name
  on public.investment_method_tags (name) where deleted_at is null;
create index if not exists idx_investment_method_tags_sort
  on public.investment_method_tags (sort_order, name);
drop trigger if exists trg_investment_method_tags_updated_at on public.investment_method_tags;
create trigger trg_investment_method_tags_updated_at before update on public.investment_method_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람=내부 사용자 전체, 쓰기=관리자만 (기존 태그 원장과 동일) --------------
alter table public.investment_method_tags enable row level security;
drop policy if exists investment_method_tags_select on public.investment_method_tags;
create policy investment_method_tags_select on public.investment_method_tags for select
  using (app.current_app_user_id() is not null);
drop policy if exists investment_method_tags_insert on public.investment_method_tags;
create policy investment_method_tags_insert on public.investment_method_tags for insert
  with check (app.is_admin());
drop policy if exists investment_method_tags_update on public.investment_method_tags;
create policy investment_method_tags_update on public.investment_method_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 시드(관리자가 자유롭게 수정/삭제/추가 가능한 초기값) ---------------------
insert into public.investment_method_tags (name, sort_order) values
  ('보통주', 1), ('CPS', 2), ('RCPS', 3), ('CB', 4), ('BW', 5)
on conflict do nothing;
