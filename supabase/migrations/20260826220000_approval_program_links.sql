-- =====================================================================
-- 결재 문서 ↔ 워크스페이스 프로젝트 연동(approval_program_links)
--
-- 목적: 결재 문서 1건에 AC/M&A/PROJECT 사업(프로젝트) N건을 걸어 둔다. 지출결의서가
--   어느 사업의 비용인지, 계약 품의가 어느 딜의 것인지를 결재자가 문서 안에서 바로 안다.
--
-- 상호 참조 문서(approval_document_links)와 다른 축이다. 저쪽은 **결재 문서끼리**의
-- 방향 없는 관계라 쌍마다 행이 하나지만, 이쪽은 **결재 문서 → 사업 원장**을 가리키는
-- 방향 있는 참조다(사업이 결재 문서를 거느리는 것이 아니라, 결재 문서가 자기 소속을
-- 밝히는 것이다). 그래서 쌍 정렬·양방향 펴기가 없고 document_id가 늘 왼쪽에 선다.
--
-- 다형 참조: 사업 원장 3종이 물리적으로 분리되어 있어 FK 컬럼을 셋 늘리는 대신
--   (target_type, target_id) 한 쌍으로 받는다 — meeting_minute_links와 같은 규약이며
--   값도 사업 원장의 entityKey를 그대로 쓴다(program / ma_program / project_program).
--   회의록과 달리 스타트업·펀드·네트워크는 받지 않는다(CHECK로 3종 고정): 결재 문서가
--   밝히는 소속은 "어느 사업의 일인가" 하나이고, 대상을 넓히면 이 열이 무엇을 뜻하는지가
--   문서마다 달라진다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: management(전자결재 원장과 동일). 데이터 등급: Internal.
--   · Scope: 문서 단건 + 대상 사업 단건. **읽기와 쓰기의 경계가 다르다.**
--     - 읽기: app.can_read_approval(document_id) 한 줄. 링크는 결재 문서의 속성이므로
--       문서를 읽을 수 있으면 그 문서가 어느 사업의 일인지도 읽을 수 있어야 한다.
--       **사업 제목은 이 행에 담기지 않는다** — 화면이 각 원장을 따로 조회해 채우므로
--       그 워크스페이스 열람 권한이 없는 사람에게는 제목이 비어 '접근 권한 없음'으로
--       표시된다(회의록 연동과 동일한 처리). 즉 이 정책이 사업 내용을 흘리지 않는다.
--     - 쓰기: app.is_approval_participant(document_id)(기안·결재선·참조)  **그리고**
--       대상 사업을 실제로 열람할 수 있을 것(app.can_link_entity_target). 문서를 사업에
--       거는 것은 그 사업에 대한 판단이라, 같은 부서라서 문서가 보이는 것만으로는 부족하고
--       id를 찍어 보는 것만으로 남의 워크스페이스 사업에 붙일 수도 없어야 한다.
--   · RLS 즉시 활성화 / SELECT·INSERT·UPDATE 정책 분리 / DELETE 정책 없음(soft delete).
--   · 신규 SECURITY DEFINER 함수 1개(app.can_link_entity_target) — 기존
--     app.can_link_minute_target의 본문을 이름만 일반화해 옮긴 것이며 판정은 동일하다.
--     GRANT는 authenticated 한정. 감사 로그 대상 아님(개인정보·Export·권한 변경 아님).
--
-- 근거: 20260723220000_meeting_minute_links.sql(다형 링크·대상 열람 재검증),
--       20260826210000_approval_document_links.sql(is_approval_participant),
--       20260826130000_approval_forms_docboxes.sql(can_read_approval)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 대상 열람 판정 헬퍼의 일반화
--     "요청자가 이 원장 행을 볼 수 있는가"는 회의록만의 질문이 아니다. 결재 연동이
--     같은 판정을 필요로 하므로, 본문을 회의록 이름에서 떼어 낸다. 복사해 두 벌로
--     들고 있으면 원장이 하나 늘거나 정책이 바뀔 때 한쪽만 고쳐져 권한 구멍이 된다.
--     기존 이름(can_link_minute_target)은 호출부(set_minute_links)가 그대로 쓰므로
--     위임 껍데기로 남긴다.
-- ---------------------------------------------------------------------
create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'project_program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
      and exists (select 1 from public.project_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$$;
revoke all on function app.can_link_entity_target(text, uuid) from public;
grant execute on function app.can_link_entity_target(text, uuid) to authenticated;

comment on function app.can_link_entity_target(text, uuid) is
  '요청자가 연동 대상 원장 행을 열람 가능한가(각 원장 SELECT 정책 재현 + 소프트삭제·미존재 배제). '
  '회의록 연동·결재 프로젝트 연동이 공유한다.';

-- 회의록 헬퍼는 이름만 남기고 판정을 위임한다(호출부 무변경).
create or replace function app.can_link_minute_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.can_link_entity_target(p_target_type, p_target_id);
$$;
revoke all on function app.can_link_minute_target(text, uuid) from public;
grant execute on function app.can_link_minute_target(text, uuid) to authenticated;

comment on function app.can_link_minute_target(text, uuid) is
  'app.can_link_entity_target()에 위임하는 회의록 전용 별칭(set_minute_links 호출부 유지용).';

-- ---------------------------------------------------------------------
-- (2) 연동 원장
-- ---------------------------------------------------------------------
create table if not exists public.approval_program_links (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.approval_documents(id) on delete cascade,
  -- 사업 원장의 entityKey. FK를 걸 수 없는 다형 참조이므로 존재 여부는
  -- app.can_link_entity_target()이 쓰기 시점에 확인한다.
  target_type  text not null
    check (target_type in ('program', 'ma_program', 'project_program')),
  target_id    uuid not null,
  /** 왜 거는지(선택). 예: '이 사업의 3분기 운영비'. */
  note         text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- 살아 있는 연동은 대상마다 하나뿐이다. 해제 후 다시 걸 수 있어야 하므로 부분 인덱스로 건다.
create unique index if not exists uq_approval_program_links_target
  on public.approval_program_links (document_id, target_type, target_id)
  where deleted_at is null;
create index if not exists idx_approval_program_links_document
  on public.approval_program_links (document_id) where deleted_at is null;
-- 역방향(사업 → 결재 문서) 조회 축. 사업 상세에 '관련 결재 문서'를 놓을 때 쓴다.
create index if not exists idx_approval_program_links_target
  on public.approval_program_links (target_type, target_id) where deleted_at is null;

comment on table public.approval_program_links is
  '전자결재 문서 ↔ 사업(AC/M&A/PROJECT) 다형 연동. 방향 있는 참조라 document_id가 늘 왼쪽이다. '
  '읽기 app.can_read_approval(문서), 쓰기 app.is_approval_participant(문서) + app.can_link_entity_target(대상).';

alter table public.approval_program_links enable row level security;

-- 조회: 문서를 읽을 수 있으면 그 문서의 연동도 읽는다. 대상 사업의 제목·내용은 이 행에
-- 없으므로(화면이 각 원장을 따로 조회한다) 이 정책이 사업 내용을 노출하지 않는다.
drop policy if exists approval_program_links_select on public.approval_program_links;
create policy approval_program_links_select on public.approval_program_links for select
  using (app.can_read_approval(document_id));

-- 생성: 문서의 당사자 + 대상 사업 열람 가능. 둘 다여야 한다.
drop policy if exists approval_program_links_insert on public.approval_program_links;
create policy approval_program_links_insert on public.approval_program_links for insert
  with check (
    app.is_approval_participant(document_id)
    and app.can_link_entity_target(target_type, target_id)
    and created_by = app.current_app_user_id()
  );

-- 해제(soft delete): 생성과 같은 조건. 물리 삭제 경로는 두지 않는다.
-- 대상 열람 조건을 해제에도 거는 이유는 생성과 대칭을 지키기 위함이다 — 걸 수 없는 대상을
-- 뗄 수 있으면, 권한을 잃은 사람이 남의 워크스페이스 소속 표시를 지울 수 있다.
drop policy if exists approval_program_links_update on public.approval_program_links;
create policy approval_program_links_update on public.approval_program_links for update
  using (
    app.is_approval_participant(document_id)
    and app.can_link_entity_target(target_type, target_id)
  )
  with check (
    app.is_approval_participant(document_id)
    and app.can_link_entity_target(target_type, target_id)
  );
