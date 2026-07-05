-- =====================================================================
-- [Phase 9] M&A 워크스페이스 스키마
-- ma_deals(칸반) → ma_deal_stage_logs(타임라인) / ma_deal_documents(NDA 체크리스트)
--                → ma_match_candidates(매수/매도 매칭)
-- 엄격한 부서 격리: M&A 권한(mna) 보유자 + 최고 관리자 외 전면 차단(RLS Default Deny).
--   → 타 부서(ac_business/fund_manager/project_manager)는 mna 권한 템플릿이 없어 자동 차단.
-- 근거: docs_planning/3_6_workspace_ma.md, docs_dev/3_database_rls_policy_matrix.md §부서 격리
-- =====================================================================

-- 딜 진행 단계: 소싱 → 예비 실사 → 정밀 실사 → 조건 협상 → 계약 → 완료/무산
do $$ begin create type public.ma_deal_stage as enum
  ('SOURCING','PRE_DD','DD','NEGOTIATION','CLOSING','COMPLETED','ABORTED');
exception when duplicate_object then null; end $$;

-- 보안 문서 유형(NDA 체크리스트)
do $$ begin create type public.ma_document_type as enum
  ('NDA','MOU','SHAREHOLDER_CONSENT','DD_REPORT','OTHER');
exception when duplicate_object then null; end $$;

create table if not exists public.ma_deals (
  id                uuid primary key default gen_random_uuid(),
  deal_name         text not null,
  target_company_id uuid references public.startups(id),  -- 딜 대상 기업(NETWORKS 연동)
  target_name       text,                                  -- 마스터 미등록 시 임시 표기
  stage             public.ma_deal_stage not null default 'SOURCING',
  lead_manager_id   uuid references public.users(id),      -- 담당 M&A 심사역
  estimated_value   numeric(18,2),                         -- 거래 추정 가액
  on_hold           boolean not null default false,        -- 보류 경고 배지
  note              text,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists idx_ma_deals_stage on public.ma_deals (stage);
create index if not exists idx_ma_deals_target on public.ma_deals (target_company_id);

-- 단계 전환 타임라인 로그(이력 분석) --------------------------------------
create table if not exists public.ma_deal_stage_logs (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references public.ma_deals(id) on delete cascade,
  from_stage public.ma_deal_stage,
  to_stage   public.ma_deal_stage not null,
  changed_by uuid references public.users(id),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ma_stage_logs_deal on public.ma_deal_stage_logs (deal_id, created_at desc);

-- 보안 문서 체크리스트(NDA/MOU/실사 의견서) -------------------------------
create table if not exists public.ma_deal_documents (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.ma_deals(id) on delete cascade,
  doc_type      public.ma_document_type not null,
  title         text not null,
  attachment_id uuid references public.attachments(id),  -- 업로드 파일(직접 접근 금지)
  is_reviewed   boolean not null default false,          -- [검토 완료] 잠금 처리
  reviewed_by   uuid references public.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_ma_documents_deal on public.ma_deal_documents (deal_id);

-- 매수/매도 매칭 후보(적합도 스코어 저장) ---------------------------------
create table if not exists public.ma_match_candidates (
  id                uuid primary key default gen_random_uuid(),
  buyer_company_id  uuid references public.startups(id),   -- 인수 희망 기업(Buyer)
  buyer_name        text,
  seller_company_id uuid references public.startups(id),   -- 매각 희망 기업(Seller)
  seller_name       text,
  target_industry   text,                                   -- 매수 측 희망 업종
  max_amount        numeric(18,2),                          -- 희망 인수 금액 상한선
  keywords          text,                                   -- 인수 목적 키워드
  fit_score         numeric(5,2) not null default 0,        -- 적합도 백분율
  deal_id           uuid references public.ma_deals(id),    -- 딜 인계 시 연결
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now()
);
create index if not exists idx_ma_match_score on public.ma_match_candidates (fit_score desc);

-- updated_at 트리거 --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ma_deals','ma_deal_documents'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- RLS: M&A 부서 격리 (can_read/write_workspace('mna') 게이트) -------------
-- 자식 테이블은 상위(ma_deals)에서 스코프가 강제되므로 워크스페이스 게이트로 통제.
do $$
declare
  t         text;
  sel_expr  text;
  wr_expr   text;
  mna_tables text[] := array[
    'ma_deals','ma_deal_stage_logs','ma_deal_documents','ma_match_candidates'
  ];
begin
  sel_expr := 'app.can_read_workspace(''mna'')';
  wr_expr  := 'app.can_write_workspace(''mna'')';
  foreach t in array mna_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_mna_select', t);
    execute format('create policy %I on public.%I for select using (%s)', t||'_mna_select', t, sel_expr);
    execute format('drop policy if exists %I on public.%I', t||'_mna_insert', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t||'_mna_insert', t, wr_expr);
    execute format('drop policy if exists %I on public.%I', t||'_mna_update', t);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t||'_mna_update', t, wr_expr, wr_expr);
  end loop;
end $$;

-- 단계 전환 시 타임라인 로그 자동 기록 트리거 -----------------------------
create or replace function app.log_ma_stage_change()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into public.ma_deal_stage_logs (deal_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, app.current_app_user_id());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ma_deals_stage_log on public.ma_deals;
create trigger trg_ma_deals_stage_log after update on public.ma_deals
  for each row execute function app.log_ma_stage_change();
