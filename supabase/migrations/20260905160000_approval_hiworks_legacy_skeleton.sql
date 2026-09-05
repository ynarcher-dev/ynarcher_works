-- =====================================================================
-- 하이웍스 전자결재 복원 원장 뼈대
--
-- 보안 게이트
--   · 소유 워크스페이스: office / management
--   · 데이터 등급: Restricted + Personal
--   · 접근 주체: 현재 문서를 읽을 수 있는 내부 사용자, 본인 매핑, 관리자
--   · Scope: document participant / department / management global
--   · 적재 주체: 서버 import job(service_role) 전용. 클라이언트 쓰기 권한 없음.
--   · 삭제: 원본 복원 원장은 append-only. DELETE 정책과 클라이언트 권한 없음.
--   · 원본 파일 다운로드/대량 Export 감사 로그는 후속 import API에서 강제한다.
--
-- 53,000건 이상을 전제로 운영 전자결재 원장과 원본 보존 원장을 분리한다.
-- approval_documents가 현재 화면·권한의 기준이고, 아래 표들은 원본 식별자,
-- 렌더링 HTML, 과거 사용자 스냅샷, 이벤트와 미해결 관계를 손실 없이 보존한다.
-- =====================================================================

-- 한 번의 백업 파일/디렉터리 적재 단위. 원본 아카이브 자체는 private Storage에 두고
-- 이 표에는 경로와 체크섬만 기록한다. 원본 raw import 보존·파기는 운영 기준을 따른다.
create table if not exists public.approval_legacy_import_batches (
  id                       uuid primary key default gen_random_uuid(),
  source_system            text not null default 'HIWORKS'
                               check (source_system <> ''),
  source_file_name         text not null,
  source_archive_path      text,
  source_archive_sha256    text
                               check (source_archive_sha256 is null or source_archive_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  source_metadata          jsonb not null default '{}'::jsonb
                               check (jsonb_typeof(source_metadata) = 'object'),
  expected_document_count  bigint not null default 0 check (expected_document_count >= 0),
  imported_document_count  bigint not null default 0 check (imported_document_count >= 0),
  failed_document_count    bigint not null default 0 check (failed_document_count >= 0),
  status                   text not null default 'PENDING'
                               check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  started_at               timestamptz,
  completed_at             timestamptz,
  created_by               uuid references public.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  check (imported_document_count + failed_document_count <= expected_document_count
         or expected_document_count = 0)
);
create unique index if not exists uq_approval_legacy_batch_archive_sha
  on public.approval_legacy_import_batches (source_system, source_archive_sha256)
  where source_archive_sha256 is not null and deleted_at is null;
create index if not exists idx_approval_legacy_batches_status
  on public.approval_legacy_import_batches (status, created_at desc)
  where deleted_at is null;

drop trigger if exists trg_approval_legacy_batches_updated_at
  on public.approval_legacy_import_batches;
create trigger trg_approval_legacy_batches_updated_at
  before update on public.approval_legacy_import_batches
  for each row execute function app.set_updated_at();

-- 계정이 없어도 과거 표시 이름을 잃지 않는 행위자 원장.
-- source_actor_key는 importer가 사용자 번호, 프로필 번호, 이름/소속 조합 등으로 만드는
-- 소스 내 결정적 키다. 이름 자체에는 unique를 걸지 않는다.
create table if not exists public.approval_legacy_actors (
  id                    uuid primary key default gen_random_uuid(),
  source_system         text not null default 'HIWORKS' check (source_system <> ''),
  source_actor_key      text not null check (source_actor_key <> ''),
  source_user_no        text,
  profile_reference     text,
  original_name         text not null check (original_name <> ''),
  original_department   text,
  original_position     text,
  source_metadata       jsonb not null default '{}'::jsonb
                            check (jsonb_typeof(source_metadata) = 'object'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (source_system, source_actor_key)
);
create index if not exists idx_approval_legacy_actors_user_no
  on public.approval_legacy_actors (source_system, source_user_no)
  where source_user_no is not null and deleted_at is null;
create index if not exists idx_approval_legacy_actors_name
  on public.approval_legacy_actors (original_name)
  where deleted_at is null;

drop trigger if exists trg_approval_legacy_actors_updated_at
  on public.approval_legacy_actors;
create trigger trg_approval_legacy_actors_updated_at
  before update on public.approval_legacy_actors
  for each row execute function app.set_updated_at();

-- 이메일은 같은 문서 참여자에게 노출할 필요가 없는 개인정보이므로 actor 원장과 분리한다.
-- 한 사람이 이름 변경 등으로 여러 legacy actor가 될 수 있어 이메일에는 unique를 강제하지 않는다.
create table if not exists public.approval_legacy_actor_mappings (
  actor_id          uuid primary key references public.approval_legacy_actors(id),
  normalized_email  text check (
                      normalized_email is null
                      or normalized_email = lower(btrim(normalized_email))
                    ),
  mapped_user_id    uuid references public.users(id),
  mapping_status    text not null default 'UNMATCHED'
                         check (mapping_status in ('UNMATCHED', 'REVIEW', 'MATCHED')),
  mapping_method    text,
  confidence        numeric(5,4) check (confidence is null or confidence between 0 and 1),
  verified_by       uuid references public.users(id),
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  check (mapping_status <> 'MATCHED' or mapped_user_id is not null)
);
create index if not exists idx_approval_legacy_actor_mappings_email
  on public.approval_legacy_actor_mappings (normalized_email)
  where normalized_email is not null and deleted_at is null;
create index if not exists idx_approval_legacy_actor_mappings_user
  on public.approval_legacy_actor_mappings (mapped_user_id)
  where mapped_user_id is not null and deleted_at is null;

drop trigger if exists trg_approval_legacy_actor_mappings_updated_at
  on public.approval_legacy_actor_mappings;
create trigger trg_approval_legacy_actor_mappings_updated_at
  before update on public.approval_legacy_actor_mappings
  for each row execute function app.set_updated_at();

-- 현재 문서와 1:1인 하이웍스 원본 스냅샷. 현재 deleted_at과 source_deleted_at은
-- 의도적으로 분리한다. 하이웍스에서 삭제된 문서도 복원 후에는 현재 화면에서 읽혀야 한다.
create table if not exists public.approval_legacy_documents (
  document_id              uuid primary key references public.approval_documents(id),
  import_batch_id          uuid not null references public.approval_legacy_import_batches(id),
  source_system            text not null default 'HIWORKS' check (source_system <> ''),
  source_document_no       text not null check (source_document_no <> ''),
  source_document_code     text,
  source_basic_info_no     text,
  source_form_no           text,
  source_status            text,
  source_document_type     text,
  source_approval_method   text,
  source_office_user_no    text,
  source_department_box    text,
  original_title           text not null,
  original_drafter_name    text not null,
  original_drafter_position text,
  original_department_name text,
  original_department_path text,
  source_department_id     text,
  source_form_title        text,
  source_form_category     text,
  source_form_abbrev       text,
  source_retention         text,
  source_security_level    text,
  source_registered_at     timestamptz,
  source_completed_at      timestamptz,
  source_was_deleted       boolean not null default false,
  source_deleted_at        timestamptz,
  content_html             text,
  content_text             text,
  approval_line_snapshot   jsonb not null default '{}'::jsonb
                               check (jsonb_typeof(approval_line_snapshot) = 'object'),
  print_snapshot           jsonb not null default '{}'::jsonb
                               check (jsonb_typeof(print_snapshot) = 'object'),
  source_metadata          jsonb not null default '{}'::jsonb
                               check (jsonb_typeof(source_metadata) = 'object'),
  source_row_no            bigint check (source_row_no is null or source_row_no >= 0),
  source_row_sha256        text
                               check (source_row_sha256 is null or source_row_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  imported_at              timestamptz not null default now(),
  unique (source_system, source_document_no)
);
create index if not exists idx_approval_legacy_documents_batch
  on public.approval_legacy_documents (import_batch_id, source_row_no);
create index if not exists idx_approval_legacy_documents_form
  on public.approval_legacy_documents (source_system, source_form_no)
  where source_form_no is not null;
create index if not exists idx_approval_legacy_documents_code
  on public.approval_legacy_documents (source_system, source_document_code)
  where source_document_code is not null;
create index if not exists idx_approval_legacy_documents_deleted
  on public.approval_legacy_documents (source_deleted_at)
  where source_was_deleted;

-- 최종 결재선 HTML에서 파싱한 참여자. 원본 이름/직급/부서는 actor의 현재 매핑과
-- 무관하게 문서 작성 당시 스냅샷으로 다시 적는다.
create table if not exists public.approval_legacy_participants (
  id                       uuid primary key default gen_random_uuid(),
  document_id              uuid not null references public.approval_legacy_documents(document_id),
  actor_id                 uuid references public.approval_legacy_actors(id),
  source_participant_key   text,
  source_role              text,
  normalized_role          text check (
                             normalized_role is null
                             or normalized_role in (
                               'DRAFTER', 'APPROVER', 'AGREEMENT', 'FINANCE_AGREEMENT',
                               'CC', 'CONFIRMER', 'OTHER'
                             )
                           ),
  source_line_section      text,
  step_order               integer check (step_order is null or step_order >= 0),
  source_decision          text,
  normalized_decision      text check (
                             normalized_decision is null
                             or normalized_decision in ('PENDING', 'APPROVED', 'REJECTED', 'CONFIRMED')
                           ),
  decided_at               timestamptz,
  original_name            text not null check (original_name <> ''),
  original_department      text,
  original_position        text,
  parsing_confidence       numeric(5,4)
                               check (parsing_confidence is null or parsing_confidence between 0 and 1),
  source_metadata          jsonb not null default '{}'::jsonb
                               check (jsonb_typeof(source_metadata) = 'object'),
  created_at               timestamptz not null default now()
);
create unique index if not exists uq_approval_legacy_participant_source_key
  on public.approval_legacy_participants (document_id, source_participant_key)
  where source_participant_key is not null;
create index if not exists idx_approval_legacy_participants_document
  on public.approval_legacy_participants (document_id, normalized_role, step_order);
create index if not exists idx_approval_legacy_participants_actor
  on public.approval_legacy_participants (actor_id, document_id)
  where actor_id is not null;

-- 현재와 과거 문서 모두 사용할 수 있는 append-only 이벤트 원장.
-- 하이웍스의 기안/승인/확인/본문 수정/결재선 수정/관리자 삭제를 그대로 담는다.
create table if not exists public.approval_document_events (
  id                   uuid primary key default gen_random_uuid(),
  document_id          uuid not null references public.approval_documents(id),
  source_system        text not null default 'NATIVE' check (source_system <> ''),
  source_event_id      text,
  source_sequence      integer check (source_sequence is null or source_sequence >= 0),
  event_type           text not null check (event_type <> ''),
  source_event_type    text,
  actor_user_id        uuid references public.users(id),
  legacy_actor_id      uuid references public.approval_legacy_actors(id),
  actor_name_snapshot  text,
  title_snapshot       text,
  comment_snapshot     text,
  occurred_at          timestamptz not null,
  source_payload       jsonb not null default '{}'::jsonb
                           check (jsonb_typeof(source_payload) = 'object'),
  created_at           timestamptz not null default now()
);
create unique index if not exists uq_approval_document_events_source_id
  on public.approval_document_events (document_id, source_system, source_event_id)
  where source_event_id is not null;
create index if not exists idx_approval_document_events_timeline
  on public.approval_document_events (document_id, occurred_at, source_sequence);
create index if not exists idx_approval_document_events_actor
  on public.approval_document_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

-- 대상 문서가 아직 다른 백업에 있어 FK로 연결할 수 없는 관계를 보관한다.
create table if not exists public.approval_legacy_document_links (
  id                         uuid primary key default gen_random_uuid(),
  document_id                uuid not null references public.approval_legacy_documents(document_id),
  source_link_key            text,
  target_source_document_no  text,
  target_document_code       text,
  target_title_snapshot      text,
  target_actor_name_snapshot text,
  resolved_document_id       uuid references public.approval_documents(id),
  source_metadata            jsonb not null default '{}'::jsonb
                                 check (jsonb_typeof(source_metadata) = 'object'),
  created_at                 timestamptz not null default now(),
  check (
    target_source_document_no is not null
    or target_document_code is not null
    or resolved_document_id is not null
  )
);
create unique index if not exists uq_approval_legacy_document_link_source_key
  on public.approval_legacy_document_links (document_id, source_link_key)
  where source_link_key is not null;
create index if not exists idx_approval_legacy_document_links_target
  on public.approval_legacy_document_links (target_source_document_no)
  where target_source_document_no is not null and resolved_document_id is null;

-- 공통 attachments 행과 하이웍스 원본 파일 경로/체크섬의 1:1 대응.
create table if not exists public.approval_legacy_attachment_refs (
  attachment_id       uuid primary key references public.attachments(id),
  document_id         uuid not null references public.approval_legacy_documents(document_id),
  source_download_url text not null check (source_download_url <> ''),
  original_file_name  text not null check (original_file_name <> ''),
  source_size_label   text,
  source_sha256       text
                          check (source_sha256 is null or source_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  source_metadata     jsonb not null default '{}'::jsonb
                          check (jsonb_typeof(source_metadata) = 'object'),
  created_at          timestamptz not null default now(),
  unique (document_id, source_download_url)
);
create index if not exists idx_approval_legacy_attachment_refs_document
  on public.approval_legacy_attachment_refs (document_id);

-- ---------------------------------------------------------------------
-- RLS: 원본은 현재 approval_documents의 열람 경계를 그대로 따른다.
-- import/update/delete는 service_role 배치만 수행하며 authenticated 정책을 열지 않는다.
-- ---------------------------------------------------------------------
alter table public.approval_legacy_import_batches enable row level security;
alter table public.approval_legacy_actors enable row level security;
alter table public.approval_legacy_actor_mappings enable row level security;
alter table public.approval_legacy_documents enable row level security;
alter table public.approval_legacy_participants enable row level security;
alter table public.approval_document_events enable row level security;
alter table public.approval_legacy_document_links enable row level security;
alter table public.approval_legacy_attachment_refs enable row level security;

create policy approval_legacy_batches_select
  on public.approval_legacy_import_batches for select
  using (app.is_admin());

create policy approval_legacy_documents_select
  on public.approval_legacy_documents for select
  using (app.can_read_approval(document_id));

create policy approval_legacy_participants_select
  on public.approval_legacy_participants for select
  using (app.can_read_approval(document_id));

create policy approval_document_events_select
  on public.approval_document_events for select
  using (app.can_read_approval(document_id));

create policy approval_legacy_document_links_select
  on public.approval_legacy_document_links for select
  using (app.can_read_approval(document_id));

create policy approval_legacy_attachment_refs_select
  on public.approval_legacy_attachment_refs for select
  using (app.can_read_approval(document_id));

-- 문서에서 볼 수 있는 과거 이름은 노출하되 이메일 매핑 정보는 관리자/본인만 본다.
create policy approval_legacy_actors_select
  on public.approval_legacy_actors for select
  using (
    app.is_admin()
    or exists (
      select 1
        from public.approval_legacy_participants p
       where p.actor_id = approval_legacy_actors.id
         and app.can_read_approval(p.document_id)
    )
  );

create policy approval_legacy_actor_mappings_select
  on public.approval_legacy_actor_mappings for select
  using (
    app.is_admin()
    or mapped_user_id = app.current_app_user_id()
  );

-- RLS와 별개로 클라이언트의 쓰기/삭제 권한을 회수한다. service_role은 이를 우회해
-- 검증된 import job에서만 53,000건 배치를 적재한다.
revoke all on table
  public.approval_legacy_import_batches,
  public.approval_legacy_actors,
  public.approval_legacy_actor_mappings,
  public.approval_legacy_documents,
  public.approval_legacy_participants,
  public.approval_document_events,
  public.approval_legacy_document_links,
  public.approval_legacy_attachment_refs
from anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.approval_legacy_import_batches,
  public.approval_legacy_actors,
  public.approval_legacy_actor_mappings,
  public.approval_legacy_documents,
  public.approval_legacy_participants,
  public.approval_document_events,
  public.approval_legacy_document_links,
  public.approval_legacy_attachment_refs
from authenticated;

grant select on table
  public.approval_legacy_import_batches,
  public.approval_legacy_actors,
  public.approval_legacy_actor_mappings,
  public.approval_legacy_documents,
  public.approval_legacy_participants,
  public.approval_document_events,
  public.approval_legacy_document_links,
  public.approval_legacy_attachment_refs
to authenticated;

comment on table public.approval_legacy_import_batches is
  '하이웍스 전자결재 백업 적재 배치. 원본 private archive 경로·체크섬·진행률을 보관한다.';
comment on table public.approval_legacy_actors is
  '계정이 없어도 과거 이름·부서·직급을 보존하는 하이웍스 행위자 원장.';
comment on table public.approval_legacy_actor_mappings is
  '레거시 행위자의 이메일·현재 users UUID 대응. 개인정보라 문서 표시 원장과 분리한다.';
comment on table public.approval_legacy_documents is
  'approval_documents와 1:1인 하이웍스 원본 HTML·인쇄·결재선·삭제 스냅샷.';
comment on table public.approval_legacy_participants is
  '하이웍스 결재선 HTML에서 파싱한 문서 당시 참여자 스냅샷.';
comment on table public.approval_document_events is
  '기안·승인·확인·본문/결재선 수정·삭제를 시간순으로 보존하는 append-only 이벤트 원장.';
comment on table public.approval_legacy_document_links is
  '아직 복원되지 않은 대상까지 허용하는 하이웍스 연결 문서 참조.';
comment on table public.approval_legacy_attachment_refs is
  '공통 attachments와 하이웍스 원본 파일 경로·체크섬 대응.';
