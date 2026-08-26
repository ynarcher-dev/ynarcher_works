-- =====================================================================
-- 전자결재 재구축 1단계 — 양식 스키마(타입 필드)·문서함 기반
--
-- 배경
--   기존 전자결재(하이웍스)는 양식이 HTML 한 덩어리라 지출금액 같은 수치가
--   문자열 속 글자로만 존재했고, 집계가 필요할 때마다 사람이 문서를 열어
--   옮겨 적었다. 양식의 정체를 "타입 있는 필드 정의 목록(스키마)"으로 바꾸고
--   문서는 필드별 값(jsonb)을 갖게 한다 — 화면의 결재 문서 표는 스키마+값을
--   렌더러가 그린 결과물일 뿐이다. 값이 타입을 가지므로 프로젝트별 지출 합계
--   같은 집계가 쿼리가 된다.
--
-- 이 마이그레이션이 세우는 것
--   1) 양식 원장 approval_forms + 버전 approval_form_versions
--      · 문서는 기안 시점의 양식 버전을 고정 참조한다(form_version_id).
--        버전을 고정하지 않으면 양식을 고치는 순간 과거 문서가 전부 깨진다.
--      · 버전 행은 불변(UPDATE 정책 없음) — 수정 = 새 버전 발행.
--   2) 문서 확장: field_values jsonb(필드 값) · doc_no(문서 번호) · completed_at
--      · 문서 번호는 "{양식약칭}-{YYMMDD}-{4자리 순번}"(예: 지결-260821-0001).
--        채번은 클라이언트가 아니라 DB 트리거가 소유한다 — 동시 기안에서
--        번호가 겹치지 않아야 하고, 그 보장은 카운터 행 잠금으로만 가능하다.
--      · 대표 금액: 양식 필드 중 primaryAmount 표시가 있는 MONEY/NUMBER 값
--        (TABLE이면 해당 열 합계)을 트리거가 amount 컬럼으로 복사한다.
--        기존 재무 대시보드(예산 대비 실지출)가 amount를 읽으므로 그대로 산다.
--   3) 참조자 approval_recipients(구분 CC) + 열람 확인 approval_reads
--      · 열람 확인은 '확인함' 뱃지(완료됐는데 아직 안 읽음)와 참조자 체크마크의
--        단일 원천이다.
--   4) 문서함 열람 경계 확장: 기존(기안자·결재자·management 게이트)에
--      참조자·같은 부서(부서 문서함)를 더한다. DRAFT는 기안자 본인만 본다.
--   5) 첨부(attachments)·의견(entity_feedback)에 target_type='approval' 분기.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(사용 화면) / 원장 게이트는 기존 그대로
--     management를 유지한다(재무 집계 경로 보존). 양식 원장 쓰기는 admin.
--   · 데이터 등급: Internal(결재 본문·금액). 개인정보 원본 없음(휴가 사유 등은
--     문서 열람 경계 안에서만 보인다).
--   · 접근 주체: 내부 사용자 중 문서 관련자(기안자·결재자·참조자·같은 부서)
--     + management 읽기 권한자 + admin. 외부 게스트 차단(내부 판정 헬퍼 경유).
--   · Scope: 문서 단건(app.can_read_approval) / 부서(department) / self(열람 확인).
--   · 감사 로그: 다운로드·Export·권한 변경 없음. 첨부 다운로드는 기존
--     attachments signed URL 흐름을 그대로 쓴다.
--   · RLS: 신규 테이블 생성 즉시 활성, SELECT/INSERT/UPDATE 분리, DELETE 정책
--     없음(soft delete 또는 불변). 카운터 테이블은 정책 0개(Default Deny,
--     DEFINER 트리거만 접근).
--   · SECURITY DEFINER: 신규 헬퍼는 모두 search_path=app,public 고정 +
--     authenticated 한정 grant. 교차 테이블 판정은 기존 재귀 회피 패턴
--     (20260707130000)과 동일하게 DEFINER 헬퍼로 끊는다.
--   · 시드: 양식 5종(지결·품의·휴가·법카·일반) — 실개인정보·토큰 없음.
-- 근거: 20260705210000_management_schema.sql(원 스키마·정책),
--       20260707130000_approval_rls_recursion_fix.sql(재귀 회피 헬퍼),
--       20260723236000_minute_voice_attachment_scope.sql(attachments 최신 정책),
--       20260731140000_startups_workspace_key.sql(entity_feedback 최신 정책)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (0) enum — 참조자 구분. 지금은 CC(참조)만 쓰고 수신·회람은 필요해질 때
--     값을 추가한다(enum 확장은 값 추가만 가능하므로 미리 좁게 시작).
-- ---------------------------------------------------------------------
do $$ begin create type public.approval_recipient_kind as enum ('CC');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- (1) 양식 원장 + 버전
-- ---------------------------------------------------------------------
create table if not exists public.approval_forms (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,                       -- 양식명(예: 지출결의서)
  abbrev             text not null,                       -- 채번 접두(예: 지결)
  retention          text not null default '영구',        -- 보존 연한 기본값
  security_grade     text not null default 'A등급',       -- 보안 등급 기본값
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  current_version_id uuid,                                -- FK는 버전 테이블 뒤에 연결
  created_by         uuid references public.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
-- 약칭은 문서 번호의 축이므로 살아 있는 양식끼리는 겹치면 안 된다.
create unique index if not exists uq_approval_forms_abbrev
  on public.approval_forms (abbrev) where deleted_at is null;

drop trigger if exists trg_approval_forms_updated_at on public.approval_forms;
create trigger trg_approval_forms_updated_at
  before update on public.approval_forms
  for each row execute function app.set_updated_at();

create table if not exists public.approval_form_versions (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.approval_forms(id) on delete cascade,
  version_no integer not null,
  fields     jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (form_id, version_no)
);

do $$ begin
  alter table public.approval_forms
    add constraint approval_forms_current_version_fkey
    foreign key (current_version_id) references public.approval_form_versions(id);
exception when duplicate_object then null; end $$;

comment on table public.approval_forms is
  '전자결재 양식 원장. abbrev가 문서 번호 채번의 접두. 관리(생성·수정·버전 발행)는 ADMIN 양식 빌더가 담당한다';
comment on column public.approval_form_versions.fields is
  '필드 스키마(jsonb 배열). 각 원소: {key, label, type, required?, options?, primaryAmount?, columns?}. '
  'type ∈ TEXT/TEXTAREA/RICHTEXT/NUMBER/MONEY/DATE/SELECT/TABLE. '
  'TABLE은 columns(같은 형태의 열 정의 배열)를 갖고 값은 행 객체 배열이다. '
  'primaryAmount=true인 MONEY/NUMBER 필드(또는 TABLE 열)가 문서 대표 금액(amount)의 원천이며 '
  'app.approval_primary_amount()가 해석한다. 버전 행은 불변 — 양식 수정은 새 버전 발행이다';

alter table public.approval_forms enable row level security;
alter table public.approval_form_versions enable row level security;

-- 조회: 내부 사용자 전원(기안 화면에서 양식을 골라야 한다). 쓰기: admin(양식 빌더).
drop policy if exists approval_forms_select on public.approval_forms;
create policy approval_forms_select on public.approval_forms for select
  using (app.is_internal_user());
drop policy if exists approval_forms_insert on public.approval_forms;
create policy approval_forms_insert on public.approval_forms for insert
  with check (app.is_admin());
drop policy if exists approval_forms_update on public.approval_forms;
create policy approval_forms_update on public.approval_forms for update
  using (app.is_admin()) with check (app.is_admin());

drop policy if exists approval_form_versions_select on public.approval_form_versions;
create policy approval_form_versions_select on public.approval_form_versions for select
  using (app.is_internal_user());
drop policy if exists approval_form_versions_insert on public.approval_form_versions;
create policy approval_form_versions_insert on public.approval_form_versions for insert
  with check (app.is_admin());
-- UPDATE 정책 없음: 버전은 불변. 과거 문서가 참조하는 스키마를 바꿀 길을 두지 않는다.

-- ---------------------------------------------------------------------
-- (2) 문서 확장
-- ---------------------------------------------------------------------
alter table public.approval_documents
  add column if not exists form_id         uuid references public.approval_forms(id),
  add column if not exists form_version_id uuid references public.approval_form_versions(id),
  add column if not exists field_values    jsonb not null default '{}'::jsonb,
  add column if not exists doc_no          text,
  add column if not exists completed_at    timestamptz;

create unique index if not exists uq_approval_docs_doc_no
  on public.approval_documents (doc_no) where doc_no is not null;
create index if not exists idx_approval_docs_department
  on public.approval_documents (department_id, status);
create index if not exists idx_approval_docs_form
  on public.approval_documents (form_id, status);

comment on column public.approval_documents.field_values is
  '양식 필드 값(jsonb 객체, 필드 key → 값). 스칼라는 문자열/숫자, TABLE은 행 객체 배열. '
  '해석 기준은 form_version_id가 가리키는 버전의 fields 스키마다';
comment on column public.approval_documents.doc_no is
  '문서 번호({약칭}-{YYMMDD}-{4자리}). DRAFT를 벗어나는 순간 트리거가 채번하며 이후 불변';

-- ---------------------------------------------------------------------
-- (3) 채번 카운터 — 정책 0개(Default Deny). DEFINER 트리거만 접근한다.
-- ---------------------------------------------------------------------
create table if not exists public.approval_doc_counters (
  prefix   text not null,
  date_key text not null,          -- YYMMDD(Asia/Seoul)
  last_seq integer not null default 0,
  primary key (prefix, date_key)
);
alter table public.approval_doc_counters enable row level security;
revoke all on public.approval_doc_counters from authenticated, anon;

-- ---------------------------------------------------------------------
-- (4) 대표 금액 해석기 — 스키마와 값을 받아 대표 금액을 계산한다.
--     순수 함수(테이블 접근 없음). 형 변환 실패는 null(집계에서 제외)로 삼킨다 —
--     여기서 예외를 던지면 결재 상신 자체가 막힌다.
-- ---------------------------------------------------------------------
create or replace function app.approval_primary_amount(p_fields jsonb, p_values jsonb)
returns numeric
language plpgsql
stable
set search_path = app, public
as $$
declare
  f jsonb;
  c jsonb;
  v numeric;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return null;
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if (f->>'type') in ('MONEY', 'NUMBER')
       and coalesce((f->>'primaryAmount')::boolean, false) then
      begin
        return nullif(p_values->>(f->>'key'), '')::numeric;
      exception when others then
        return null;
      end;
    elsif (f->>'type') = 'TABLE' and jsonb_typeof(f->'columns') = 'array' then
      for c in select * from jsonb_array_elements(f->'columns') loop
        if (c->>'type') in ('MONEY', 'NUMBER')
           and coalesce((c->>'primaryAmount')::boolean, false) then
          begin
            select sum(nullif(r.value->>(c->>'key'), '')::numeric) into v
              from jsonb_array_elements(coalesce(p_values->(f->>'key'), '[]'::jsonb)) r;
            return v;
          exception when others then
            return null;
          end;
        end if;
      end loop;
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function app.approval_primary_amount(jsonb, jsonb) from public;
grant execute on function app.approval_primary_amount(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- (5) 문서 스탬프 트리거 — 채번·완료 일시·대표 금액을 DB가 소유한다.
--     (동시 기안의 번호 충돌은 카운터 행 잠금으로만 막을 수 있고, 완료 일시와
--      대표 금액을 클라이언트에 맡기면 화면마다 값이 갈린다.)
-- ---------------------------------------------------------------------
create or replace function app.stamp_approval_document()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_prefix text;
  v_date   text;
  v_seq    integer;
  v_fields jsonb;
  v_amount numeric;
begin
  -- 완료 일시: 종결 상태로 처음 들어올 때 찍는다.
  if new.status in ('APPROVED', 'REJECTED') and new.completed_at is null then
    new.completed_at := now();
  end if;

  -- 대표 금액: 양식 버전이 지정된 문서는 필드 값에서 파생한다.
  if new.form_version_id is not null then
    select fields into v_fields
      from public.approval_form_versions where id = new.form_version_id;
    v_amount := app.approval_primary_amount(v_fields, new.field_values);
    if v_amount is not null then
      new.amount := v_amount;
    end if;
  end if;

  -- 채번: DRAFT를 벗어난 문서에 1회만. 이미 번호가 있으면 불변.
  if new.doc_no is null and new.status <> 'DRAFT' and new.form_id is not null then
    select abbrev into v_prefix
      from public.approval_forms where id = new.form_id;
    if v_prefix is not null then
      v_date := to_char(timezone('Asia/Seoul', now()), 'YYMMDD');
      insert into public.approval_doc_counters as c (prefix, date_key, last_seq)
      values (v_prefix, v_date, 1)
      on conflict (prefix, date_key)
        do update set last_seq = c.last_seq + 1
      returning last_seq into v_seq;
      new.doc_no := v_prefix || '-' || v_date || '-' || lpad(v_seq::text, 4, '0');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_approval_documents_stamp on public.approval_documents;
create trigger trg_approval_documents_stamp
  before insert or update on public.approval_documents
  for each row execute function app.stamp_approval_document();

-- ---------------------------------------------------------------------
-- (6) 참조자 + 열람 확인
-- ---------------------------------------------------------------------
create table if not exists public.approval_recipients (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.approval_documents(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  kind        public.approval_recipient_kind not null default 'CC',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (document_id, user_id, kind)
);
create index if not exists idx_approval_recipients_user
  on public.approval_recipients (user_id);

create table if not exists public.approval_reads (
  document_id uuid not null references public.approval_documents(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  read_at     timestamptz not null default now(),
  primary key (document_id, user_id)
);
create index if not exists idx_approval_reads_user
  on public.approval_reads (user_id);

comment on table public.approval_reads is
  '문서 열람 확인. 확인함 뱃지(완료됐는데 미열람)와 참조자 체크마크의 단일 원천. '
  '본인 행만 쓸 수 있고, 표시는 문서 열람 가능자 전원이 본다';

-- ---------------------------------------------------------------------
-- (7) 열람 판정 헬퍼 — 재귀 회피 패턴(20260707130000)과 동일한 DEFINER 헬퍼.
-- ---------------------------------------------------------------------
-- [업무] 현재 요청자가 해당 문서의 참조자인지
create or replace function app.is_approval_recipient(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.approval_recipients r
     where r.document_id = target_document_id
       and r.user_id = app.current_app_user_id()
  );
$$;
revoke all on function app.is_approval_recipient(uuid) from public;
grant execute on function app.is_approval_recipient(uuid) to authenticated;

-- [기저] 현재 요청자의 소속 부서(users.department_id 미러 = 오늘의 유효 배치)
create or replace function app.current_department_id()
returns uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select u.department_id
    from public.users u
   where u.id = app.current_app_user_id();
$$;
revoke all on function app.current_department_id() from public;
grant execute on function app.current_department_id() to authenticated;

-- [업무] 문서 열람 가능 여부 — 첨부·의견·결재선·참조자 등 부속 테이블 RLS가
--        전부 이 판정 하나에 위임한다(경계를 한 곳으로 모은다).
--        DRAFT는 기안자 본인만: 상신 전 문서는 아직 조직의 문서가 아니다.
create or replace function app.can_read_approval(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or app.can_read_workspace('management')
      or exists (
           select 1
             from public.approval_documents d
            where d.id = target_document_id
              and d.deleted_at is null
              and (
                d.drafter_id = app.current_app_user_id()
                or (
                  d.status <> 'DRAFT'
                  and (
                    app.is_approval_approver(target_document_id)
                    or app.is_approval_recipient(target_document_id)
                    or (d.department_id is not null
                        and d.department_id = app.current_department_id())
                  )
                )
              )
         );
$$;
revoke all on function app.can_read_approval(uuid) from public;
grant execute on function app.can_read_approval(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (8) 문서·결재선 SELECT 정책 확장 (INSERT/UPDATE는 기존 유지 —
--     승인/반려 처리의 RPC 일원화는 다음 단계에서 다룬다)
-- ---------------------------------------------------------------------
drop policy if exists approval_docs_select on public.approval_documents;
create policy approval_docs_select on public.approval_documents for select
  using (
    app.can_read_workspace('management')
    or drafter_id = app.current_app_user_id()
    or (
      status <> 'DRAFT'
      and (
        app.is_approval_approver(id)
        or app.is_approval_recipient(id)
        or (department_id is not null
            and department_id = app.current_department_id())
      )
    )
  );

-- 결재선(도장 표)은 문서를 볼 수 있으면 함께 본다.
drop policy if exists approval_lines_select on public.approval_lines;
create policy approval_lines_select on public.approval_lines for select
  using (
    approver_id = app.current_app_user_id()
    or app.can_read_approval(document_id)
  );

-- 참조자 명단: 열람 = 문서 열람과 동일 / 지정 = 기안자(또는 management 쓰기).
alter table public.approval_recipients enable row level security;
drop policy if exists approval_recipients_select on public.approval_recipients;
create policy approval_recipients_select on public.approval_recipients for select
  using (
    user_id = app.current_app_user_id()
    or app.can_read_approval(document_id)
  );
drop policy if exists approval_recipients_insert on public.approval_recipients;
create policy approval_recipients_insert on public.approval_recipients for insert
  with check (
    app.can_write_workspace('management')
    or app.is_approval_drafter(document_id)
  );
-- UPDATE/DELETE 정책 없음: 명단 정정은 후속 단계의 기안 편집 RPC가 담당한다.

-- 열람 확인: 쓰기는 본인 행만, 표시는 문서 열람 가능자 전원.
alter table public.approval_reads enable row level security;
drop policy if exists approval_reads_select on public.approval_reads;
create policy approval_reads_select on public.approval_reads for select
  using (
    user_id = app.current_app_user_id()
    or app.can_read_approval(document_id)
  );
drop policy if exists approval_reads_insert on public.approval_reads;
create policy approval_reads_insert on public.approval_reads for insert
  with check (
    user_id = app.current_app_user_id()
    and app.can_read_approval(document_id)
  );
drop policy if exists approval_reads_update on public.approval_reads;
create policy approval_reads_update on public.approval_reads for update
  using (user_id = app.current_app_user_id())
  with check (user_id = app.current_app_user_id());

-- ---------------------------------------------------------------------
-- (9) 첨부 정책 — target_type='approval'을 문서 열람 경계에 종속
--     (최신 정책 20260723236000의 본문을 보존하고 approval 가드만 더한다)
-- ---------------------------------------------------------------------
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select
  using (
    app.is_admin()
    or (
      app.current_app_user_id() is not null
      and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest')
      and (
        target_type not in ('office_minute', 'office_minute_voice')
        or app.can_read_minute(target_id)
      )
      and (target_type <> 'approval' or app.can_read_approval(target_id))
    )
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert
  with check (
    uploaded_by = app.current_app_user_id()
    and app.current_app_user_id() is not null
    and (
      target_type not in ('office_minute', 'office_minute_voice')
      or app.is_minute_author(target_id)
    )
    and (target_type <> 'approval' or app.is_approval_drafter(target_id))
  );

-- ---------------------------------------------------------------------
-- (10) 의견(entity_feedback) 정책 — approval 분기 추가
--      (최신 정책 20260731140000의 본문을 보존하고 approval 분기만 더한다.
--       결재 문서의 의견은 워크스페이스가 아니라 문서 열람 권한으로 갈린다 —
--       board_post·office_minute와 같은 판단이다)
-- ---------------------------------------------------------------------
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when target_type = 'approval'
        then app.can_read_approval(target_id)
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) in ('networks', 'startup')
        then app.can_read_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_read_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_read_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert
  with check (
    case
      when target_type = 'approval'
        then app.can_read_approval(target_id)
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) in ('networks', 'startup')
        then app.can_write_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_write_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

-- ---------------------------------------------------------------------
-- (11) 양식 시드 5종 — 하이웍스 실사용 양식을 초기 스키마로 옮긴다.
--      재실행 안전: 약칭 기준으로 없을 때만 만들고, 버전 1도 없을 때만 발행.
-- ---------------------------------------------------------------------
do $$
declare
  r      record;
  v_form uuid;
  v_ver  uuid;
begin
  for r in
    select * from (values
      ('지출결의서', '지결', '[
        {"key":"body","label":"내용","type":"RICHTEXT"},
        {"key":"expense_items","label":"지출 내역","type":"TABLE","columns":[
          {"key":"item","label":"항목","type":"TEXT"},
          {"key":"amount","label":"금액","type":"MONEY","primaryAmount":true}
        ]},
        {"key":"account","label":"계정과목","type":"TEXT"},
        {"key":"purpose","label":"사용목적","type":"TEXT"}
      ]'::jsonb),
      ('품의서', '품의', '[
        {"key":"body","label":"내용","type":"RICHTEXT"},
        {"key":"amount","label":"품의 금액","type":"MONEY","primaryAmount":true}
      ]'::jsonb),
      ('휴가신청서', '휴가', '[
        {"key":"leave_type","label":"휴가 구분","type":"SELECT","required":true,
         "options":["연차","반차","생일반차","경조","기타"]},
        {"key":"start_date","label":"시작일","type":"DATE","required":true},
        {"key":"end_date","label":"종료일","type":"DATE","required":true},
        {"key":"days","label":"일수","type":"NUMBER"},
        {"key":"reason","label":"사유","type":"TEXT"}
      ]'::jsonb),
      ('법인카드 지출결의서', '법카', '[
        {"key":"body","label":"내용","type":"RICHTEXT"},
        {"key":"expense_items","label":"사용 내역","type":"TABLE","columns":[
          {"key":"item","label":"사용처","type":"TEXT"},
          {"key":"amount","label":"금액","type":"MONEY","primaryAmount":true}
        ]},
        {"key":"account","label":"계정과목","type":"TEXT"}
      ]'::jsonb),
      ('일반결재', '일반', '[
        {"key":"body","label":"내용","type":"RICHTEXT"}
      ]'::jsonb)
    ) as t(name, abbrev, fields)
  loop
    select id into v_form
      from public.approval_forms
     where abbrev = r.abbrev and deleted_at is null;
    if v_form is null then
      insert into public.approval_forms (name, abbrev, sort_order)
      values (r.name, r.abbrev, 0)
      returning id into v_form;
    end if;

    select id into v_ver
      from public.approval_form_versions
     where form_id = v_form and version_no = 1;
    if v_ver is null then
      insert into public.approval_form_versions (form_id, version_no, fields)
      values (v_form, 1, r.fields)
      returning id into v_ver;
    end if;

    update public.approval_forms
       set current_version_id = v_ver
     where id = v_form and current_version_id is null;
  end loop;
end $$;
