-- =====================================================================
-- 상호 참조 문서(approval_document_links)
-- - 목적: 전자결재 문서끼리 "관련 문서"로 서로를 가리킨다. 지출결의서가 근거가 된
--   품의서를, 변경 계약이 원 계약을 참조하는 식이다.
-- - 상호성: 참조는 **방향이 없는 관계**다. A 상세에서 B를 걸면 B 상세에도 A가 보여야
--   한다. 그래서 두 행(A→B, B→A)을 쓰지 않는다 — 두 벌이 되면 한쪽만 지워졌을 때
--   어느 쪽이 진짜인지 판정할 근거가 없고, 목록이 어긋난 채로 계속 살아 있게 된다.
--   행은 쌍마다 하나이며, 조회가 양방향(`a = 나 or b = 나`)으로 편다.
-- - 중복 방지: 같은 쌍이 (A,B)와 (B,A) 두 번 들어오는 것을 막기 위해 정렬을 강제한다
--   (CHECK a < b). 유일 인덱스만으로는 순서를 뒤집은 두 번째 행을 걸러내지 못한다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: management(전자결재 원장과 동일).
--   · 데이터 등급: Internal. 접근 주체: 내부 사용자.
--   · Scope: 문서 단건. **읽기와 쓰기의 경계가 다르다.**
--     - 읽기: 기존 app.can_read_approval() 양쪽 — 열람할 수 있는 문서끼리의 관계는
--       열람할 수 있어야 한다(첨부·의견과 같은 경계).
--     - 쓰기: app.is_approval_participant() 양쪽 — 문서를 엮는 것은 그 문서에 대한
--       판단이라, 같은 부서라서 보이는 것만으로는 부족하다. 내가 **당사자**인 문서
--       (기안·결재선·참조)끼리만 엮을 수 있다.
--   · RLS 즉시 활성화 / SELECT·INSERT·UPDATE 정책 분리 / DELETE 정책 없음(soft delete).
--   · 양쪽 모두를 요구하는 이유: 한쪽만 되는 사람이 링크를 걸면, 상대 문서 상세에
--     자기가 권한 없는 문서의 존재가 드러난다(존재 노출).
--   · 해제(UPDATE deleted_at)도 생성과 같은 조건. GRANT는 신규 헬퍼 1개에만.
--   · 감사 로그: 해당 없음(개인정보·다운로드·Export·권한 변경 아님).
-- =====================================================================

-- [업무] 이 문서의 **당사자**인가 — 기안자 / 결재선(결재·합의·재무합의) / 참조자.
--        can_read_approval()과 달리 같은 부서·워크스페이스 열람 권한은 당사자로 치지 않는다.
--        읽을 수 있다는 것과 그 문서를 두고 판단할 자리에 있다는 것은 다른 사실이다.
create or replace function app.is_approval_participant(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
           select 1
             from public.approval_documents d
            where d.id = target_document_id
              and d.deleted_at is null
              and d.drafter_id = app.current_app_user_id()
         )
      or app.is_approval_approver(target_document_id)
      or app.is_approval_recipient(target_document_id);
$$;
revoke all on function app.is_approval_participant(uuid) from public;
grant execute on function app.is_approval_participant(uuid) to authenticated;

create table if not exists public.approval_document_links (
  id           uuid primary key default gen_random_uuid(),
  -- 쌍은 늘 (작은 id, 큰 id) 순서로 저장한다. 아래 CHECK가 이를 강제한다.
  document_a   uuid not null references public.approval_documents(id) on delete cascade,
  document_b   uuid not null references public.approval_documents(id) on delete cascade,
  /** 왜 엮었는지(선택). 예: '이 지출의 근거 품의'. */
  note         text,
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint approval_document_links_ordered check (document_a < document_b)
);

-- 살아 있는 쌍은 하나뿐이다. 해제 후 다시 걸 수 있어야 하므로 deleted_at is null에만 건다.
create unique index if not exists uq_approval_document_links_pair
  on public.approval_document_links (document_a, document_b)
  where deleted_at is null;
create index if not exists idx_approval_document_links_a
  on public.approval_document_links (document_a) where deleted_at is null;
create index if not exists idx_approval_document_links_b
  on public.approval_document_links (document_b) where deleted_at is null;

comment on table public.approval_document_links is
  '전자결재 문서 간 상호 참조. 쌍마다 행 하나이며 (document_a < document_b)로 정렬 저장한다. '
  '조회는 양방향으로 편다 — 참조는 방향이 없는 관계다.';

alter table public.approval_document_links enable row level security;

-- 조회: 양쪽 문서를 모두 읽을 수 있어야 한다. 한쪽만 읽을 수 있으면 그 링크는 보이지 않는다.
drop policy if exists approval_document_links_select on public.approval_document_links;
create policy approval_document_links_select on public.approval_document_links for select
  using (
    app.can_read_approval(document_a)
    and app.can_read_approval(document_b)
  );

-- 생성: **양쪽 문서의 당사자**여야 한다(기안·결재선·참조). 같은 부서라서 보이는 문서를
-- 끌어다 붙일 수는 없다 — 문서를 엮는 것은 그 문서에 대한 판단이기 때문이다.
drop policy if exists approval_document_links_insert on public.approval_document_links;
create policy approval_document_links_insert on public.approval_document_links for insert
  with check (
    app.is_approval_participant(document_a)
    and app.is_approval_participant(document_b)
    and created_by = app.current_app_user_id()
  );

-- 해제(soft delete): 생성과 같은 조건. 물리 삭제 경로는 두지 않는다.
drop policy if exists approval_document_links_update on public.approval_document_links;
create policy approval_document_links_update on public.approval_document_links for update
  using (
    app.is_approval_participant(document_a)
    and app.is_approval_participant(document_b)
  )
  with check (
    app.is_approval_participant(document_a)
    and app.is_approval_participant(document_b)
  );
