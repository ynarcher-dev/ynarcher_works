-- =====================================================================
-- 인앱 알림 원장(notifications) + 코멘트 @멘션 팬아웃
-- - 코멘트(entity_feedback)에서 @로 임직원을 태그하면, 태그된 사람에게
--   상단바 종 아이콘이 여는 인앱 알림으로 뜨게 한다(요청 기능).
-- - 멘션 대상은 자동완성으로 사용자가 명시 선택한 값이므로 파생값이 아니라 입력값.
--   본문 텍스트 파싱은 취약하므로 대상 user id 배열을 컬럼에 담는다.
-- - 알림 원장의 소유자는 화면이 아니라 DB 트리거다(기여 로그와 동일 규약).
--   클라이언트는 notifications에 직접 INSERT하지 않는다 — 팬아웃 트리거만 생성한다.
-- 근거: 20260707240000_entity_feedback.sql(다형 코멘트/스탬프 트리거 패턴),
--       docs/docs_dev/11_migration_security_gate.md(보안 게이트)
--
-- 보안 게이트 메모
--  · 소유 워크스페이스: 알림은 수신자 개인 귀속(self scope). 코멘트는 networks 소유.
--  · 데이터 등급: Internal(코멘트 미리보기 120자). 개인정보 원본 없음.
--  · 접근 주체: 내부 임직원(수신자 본인만 자기 알림 조회/읽음처리).
--  · RLS: 즉시 활성화, SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft),
--         INSERT는 with check(false)로 클라이언트 직접 삽입 차단 — 팬아웃 트리거만 씀.
--  · SECURITY DEFINER: search_path 고정, 트리거 경유(entity_feedback INSERT RLS를
--    이미 통과한 요청만 팬아웃) — 별도 caller 권한검사 불필요.
-- =====================================================================

-- 1. 코멘트에 멘션 대상 컬럼 -------------------------------------------
--    자동완성으로 고른 임직원 user id들. 기본 빈 배열(멘션 없는 일반 코멘트).
alter table public.entity_feedback
  add column if not exists mentioned_user_ids uuid[] not null default '{}';

comment on column public.entity_feedback.mentioned_user_ids is
  '이 코멘트에서 @로 태그한 임직원 user id 배열. 팬아웃 트리거가 알림 생성에 사용';

-- 2. 인앱 알림 원장 ----------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id),   -- 알림 받는 사람
  actor_id     uuid references public.users(id),            -- 알림을 유발한 사람(코멘트 작성자)
  actor_name   text,                                        -- 작성자명 비정규화(users RLS 우회 표시용)
  type         text not null default 'mention',             -- 알림 유형(현재 'mention'만)
  target_type  text not null,                               -- 이동 대상 유형(코멘트 target_type 승계)
  target_id    uuid not null,                               -- 이동 대상 레코드 id
  ref_type     text,                                        -- 근거 레코드 유형('entity_feedback')
  ref_id       uuid,                                        -- 근거 레코드 id(코멘트 id)
  body_preview text,                                        -- 코멘트 앞 120자 미리보기
  read_at      timestamptz,                                 -- 읽은 시각(null=미읽음)
  created_at   timestamptz not null default now()
);

-- 최근순 목록 + 미읽음 배지 조회용 인덱스
create index if not exists idx_notifications_recipient
  on public.notifications (recipient_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;

-- 조회: 수신자 본인만 자기 알림을 본다.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (recipient_id = app.current_app_user_id());

-- 작성: 클라이언트 직접 INSERT 금지. 팬아웃 트리거(SECURITY DEFINER)만 생성한다.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (false);

-- 수정: 수신자 본인만 자기 알림을 읽음 처리(read_at 갱신)한다.
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update
  using (recipient_id = app.current_app_user_id())
  with check (recipient_id = app.current_app_user_id());

comment on table public.notifications is
  '인앱 알림 원장(수신자 개인 귀속). 소유자는 팬아웃 트리거 — 클라이언트 직접 INSERT 금지';

-- 3. 코멘트 @멘션 → 알림 팬아웃 트리거 --------------------------------
--    entity_feedback INSERT 이후, 멘션된(존재하고 미삭제) 임직원마다 알림 1건 생성.
--    · 자기 자신 멘션은 제외.  · 존재하지 않는/삭제된 대상은 join으로 자연 배제
--      (코멘트 저장 자체는 실패하지 않게 한다).
--    · author_id는 BEFORE INSERT 스탬프 트리거가 이미 채운 값을 사용한다.
create or replace function app.fanout_feedback_mentions()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.mentioned_user_ids is null or array_length(NEW.mentioned_user_ids, 1) is null then
    return NEW;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, actor_name, type,
     target_type, target_id, ref_type, ref_id, body_preview)
  select distinct u.id,
         NEW.author_id,
         NEW.author_name,
         'mention',
         NEW.target_type,
         NEW.target_id,
         'entity_feedback',
         NEW.id,
         left(NEW.body, 120)
  from unnest(NEW.mentioned_user_ids) as m(uid)
  join public.users u on u.id = m.uid and u.deleted_at is null
  where u.id is distinct from NEW.author_id;

  return NEW;
end $$;

drop trigger if exists trg_entity_feedback_fanout on public.entity_feedback;
create trigger trg_entity_feedback_fanout
  after insert on public.entity_feedback
  for each row execute function app.fanout_feedback_mentions();
