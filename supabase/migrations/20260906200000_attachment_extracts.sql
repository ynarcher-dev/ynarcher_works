-- =====================================================================
-- 자료 분석 캐시 — public.attachment_extracts (2026-09-06)
--
-- 무엇인가:
--   'AI 작성하기'가 자료에서 뽑아 낸 **글자와 표**를 첨부 한 건당 한 줄로 갖는다. 종전에는
--   실행할 때마다 스토리지에서 다시 내려받고 다시 열었고, 요청이 둘 이상이면 Files API에
--   다시 올렸다. 담당자가 카드 하나를 고쳐 다시 누르면 같은 30MB가 같은 길을 한 번 더 갔다.
--
-- 왜 표인가(스토리지 JSON이 아니라):
--   격자가 열릴 때 자료마다 분석 상태를 알아야 하는데, 스토리지면 그것이 목록 호출 N번이 된다.
--   표면 `in (…)` 한 번이다. 경로 기반 정책을 따로 세울 일도 없다.
--
-- 캐시 키는 attachment_id + parser_version 이다:
--   첨부는 교체 기능이 없어 불변이다(업로드가 새 행이고 삭제는 deleted_at). 그래서 파일 해시는
--   무효화 축이 아니라 **기록**이며, 무효화는 파서 버전이 한다. 서버가 해시를 다시 재려면
--   30MB를 다시 내려받아야 하므로 재지 않는다 — 클라이언트가 계산해 보낸 값을 그대로 적는다.
--
-- 이 표의 데이터 등급은 원본과 같다:
--   추출된 글자는 원본 자료의 내용 그 자체다. 그래서 **권한도 원본과 같다** — SELECT는
--   attachments의 SELECT 정책에 통째로 위임한다(정책 표현식 안의 서브쿼리에는 참조 표의 RLS가
--   그대로 걸린다). 조건을 여기 복제하면 attachments 정책이 좁아지는 날 이 표만 옛 규칙으로
--   답하고, 어긋난 것을 알려 주는 것이 아무것도 없다.
--
-- 쓰기 정책을 만들지 않는다:
--   유일한 쓰기 경로는 분석 결과를 받는 Edge Function(startup-material-extract)이며
--   service_role로 넣는다. 정책을 열면 브라우저가 직접 INSERT를 쏠 수 있고, 그러면 그 함수가
--   하는 검증(첨부 행과의 일치·스키마·총량·파서 버전·제어문자)이 통째로 우회된다.
--   **브라우저가 보낸 분석 결과는 신뢰할 수 없는 입력**이므로 그 검증이 유일한 관문이다.
--
-- 하드 삭제인 이유(물리 삭제 금지 원칙의 예외):
--   여기 담기는 것은 업무 기록이 아니라 **원본에서 언제든 다시 만들 수 있는 파생물**이다.
--   모듈 인스턴스를 하드 딜리트한 근거('지워지는 것이 기록이 아니라 그릇이다')와 같은 계통이며,
--   원본이 지워졌는데 글자만 남으면 **볼 수 없는 자료의 내용이 읽히는 행**이 된다. 그래서
--   하드 딜리트는 FK가(행 삭제), 소프트 딜리트는 아래 트리거가 따라간다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: 다형 — 원본 첨부(target_type)가 답한다. 이 표는 스스로 판정하지 않는다
--   - 데이터 등급: 원본과 동일(Internal ~ Restricted). 추출 글자는 원본 내용 그 자체다
--   - 접근 주체: 원본 첨부를 볼 수 있는 주체와 정확히 같다(attachments_select에 위임)
--   - Scope 기준: 없음(위임)
--   - 감사 로그: **분석은 반출이 아니다.** 우리 쪽에서 끝나고 밖으로 나가는 것이 없다.
--     access_logs는 실제로 모델에 보내는 작성 단계에서만 적재한다(3_3_5 §16.7)
--   - 신규 테이블: 1종(RLS 활성, Default Deny, SELECT 하나만)
--   - 신규 정책: SELECT 1종. INSERT/UPDATE/DELETE 정책 없음(service_role 전용)
--   - DELETE 정책: 없음 — 삭제는 FK cascade와 트리거만
--   - SECURITY DEFINER 함수: 1종(트리거 전용, 인자 없음, app 스키마, 호출 권한 미부여)
--   - 운영 영향: 신규 표라 기존 행 없음. 캐시가 비어도 기능은 옛 경로(원본 분석)로 동작한다
-- =====================================================================

-- ── (1) 원장 ──────────────────────────────────────────────────────────
create table if not exists public.attachment_extracts (
  attachment_id  uuid primary key references public.attachments(id) on delete cascade,
  -- 무효화 축. 파서가 달라지면 같은 파일이라도 다른 글자가 나오므로 캐시를 못 믿는다.
  parser_version text        not null,
  -- 분석한 쪽이 계산해 보낸 SHA-256. 무효화에 쓰지 않고 "무엇을 분석한 결과인가"의 기록이다.
  content_hash   text,
  byte_size      bigint,
  mime           text,
  -- ready = 쓸 수 있는 글자가 있다 / failed = 열지 못했다 / original = 우리가 열지 않고 원본을
  -- 그대로 모델에 보내는 자료다(PDF·이미지, PDF로 내보내지는 구글 문서). 셋을 한 축에 두는
  -- 이유는 화면이 묻는 것이 하나여서다 — "이 줄은 지금 어떤 상태인가".
  status         text        not null check (status in ('ready', 'failed', 'original')),
  -- 화면이 "시트 3 · 표 5"로 세우는 건수. 본문을 내려받지 않고 상태 줄을 그리기 위한 칸이다.
  summary        jsonb       not null default '{}'::jsonb,
  -- { chunks: [{ kind, location, text, tables }] }. 표를 2차원 배열로도 두는 이유는
  -- 예산을 넘겨 골라 보낼 때 표 단위로 고를 수 있어야 하기 때문이다.
  body           jsonb,
  failed_reason  text,
  analyzed_by    uuid        references public.users(id),
  analyzed_at    timestamptz not null default now()
);

comment on table public.attachment_extracts is
  'AI 작성하기의 자료 분석 캐시(첨부 1건 = 1행). 원본에서 다시 만들 수 있는 파생물이라 원본이 지워지면 함께 지운다. 권한은 원본 첨부와 같다.';
comment on column public.attachment_extracts.parser_version is
  '캐시 무효화 축. 이 값이 서버가 아는 현재 값과 다르면 화면이 재분석 필요로 세운다.';
comment on column public.attachment_extracts.content_hash is
  '분석한 쪽이 계산한 SHA-256(기록용). 첨부는 교체되지 않아 불변이므로 무효화 판정에는 쓰지 않는다.';
comment on column public.attachment_extracts.body is
  '추출 결과 { chunks: [{ kind, location, text, tables }] }. 원본 내용 그 자체이므로 등급도 원본과 같다.';
comment on column public.attachment_extracts.summary is
  '화면 표시용 건수(sheets/paragraphs/slides/tables/pages/chars). 본문 없이 상태 줄을 그리기 위해 따로 둔다.';

-- 성공 행에는 본문이, 실패 행에는 사유가 반드시 있다. 이 제약이 없으면 "완료라고 적혀
-- 있는데 읽을 것이 없는" 행이 조용히 생겨, 작성 단계가 근거 없이 모델을 부른다.
alter table public.attachment_extracts drop constraint if exists attachment_extracts_shape;
alter table public.attachment_extracts
  add constraint attachment_extracts_shape check (
    (status = 'ready'    and body is not null)
    or
    (status = 'failed'   and failed_reason is not null)
    or
    (status = 'original' and body is null)
  );

comment on constraint attachment_extracts_shape on public.attachment_extracts is
  '완료 행에는 본문이, 실패 행에는 사유가 있다. 반쪽 행은 "완료인데 읽을 것이 없는" 자료가 된다.';

-- 격자는 자료 여러 건의 상태를 한 번에 묻는다(attachment_id in (…)). PK가 그대로 답한다.

-- ── (2) RLS — 원본과 같은 권한, 쓰기 정책 없음 ────────────────────────
alter table public.attachment_extracts enable row level security;

drop policy if exists attachment_extracts_select on public.attachment_extracts;
create policy attachment_extracts_select on public.attachment_extracts for select
  using (
    exists (
      select 1
      from public.attachments a
      where a.id = attachment_extracts.attachment_id
        and a.deleted_at is null
    )
  );

comment on policy attachment_extracts_select on public.attachment_extracts is
  '원본 첨부를 볼 수 있으면 그 글자도 볼 수 있다. 조건을 복제하지 않고 attachments의 SELECT 정책에 위임한다(서브쿼리에는 참조 표의 RLS가 그대로 걸린다).';

-- INSERT/UPDATE/DELETE 정책을 만들지 않는다 → Default Deny.
-- 쓰기는 startup-material-extract Edge Function이 service_role로만 한다. 정책을 열면
-- 그 함수의 검증(원장 일치·스키마·총량·파서 버전·제어문자)이 통째로 우회된다.

-- ── (3) 소프트 삭제를 따라간다 ────────────────────────────────────────
-- FK의 on delete cascade는 하드 삭제만 따라간다. 이 프로젝트의 자료 삭제는 deleted_at을
-- 채우는 일이라, 그것을 따로 따라가지 않으면 **볼 수 없는 자료의 글자가 남는다.**
create or replace function app.purge_attachment_extract()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from public.attachment_extracts where attachment_id = new.id;
  return null;
end;
$$;

comment on function app.purge_attachment_extract() is
  '첨부가 소프트 삭제되면 그 분석 캐시를 지운다. 파생물이라 되살릴 이유가 없고, 남기면 볼 수 없는 자료의 내용이 읽히는 행이 된다.';

-- 트리거 전용 함수라 아무에게도 실행 권한을 주지 않는다(트리거는 소유자 권한으로 돈다).
revoke all on function app.purge_attachment_extract() from public;

drop trigger if exists trg_attachments_purge_extract on public.attachments;
create trigger trg_attachments_purge_extract
  after update of deleted_at on public.attachments
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function app.purge_attachment_extract();
