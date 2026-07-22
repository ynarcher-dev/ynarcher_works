-- =====================================================================
-- 코멘트 @멘션: 본인 태그 허용
-- - 20260722120000_notifications_and_mentions.sql의 팬아웃 트리거는 작성자 자신을
--   알림 대상에서 제외했다. 자기 코멘트에 스스로 태그해 알림을 남기는(메모/북마크)
--   용도를 허용하기 위해 작성자 제외 조건만 제거한다.
-- - 이미 적용된 원 마이그레이션은 불변으로 두고, create or replace로 함수만 교체한다
--   (신규 DB는 원본 생성 → 본 마이그레이션 교체 순으로 동일 최종 상태에 도달).
-- 보안 게이트: 새 테이블/정책 없음. SECURITY DEFINER 함수 search_path 고정 유지.
-- =====================================================================

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
  join public.users u on u.id = m.uid and u.deleted_at is null;
  -- 작성자 제외 조건 제거 — 본인 태그도 알림을 남긴다.

  return NEW;
end $$;
