-- 비활성화 사유 기록 지원: 기여 로그 action에 'deactivated' 추가.
-- 사유는 entity_contributions.note에 저장하고, 비활성화한 사람은 서버 트리거가 user_name으로 스탬프한다.

alter table public.entity_contributions
  drop constraint if exists entity_contributions_action_chk;

alter table public.entity_contributions
  add constraint entity_contributions_action_chk
  check (action in ('created', 'merged', 'enriched', 'edited', 'deactivated'));
