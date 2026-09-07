-- =====================================================================
-- M&A 프로젝트 ↔ BUYER·SELLER 매물 매핑
--
-- BUYER·SELLER는 프로젝트보다 먼저 쌓이는 독립 원장이고 한 매물이 여러 프로젝트 후보가 될 수
-- 있으므로 FK 한 칸이 아니라 다대다 링크로 둔다. 두 원장의 물리 테이블이 갈라져 있어 링크도
-- buyer_id/seller_id 중 정확히 하나만 채우는 모양으로 만든다 — 다형 id 하나로 합치면 DB가
-- 원본 존재 여부를 FK로 보장할 수 없다.
--
-- 저장 RPC는 프로젝트의 현재 사업구분을 읽어 SELL이면 SELLER만, BUY면 BUYER만 받고,
-- SELL_BUY이면 양쪽을 각각 받는다. 그 밖의 구분(PE_FUND/ETC/미지정)은 빈 목록만 허용한다.
-- 전량 교체를 한 트랜잭션에서 수행해
-- 일부만 연결되거나 옛 구분의 링크가 남는 상태를 만들지 않는다.
-- =====================================================================

alter table public.ma_programs
  drop constraint if exists ma_programs_category_check;
alter table public.ma_programs
  add constraint ma_programs_category_check
  check (category is null or category in ('SELL', 'BUY', 'SELL_BUY', 'PE_FUND', 'ETC'));

comment on column public.ma_programs.category is
  '사업구분: SELL(매도)/BUY(매수)/SELL_BUY(매도+매수)/PE_FUND/ETC. null=미지정.';

create table if not exists public.ma_program_party_links (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.ma_programs(id) on delete cascade,
  buyer_id    uuid references public.ma_buyers(id),
  seller_id   uuid references public.ma_sellers(id),
  created_by  uuid references public.users(id) default app.current_app_user_id(),
  created_at  timestamptz not null default now(),
  constraint ma_program_party_links_one_party_chk
    check (num_nonnulls(buyer_id, seller_id) = 1),
  constraint ma_program_party_links_buyer_uniq unique (program_id, buyer_id),
  constraint ma_program_party_links_seller_uniq unique (program_id, seller_id)
);

create index if not exists idx_ma_program_party_links_buyer
  on public.ma_program_party_links (buyer_id) where buyer_id is not null;
create index if not exists idx_ma_program_party_links_seller
  on public.ma_program_party_links (seller_id) where seller_id is not null;

comment on table public.ma_program_party_links is
  'M&A 프로젝트↔거래상대 매물 다대다 링크. buyer_id/seller_id 중 하나만 채우며 현재 사업구분과 맞는 원장은 set_ma_program_party_links가 강제한다.';

-- 사업구분을 바꾸면 새 구분에서 의미가 없는 연결은 즉시 걷는다. 매핑 UI가 상세 탭으로
-- 이동했으므로 편집 폼이 링크 목록을 다시 저장하지 않아도 원장과 사업구분이 어긋나지 않는다.
create or replace function app.prune_ma_program_party_links()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $$
begin
  if new.category = 'SELL' then
    delete from public.ma_program_party_links
     where program_id = new.id and buyer_id is not null;
  elsif new.category = 'BUY' then
    delete from public.ma_program_party_links
     where program_id = new.id and seller_id is not null;
  elsif new.category is distinct from 'SELL_BUY' then
    delete from public.ma_program_party_links where program_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function app.prune_ma_program_party_links() from public;

drop trigger if exists trg_ma_programs_prune_party_links on public.ma_programs;
create trigger trg_ma_programs_prune_party_links
  after update of category on public.ma_programs
  for each row
  when (old.category is distinct from new.category)
  execute function app.prune_ma_program_party_links();

alter table public.ma_program_party_links enable row level security;

drop policy if exists ma_program_party_links_select on public.ma_program_party_links;
create policy ma_program_party_links_select on public.ma_program_party_links for select
  using (
    app.can_read_workspace('mna')
    and app.can_access_ws_program('mna', program_id)
  );

-- 직접 쓰기 경로는 열지 않는다. 사업구분 판정과 전량 교체를 RPC 하나가 맡는다.
--
-- 스키마는 `public`이다. PostgREST가 노출하는 스키마가 그것뿐이라, 화면이 부르는 RPC를
-- `app`에 두면 배포된 순간 404가 된다(`supabase.rpc()`는 언제나 public을 찾는다). 자체 인가를
-- 첫머리에서 하는 DEFINER라는 점은 그대로다.

create or replace function public.set_ma_program_party_links(
  p_program_id uuid,
  p_buyer_ids uuid[] default '{}'::uuid[],
  p_seller_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $$
declare
  v_category text;
  v_buyer_ids uuid[];
  v_seller_ids uuid[];
begin
  if not app.can_write_workspace('mna')
     or not app.can_access_ws_program('mna', p_program_id) then
    raise exception 'M&A 프로젝트 매물 연결 권한이 없습니다.' using errcode = '42501';
  end if;

  select category
    into v_category
    from public.ma_programs
   where id = p_program_id;

  if not found then
    raise exception 'M&A 프로젝트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_buyer_ids
    from unnest(coalesce(p_buyer_ids, '{}'::uuid[])) as x
   where x is not null;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_seller_ids
    from unnest(coalesce(p_seller_ids, '{}'::uuid[])) as x
   where x is not null;

  if v_category = 'SELL' and cardinality(v_buyer_ids) > 0 then
    raise exception 'Sell 프로젝트에는 M&A SELLER 매물만 연결할 수 있습니다.' using errcode = '23514';
  elsif v_category = 'BUY' and cardinality(v_seller_ids) > 0 then
    raise exception 'Buy 프로젝트에는 M&A BUYER 매물만 연결할 수 있습니다.' using errcode = '23514';
  elsif v_category not in ('SELL', 'BUY', 'SELL_BUY')
        and (cardinality(v_buyer_ids) > 0 or cardinality(v_seller_ids) > 0) then
    raise exception 'Sell, Buy 또는 Sell+Buy 프로젝트만 매물을 연결할 수 있습니다.' using errcode = '23514';
  end if;

  if exists (
    select 1
      from unnest(v_seller_ids) id
     where not exists (
       select 1 from public.ma_sellers s where s.id = id and s.deleted_at is null
     )
  ) then
    raise exception '연결할 수 없는 M&A SELLER 매물이 포함되어 있습니다.' using errcode = '23503';
  end if;

  if exists (
    select 1
      from unnest(v_buyer_ids) id
     where not exists (
       select 1 from public.ma_buyers b where b.id = id and b.deleted_at is null
     )
  ) then
    raise exception '연결할 수 없는 M&A BUYER 매물이 포함되어 있습니다.' using errcode = '23503';
  end if;

  delete from public.ma_program_party_links where program_id = p_program_id;

  if v_category in ('SELL', 'SELL_BUY') then
    insert into public.ma_program_party_links (program_id, seller_id)
    select p_program_id, id from unnest(v_seller_ids) id;
  end if;
  if v_category in ('BUY', 'SELL_BUY') then
    insert into public.ma_program_party_links (program_id, buyer_id)
    select p_program_id, id from unnest(v_buyer_ids) id;
  end if;
end;
$$;

revoke all on function public.set_ma_program_party_links(uuid, uuid[], uuid[]) from public;
grant execute on function public.set_ma_program_party_links(uuid, uuid[], uuid[]) to authenticated;

comment on function public.set_ma_program_party_links(uuid, uuid[], uuid[]) is
  'M&A 프로젝트 사업구분에 맞춰 SELLER·BUYER 매물 링크를 각각 받아 원자적으로 전량 교체한다.';

grant select on public.ma_program_party_links to authenticated;
